// controllers/ctsd.js
const { prisma } = require('../db/prisma');

const money = (n) => Number(n || 0).toFixed(2);
const ACTIVE_STATES = ['ACTIVE', 'INVOICED'];
async function recalcBookingTotals(HDONG_MA) {
    HDONG_MA = Number(HDONG_MA);
    const ctsdRows = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA, CTSD_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTSD_TONG_TIEN: true }
    });
    const roomTotal = ctsdRows.reduce((sum, r) => sum + Number(r.CTSD_TONG_TIEN || 0), 0);
    await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA },
        data: { HDONG_TONGTIENDUKIEN: Number(roomTotal).toFixed(2) }
    });
}
async function ensureBookingEditable(HDONG_MA) {
    const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
        where: { HDONG_MA: Number(HDONG_MA) },
        select: { HDONG_TRANG_THAI: true }
    });
    if (!hd) { const e = new Error('Hợp đồng không tồn tại'); e.status = 404; throw e; }
    if (!['CONFIRMED', 'CHECKED_IN', 'PENDING'].includes(hd.HDONG_TRANG_THAI)) {
        const e = new Error('Hợp đồng không ở trạng thái cho phép thao tác'); e.status = 409; throw e;
    }
}

async function nextCTSD_STT(HDONG_MA, PHONG_MA) {
    const last = await prisma.cHI_TIET_SU_DUNG.findFirst({
        where: { HDONG_MA: Number(HDONG_MA), PHONG_MA: Number(PHONG_MA) },
        orderBy: { CTSD_STT: 'desc' },
        select: { CTSD_STT: true }
    });
    return (last?.CTSD_STT ?? 0) + 1;
}

// GET /bookings/:id/items
async function list(req, res, next) {
    try {
        const HDONG_MA = Number(req.params.id);
        const rows = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: { HDONG_MA },
            orderBy: [{ PHONG_MA: 'asc' }, { CTSD_STT: 'asc' }],
            include: { PHONG: true }
        });
        res.json(rows);
    } catch (e) { next(e); }
}

// POST /bookings/:id/items
// body (2 mode):
// - NIGHT: { PHONG_MA, DONVI:'NIGHT', NGAY: '2025-10-14', SO_LUONG, DON_GIA }
// - HOUR : { PHONG_MA, DONVI:'HOUR',  TU_GIO:'2025-10-14T13:00', DEN_GIO:'2025-10-14T17:00', SO_LUONG, DON_GIA }
async function create(req, res, next) {
    try {
        const HDONG_MA = Number(req.params.id);
        const { PHONG_MA, DONVI, NGAY, TU_GIO, DEN_GIO, SO_LUONG, DON_GIA } = req.body || {};

        await ensureBookingEditable(HDONG_MA);

        // --- VALIDATE cơ bản ---
        if (!PHONG_MA || !DONVI || !SO_LUONG || DON_GIA == null) {
            const e = new Error('Thiếu PHONG_MA / DONVI / SO_LUONG / DON_GIA'); e.status = 400; throw e;
        }
        const roomId = Number(PHONG_MA);
        if (!Number.isInteger(roomId) || roomId <= 0) {
            const e = new Error('PHONG_MA không hợp lệ'); e.status = 400; throw e;
        }

        // Chuẩn hóa input theo DONVI
        let ngay = null, tu = null, den = null;
        if (DONVI === 'NIGHT') {
            if (!NGAY) { const e = new Error('Thiếu NGAY cho đơn vị NIGHT'); e.status = 400; throw e; }
            ngay = new Date(NGAY);
            if (isNaN(ngay.getTime())) { const e = new Error('NGAY không hợp lệ'); e.status = 400; throw e; }
            // (khuyến nghị) ép về 00:00 để đồng nhất
            ngay.setHours(0, 0, 0, 0);
        } else if (DONVI === 'HOUR') {
            if (!(TU_GIO && DEN_GIO)) { const e = new Error('Thiếu TU_GIO / DEN_GIO cho đơn vị HOUR'); e.status = 400; throw e; }
            tu = new Date(TU_GIO); den = new Date(DEN_GIO);
            if (isNaN(tu.getTime()) || isNaN(den.getTime())) { const e = new Error('TU_GIO/DEN_GIO không hợp lệ'); e.status = 400; throw e; }
            if (!(tu < den)) { const e = new Error('TU_GIO phải nhỏ hơn DEN_GIO'); e.status = 400; throw e; }
        } else {
            const e = new Error('DONVI không hợp lệ (NIGHT|HOUR)'); e.status = 400; throw e;
        }

        // --- CHỐNG TRÙNG LỊCH (đẩy xuống SQL) ---
        if (DONVI === 'NIGHT') {
            // Cùng phòng, cùng ngày (và ACTIVE/INVOICED), bất kể thuộc HĐ nào → trùng
            const dup = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    PHONG_MA: roomId,
                    CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
                    // lưu ý: so sánh đúng ngày — giả định bạn luôn lưu 00:00
                    CTSD_NGAY_DA_O: ngay
                },
                select: { HDONG_MA: true, CTSD_STT: true }
            });
            if (dup) { const e = new Error('Phòng đã có người đặt trong ngày này'); e.status = 409; throw e; }
        } else {
            // HOUR: [tu, den) trùng nếu: existing.CTSD_O_TU_GIO < den && existing.CTSD_O_DEN_GIO > tu
            const conflict = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    PHONG_MA: roomId,
                    CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
                    CTSD_O_TU_GIO: { lt: den },
                    CTSD_O_DEN_GIO: { gt: tu }
                },
                select: { HDONG_MA: true, CTSD_STT: true }
            });
            if (conflict) { const e = new Error('Phòng đã được đặt trong khoảng thời gian này'); e.status = 409; throw e; }
        }

        // --- Tạo dữ liệu ---
        const stt = await nextCTSD_STT(HDONG_MA, roomId);
        const data = {
            HDONG_MA,
            PHONG_MA: roomId,
            CTSD_STT: stt,
            CTSD_SO_LUONG: Number(SO_LUONG),
            CTSD_DON_GIA: money(DON_GIA),
            CTSD_TONG_TIEN: money(Number(SO_LUONG) * Number(DON_GIA)),
            CTSD_TRANGTHAI: 'ACTIVE',
            CTSD_NGAY_DA_O: null,
            CTSD_O_TU_GIO: null,
            CTSD_O_DEN_GIO: null,
        };

        if (DONVI === 'NIGHT') {
            data.CTSD_NGAY_DA_O = ngay;
        } else {
            data.CTSD_O_TU_GIO = tu;
            data.CTSD_O_DEN_GIO = den;
        }

        const row = await prisma.cHI_TIET_SU_DUNG.create({ data, include: { PHONG: true } });
        await recalcBookingTotals(HDONG_MA);
        res.status(201).json(row);
    } catch (e) { next(e); }
}

// PUT /bookings/:id/items/:phongMa/:stt
// body: { SO_LUONG?, DON_GIA?, NGAY? | (TU_GIO?, DEN_GIO?) }
async function update(req, res, next) {
    try {
        const HDONG_MA = Number(req.params.id);
        const PHONG_MA = Number(req.params.phongMa);
        const CTSD_STT = Number(req.params.stt);

        await ensureBookingEditable(HDONG_MA);

        const current = await prisma.cHI_TIET_SU_DUNG.findUnique({
            where: { HDONG_MA_PHONG_MA_CTSD_STT: { HDONG_MA, PHONG_MA, CTSD_STT } },
            select: { CTSD_TRANGTHAI: true, CTSD_NGAY_DA_O: true, CTSD_O_TU_GIO: true, CTSD_O_DEN_GIO: true }
        });
        if (!current) { const e = new Error('Không tìm thấy CTSD'); e.status = 404; throw e; }
        if (current.CTSD_TRANGTHAI !== 'ACTIVE') { const e = new Error('CTSD đã chốt/huỷ'); e.status = 409; throw e; }

        const b = req.body || {};
        const data = {};

        // Chuẩn bị biến thời gian mới (nếu có đổi)
        let nextNgay = current.CTSD_NGAY_DA_O ? new Date(current.CTSD_NGAY_DA_O) : null;
        let nextTu = current.CTSD_O_TU_GIO ? new Date(current.CTSD_O_TU_GIO) : null;
        let nextDen = current.CTSD_O_DEN_GIO ? new Date(current.CTSD_O_DEN_GIO) : null;

        if (b.NGAY) {
            nextNgay = new Date(b.NGAY);
            if (isNaN(nextNgay.getTime())) { const e = new Error('NGAY không hợp lệ'); e.status = 400; throw e; }
            nextNgay.setHours(0, 0, 0, 0);
            // khi set NGAY → xoá giờ
            data.CTSD_NGAY_DA_O = nextNgay; data.CTSD_O_TU_GIO = null; data.CTSD_O_DEN_GIO = null;
            nextTu = nextDen = null;
        }
        if (b.TU_GIO) {
            nextTu = new Date(b.TU_GIO);
            if (isNaN(nextTu.getTime())) { const e = new Error('TU_GIO không hợp lệ'); e.status = 400; throw e; }
            data.CTSD_O_TU_GIO = nextTu; data.CTSD_NGAY_DA_O = null; nextNgay = null;
        }
        if (b.DEN_GIO) {
            nextDen = new Date(b.DEN_GIO);
            if (isNaN(nextDen.getTime())) { const e = new Error('DEN_GIO không hợp lệ'); e.status = 400; throw e; }
            data.CTSD_O_DEN_GIO = nextDen; data.CTSD_NGAY_DA_O = null; nextNgay = null;
        }

        // Nếu đang ở chế độ HOUR (có giờ), đảm bảo TU < DEN
        if (nextTu && nextDen && !(nextTu < nextDen)) {
            const e = new Error('TU_GIO phải nhỏ hơn DEN_GIO'); e.status = 400; throw e;
        }

        // Đơn giá & số lượng
        if (b.SO_LUONG != null) data.CTSD_SO_LUONG = Number(b.SO_LUONG);
        if (b.DON_GIA != null) data.CTSD_DON_GIA = money(b.DON_GIA);

        // --- CHỐNG TRÙNG LỊCH khi đổi NGAY / GIỜ ---
        if (nextNgay) {
            // NIGHT: trùng nếu đã có 1 CTSD khác cùng phòng, cùng ngày
            const dup = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    PHONG_MA,
                    CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
                    CTSD_NGAY_DA_O: nextNgay,
                    // bỏ qua chính dòng hiện tại
                    NOT: { HDONG_MA_PHONG_MA_CTSD_STT: { HDONG_MA, PHONG_MA, CTSD_STT } }
                },
                select: { HDONG_MA: true, CTSD_STT: true }
            });
            if (dup) { const e = new Error('Phòng đã có người đặt trong ngày này'); e.status = 409; throw e; }
        } else if (nextTu && nextDen) {
            // HOUR: overlap chuẩn
            const conflict = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    PHONG_MA,
                    CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
                    CTSD_O_TU_GIO: { lt: nextDen },
                    CTSD_O_DEN_GIO: { gt: nextTu },
                    NOT: { HDONG_MA_PHONG_MA_CTSD_STT: { HDONG_MA, PHONG_MA, CTSD_STT } }
                },
                select: { HDONG_MA: true, CTSD_STT: true }
            });
            if (conflict) { const e = new Error('Phòng đã được đặt trong khoảng thời gian này'); e.status = 409; throw e; }
        }

        // nếu có SL / ĐG thay đổi → cập nhật tổng
        if (data.CTSD_SO_LUONG != null || data.CTSD_DON_GIA != null) {
            const currentRow = await prisma.cHI_TIET_SU_DUNG.findUnique({
                where: { HDONG_MA_PHONG_MA_CTSD_STT: { HDONG_MA, PHONG_MA, CTSD_STT } },
                select: { CTSD_SO_LUONG: true, CTSD_DON_GIA: true }
            });
            const nextSL = data.CTSD_SO_LUONG ?? currentRow.CTSD_SO_LUONG;
            const nextDG = data.CTSD_DON_GIA != null ? Number(data.CTSD_DON_GIA) : Number(currentRow.CTSD_DON_GIA);
            data.CTSD_TONG_TIEN = money(Number(nextSL) * Number(nextDG));
        }

        const row = await prisma.cHI_TIET_SU_DUNG.update({
            where: { HDONG_MA_PHONG_MA_CTSD_STT: { HDONG_MA, PHONG_MA, CTSD_STT } },
            data,
            include: { PHONG: true }
        });
        await recalcBookingTotals(HDONG_MA);
        res.json(row);
    } catch (e) { next(e); }
}


// DELETE /bookings/:id/items/:phongMa/:stt
async function remove(req, res, next) {
    try {
        const HDONG_MA = Number(req.params.id);
        const PHONG_MA = Number(req.params.phongMa);
        const CTSD_STT = Number(req.params.stt);

        await ensureBookingEditable(HDONG_MA);

        const current = await prisma.cHI_TIET_SU_DUNG.findUnique({
            where: { HDONG_MA_PHONG_MA_CTSD_STT: { HDONG_MA, PHONG_MA, CTSD_STT } },
            select: { CTSD_TRANGTHAI: true }
        });
        if (!current) { const e = new Error('Không tìm thấy CTSD'); e.status = 404; throw e; }
        if (current.CTSD_TRANGTHAI !== 'ACTIVE') { const e = new Error('CTSD đã chốt/huỷ'); e.status = 409; throw e; }

        await prisma.cHI_TIET_SU_DUNG.delete({
            where: { HDONG_MA_PHONG_MA_CTSD_STT: { HDONG_MA, PHONG_MA, CTSD_STT } }
        });
        await recalcBookingTotals(HDONG_MA);
        res.json({ ok: true });
    } catch (e) { next(e); }
}

// POST /bookings/:id/items/:phongMa/:stt/close  → INVOICED
async function closeItem(req, res, next) {
    try {
        const HDONG_MA = Number(req.params.id);
        const PHONG_MA = Number(req.params.phongMa);
        const CTSD_STT = Number(req.params.stt);

        await ensureBookingEditable(HDONG_MA);

        const row = await prisma.cHI_TIET_SU_DUNG.update({
            where: { HDONG_MA_PHONG_MA_CTSD_STT: { HDONG_MA, PHONG_MA, CTSD_STT } },
            data: { CTSD_TRANGTHAI: 'INVOICED' },
            include: { PHONG: true }
        });
        await recalcBookingTotals(HDONG_MA);
        res.json(row);
    } catch (e) { next(e); }
}

module.exports = { list, create, update, remove, closeItem };
