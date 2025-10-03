// src/controllers/ctdv.controller.js
const { prisma } = require('../db/prisma');

// helper ép số
const num = (v) => Number(v||0);
const ACTIVE_STATES = ['ACTIVE', 'INVOICED'];
async function recalcBookingTotals(HDONG_MA) {
    HDONG_MA = Number(HDONG_MA);

    // 1) Tiền phòng: lấy CTSD_TONG_TIEN (đã tính sẵn khi addNight/addHour)
    const ctsdRows = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA, CTSD_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTSD_TONG_TIEN: true }
    });
    const roomTotal = ctsdRows.reduce((sum, r) => sum + toNum(r.CTSD_TONG_TIEN), 0);

    // 2) Tiền dịch vụ: sum(CTDV_SOLUONG * CTDV_DONGIA) cho các dòng ACTIVE/INVOICED
    const ctdvRows = await prisma.cHI_TIET_DICH_VU.findMany({
        where: { HDONG_MA, CTDV_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTDV_SOLUONG: true, CTDV_DONGIA: true }
    });
    const serviceTotal = ctdvRows.reduce((sum, r) =>
        sum + (Number(r.CTDV_SOLUONG || 0) * toNum(r.CTDV_DONGIA)), 0);

    const gross = roomTotal + serviceTotal;

    // 3) Cập nhật HĐ
    const discount = await getDiscountOfBooking(HDONG_MA);
    const net = Math.max(0, gross - discount);

    // 4) Cập nhật HĐ: vẫn lưu GROSS vào HDONG_TONGTIENDUKIEN
    const updated = await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA },
        data: { HDONG_TONGTIENDUKIEN: toMoneyStr(gross) },
        select: { HDONG_MA: true }
    });


    return {
        roomTotal: toMoneyStr(roomTotal),
        serviceTotal: toMoneyStr(serviceTotal),
        gross: toMoneyStr(gross),
        discount: toMoneyStr(discount),
        net: toMoneyStr(net),
    };
}
// --- guards / helpers ---
async function getCTSDOrThrow(HDONG_MA, PHONG_MA, CTSD_STT) {
    const ctsd = await prisma.cHI_TIET_SU_DUNG.findUnique({
        where: { HDONG_MA_PHONG_MA_CTSD_STT: { HDONG_MA, PHONG_MA, CTSD_STT } },
        select: {
            HDONG_MA: true, PHONG_MA: true, CTSD_STT: true,
            CTSD_TRANGTHAI: true,
            HOP_DONG_DAT_PHONG: { select: { HDONG_TRANG_THAI: true } }
        }
    });
    if (!ctsd) {
        const e = new Error('Không tìm thấy mục sử dụng phòng (CTSD)'); e.status = 404; throw e;
    }
    // chỉ cho thêm/sửa khi CTSD đang ACTIVE và HĐ chưa CHECKED_OUT/CANCELLED
    const hdSt = ctsd.HOP_DONG_DAT_PHONG.HDONG_TRANG_THAI;
    if (ctsd.CTSD_TRANGTHAI !== 'ACTIVE' || ['CHECKED_OUT', 'CANCELLED'].includes(hdSt)) {
        const e = new Error('Không thể thao tác dịch vụ: CTSD/HĐ không ở trạng thái cho phép'); e.status = 409; throw e;
    }
    return ctsd;
}

async function getDVOrThrow(DV_MA) {
    const dv = await prisma.dICH_VU.findUnique({
        where: { DV_MA },
        select: { DV_MA: true, DV_TEN: true, DV_DONGIA: true }
    });
    if (!dv) { const e = new Error('Dịch vụ không tồn tại'); e.status = 404; throw e; }
    return dv;
}

async function nextCTDV_STT(HDONG_MA, PHONG_MA, CTSD_STT) {
    const last = await prisma.cHI_TIET_DICH_VU.findFirst({
        where: { HDONG_MA, PHONG_MA, CTSD_STT },
        orderBy: { CTDV_STT: 'desc' },
        select: { CTDV_STT: true }
    });
    return (last?.CTDV_STT ?? 0) + 1;
}

// --- handlers ---
// GET /bookings/:id/rooms/:phongMa/items/:stt/services
async function list(req, res, next) {
    try {
        const HDONG_MA = num(req.params.id);
        const PHONG_MA = num(req.params.phongMa);
        const CTSD_STT = num(req.params.stt);

        const rows = await prisma.cHI_TIET_DICH_VU.findMany({
            where: { HDONG_MA, PHONG_MA, CTSD_STT },
            orderBy: [{ CTDV_STT: 'asc' }],
            include: { DICH_VU: true }
        });
        res.json(rows);
    } catch (e) { next(e); }
}

// POST /bookings/:id/rooms/:phongMa/items/:stt/services
// body: { DV_MA, CTDV_SOLUONG, CTDV_DONGIA?, CTDV_GHICHU? }
async function create(req, res, next) {
    try {
        const HDONG_MA = num(req.params.id);
        const PHONG_MA = num(req.params.phongMa);
        const CTSD_STT = num(req.params.stt);

        await getCTSDOrThrow(HDONG_MA, PHONG_MA, CTSD_STT);

        const { DV_MA, CTDV_SOLUONG, CTDV_DONGIA, CTDV_GHICHU } = req.body || {};
        if (!DV_MA || !CTDV_SOLUONG) {
            const e = new Error('Thiếu DV_MA / CTDV_SOLUONG'); e.status = 400; throw e;
        }
        const dv = await getDVOrThrow(num(DV_MA));

        // đơn giá: dùng giá dịch vụ nếu không truyền
        const unitPrice = (CTDV_DONGIA != null) ? String(CTDV_DONGIA) : String(dv.DV_DONGIA);

        const stt = await nextCTDV_STT(HDONG_MA, PHONG_MA, CTSD_STT);

        const row = await prisma.cHI_TIET_DICH_VU.create({
            data: {
                HDONG_MA, PHONG_MA, CTSD_STT,
                DV_MA: num(DV_MA),
                CTDV_STT: stt,
                CTDV_SOLUONG: num(CTDV_SOLUONG),
                CTDV_DONGIA: unitPrice,
                CTDV_GHICHU: CTDV_GHICHU ?? null,
                // CTDV_TRANGTHAI default ACTIVE, CTDV_NGAY default now()
            },
            include: { DICH_VU: true }
        });

        const totals = await recalcBookingTotals(HDONG_MA);
        res.status(201).json({ ...row, _totals: totals });
    } catch (e) { next(e); }
}

// PUT /bookings/:id/rooms/:phongMa/items/:stt/services/:dvMa/:ctdvStt
// body: { CTDV_SOLUONG?, CTDV_DONGIA?, CTDV_GHICHU? }
async function update(req, res, next) {
    try {
        const HDONG_MA = num(req.params.id);
        const PHONG_MA = num(req.params.phongMa);
        const CTSD_STT = num(req.params.stt);
        const DV_MA = num(req.params.dvMa);
        const CTDV_STT = num(req.params.ctdvStt);

        await getCTSDOrThrow(HDONG_MA, PHONG_MA, CTSD_STT);

        const current = await prisma.cHI_TIET_DICH_VU.findUnique({
            where: { HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: { HDONG_MA, PHONG_MA, CTSD_STT, DV_MA, CTDV_STT } },
            select: { CTDV_TRANGTHAI: true }
        });
        if (!current) { const e = new Error('Không tìm thấy dòng dịch vụ'); e.status = 404; throw e; }
        if (current.CTDV_TRANGTHAI === 'INVOICED') {
            const e = new Error('Dòng dịch vụ đã lên hoá đơn, không thể sửa'); e.status = 409; throw e;
        }

        const data = {};
        if (req.body.CTDV_SOLUONG != null) data.CTDV_SOLUONG = num(req.body.CTDV_SOLUONG);
        if (req.body.CTDV_DONGIA != null) data.CTDV_DONGIA = String(req.body.CTDV_DONGIA);
        if (req.body.CTDV_GHICHU !== undefined) data.CTDV_GHICHU = req.body.CTDV_GHICHU;

        const row = await prisma.cHI_TIET_DICH_VU.update({
            where: { HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: { HDONG_MA, PHONG_MA, CTSD_STT, DV_MA, CTDV_STT } },
            data,
            include: { DICH_VU: true }
        });
        const totals = await recalcBookingTotals(HDONG_MA);
        res.json({ ...row, _totals: totals });
    } catch (e) { next(e); }
}

// DELETE /bookings/:id/rooms/:phongMa/items/:stt/services/:dvMa/:ctdvStt
async function remove(req, res, next) {
    try {
        const HDONG_MA = num(req.params.id);
        const PHONG_MA = num(req.params.phongMa);
        const CTSD_STT = num(req.params.stt);
        const DV_MA = num(req.params.dvMa);
        const CTDV_STT = num(req.params.ctdvStt);

        await getCTSDOrThrow(HDONG_MA, PHONG_MA, CTSD_STT);

        const current = await prisma.cHI_TIET_DICH_VU.findUnique({
            where: { HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: { HDONG_MA, PHONG_MA, CTSD_STT, DV_MA, CTDV_STT } },
            select: { CTDV_TRANGTHAI: true }
        });
        if (!current) { const e = new Error('Không tìm thấy dòng dịch vụ'); e.status = 404; throw e; }
        if (current.CTDV_TRANGTHAI === 'INVOICED') {
            const e = new Error('Dòng dịch vụ đã lên hoá đơn, không thể xoá'); e.status = 409; throw e;
        }

        await prisma.cHI_TIET_DICH_VU.delete({
            where: { HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: { HDONG_MA, PHONG_MA, CTSD_STT, DV_MA, CTDV_STT } }
        });
        const totals = await recalcBookingTotals(HDONG_MA);
        res.json({ ok: true, _totals: totals });
    } catch (e) { next(e); }
}

// POST /bookings/:id/rooms/:phongMa/items/:stt/services/:dvMa/:ctdvStt/cancel
// body: { lydo? }
async function cancel(req, res, next) {
    try {
        const HDONG_MA = num(req.params.id);
        const PHONG_MA = num(req.params.phongMa);
        const CTSD_STT = num(req.params.stt);
        const DV_MA = num(req.params.dvMa);
        const CTDV_STT = num(req.params.ctdvStt);

        await getCTSDOrThrow(HDONG_MA, PHONG_MA, CTSD_STT);

        const current = await prisma.cHI_TIET_DICH_VU.findUnique({
            where: { HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: { HDONG_MA, PHONG_MA, CTSD_STT, DV_MA, CTDV_STT } },
            select: { CTDV_TRANGTHAI: true }
        });
        if (!current) { const e = new Error('Không tìm thấy dòng dịch vụ'); e.status = 404; throw e; }
        if (current.CTDV_TRANGTHAI === 'INVOICED') {
            const e = new Error('Dòng dịch vụ đã lên hoá đơn, không thể huỷ'); e.status = 409; throw e;
        }

        const row = await prisma.cHI_TIET_DICH_VU.update({
            where: { HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: { HDONG_MA, PHONG_MA, CTSD_STT, DV_MA, CTDV_STT } },
            data: {
                CTDV_TRANGTHAI: 'CANCELLED',
                CTDV_HUY_LUC: new Date(),
                CTDV_HUY_LYDO: req.body?.lydo ?? null,
                // (tuỳ) CTDV_HUY_NV: req.user?.id
            },
            include: { DICH_VU: true }
        });
        const totals = await recalcBookingTotals(HDONG_MA);
        res.json({ ...row, _totals: totals });
    } catch (e) { next(e); }
}

module.exports = { list, create, update, remove, cancel };
