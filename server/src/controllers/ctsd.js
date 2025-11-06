// controllers/ctsd.js
const { prisma } = require('../db/prisma');
const { TRANGTHAI_HOPDONG } = require('@prisma/client');


const money = (n) => Number(n || 0).toFixed(2);
const ACTIVE_STATES = ['ACTIVE', 'INVOICED'];

// helpers
const toDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
};

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
// async function create(req, res, next) {
//     try {
//         const HDONG_MA = Number(req.params.id);
//         const { PHONG_MA, DONVI, NGAY, TU_GIO, DEN_GIO, SO_LUONG, DON_GIA } = req.body || {};

//         await ensureBookingEditable(HDONG_MA);

//         // --- VALIDATE cơ bản ---
//         if (!PHONG_MA || !DONVI || !SO_LUONG || DON_GIA == null) {
//             const e = new Error('Thiếu PHONG_MA / DONVI / SO_LUONG / DON_GIA'); e.status = 400; throw e;
//         }
//         const roomId = Number(PHONG_MA);
//         if (!Number.isInteger(roomId) || roomId <= 0) {
//             const e = new Error('PHONG_MA không hợp lệ'); e.status = 400; throw e;
//         }

//         // Chuẩn hóa input theo DONVI
//         let ngay = null, tu = null, den = null;
//         if (DONVI === 'NIGHT') {
//             if (!NGAY) { const e = new Error('Thiếu NGAY cho đơn vị NIGHT'); e.status = 400; throw e; }
//             ngay = new Date(NGAY);
//             if (isNaN(ngay.getTime())) { const e = new Error('NGAY không hợp lệ'); e.status = 400; throw e; }
//             // (khuyến nghị) ép về 00:00 để đồng nhất
//             ngay.setHours(0, 0, 0, 0);
//         } else if (DONVI === 'HOUR') {
//             if (!(TU_GIO && DEN_GIO)) { const e = new Error('Thiếu TU_GIO / DEN_GIO cho đơn vị HOUR'); e.status = 400; throw e; }
//             tu = new Date(TU_GIO); den = new Date(DEN_GIO);
//             if (isNaN(tu.getTime()) || isNaN(den.getTime())) { const e = new Error('TU_GIO/DEN_GIO không hợp lệ'); e.status = 400; throw e; }
//             if (!(tu < den)) { const e = new Error('TU_GIO phải nhỏ hơn DEN_GIO'); e.status = 400; throw e; }
//         } else {
//             const e = new Error('DONVI không hợp lệ (NIGHT|HOUR)'); e.status = 400; throw e;
//         }

//         // --- CHỐNG TRÙNG LỊCH (đẩy xuống SQL) ---
//         if (DONVI === 'NIGHT') {
//             // Cùng phòng, cùng ngày (và ACTIVE/INVOICED), bất kể thuộc HĐ nào → trùng
//             const dup = await prisma.cHI_TIET_SU_DUNG.findFirst({
//                 where: {
//                     PHONG_MA: roomId,
//                     CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
//                     // lưu ý: so sánh đúng ngày — giả định bạn luôn lưu 00:00
//                     CTSD_NGAY_DA_O: ngay
//                 },
//                 select: { HDONG_MA: true, CTSD_STT: true }
//             });
//             if (dup) { const e = new Error('Phòng đã có người đặt trong ngày này'); e.status = 409; throw e; }
//         } else {
//             // HOUR: [tu, den) trùng nếu: existing.CTSD_O_TU_GIO < den && existing.CTSD_O_DEN_GIO > tu
//             const conflict = await prisma.cHI_TIET_SU_DUNG.findFirst({
//                 where: {
//                     PHONG_MA: roomId,
//                     CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
//                     CTSD_O_TU_GIO: { lt: den },
//                     CTSD_O_DEN_GIO: { gt: tu }
//                 },
//                 select: { HDONG_MA: true, CTSD_STT: true }
//             });
//             if (conflict) { const e = new Error('Phòng đã được đặt trong khoảng thời gian này'); e.status = 409; throw e; }
//         }

//         // --- Tạo dữ liệu ---
//         const stt = await nextCTSD_STT(HDONG_MA, roomId);
//         const data = {
//             HDONG_MA,
//             PHONG_MA: roomId,
//             CTSD_STT: stt,
//             CTSD_SO_LUONG: Number(SO_LUONG),
//             CTSD_DON_GIA: money(DON_GIA),
//             CTSD_TONG_TIEN: money(Number(SO_LUONG) * Number(DON_GIA)),
//             CTSD_TRANGTHAI: 'ACTIVE',
//             CTSD_NGAY_DA_O: null,
//             CTSD_O_TU_GIO: null,
//             CTSD_O_DEN_GIO: null,
//         };

//         if (DONVI === 'NIGHT') {
//             data.CTSD_NGAY_DA_O = ngay;
//         } else {
//             data.CTSD_O_TU_GIO = tu;
//             data.CTSD_O_DEN_GIO = den;
//         }

//         const row = await prisma.cHI_TIET_SU_DUNG.create({ data, include: { PHONG: true } });
//         await recalcBookingTotals(HDONG_MA);
//         res.status(201).json(row);
//     } catch (e) { next(e); }
// }


async function create(req, res, next) {
    try {
        const bookingId = Number(req.params.id);
        const {
            PHONG_MA,
            // Với HOUR: TU_GIO, DEN_GIO (ISO)
            TU_GIO, DEN_GIO,
            // Với NIGHT: NGAY (ISO lúc 12:00)
            NGAY,
            // Tên FE có thể là SO_LUONG/DON_GIA; map sang tên cột đúng bên dưới
            SO_LUONG,
            DON_GIA,
            // Nếu FE đã gửi đúng tên cột thì ưu tiên cái đúng:
            CTSD_SO_LUONG: CTSD_SO_LUONG_FE,
            CTSD_DON_GIA: CTSD_DON_GIA_FE,
        } = req.body || {};

        if (!bookingId || !PHONG_MA) {
            const e = new Error('Thiếu dữ liệu tạo chi tiết sử dụng'); e.status = 400; throw e;
        }

        // Xác định chế độ HOUR/NIGHT dựa theo input có TU_GIO/DEN_GIO hay NGAY
        const isHour = !!(TU_GIO && DEN_GIO);
        const isNight = !!NGAY;

        if (!isHour && !isNight) {
            const e = new Error('Thiếu thời gian: cần TU_GIO & DEN_GIO (HOUR) hoặc NGAY (NIGHT)'); e.status = 400; throw e;
        }

        // Parse khoảng thời gian để check overlap
        let start = null, end = null;
        if (isHour) {
            start = toDate(TU_GIO);
            end = toDate(DEN_GIO);
        } else {
            // NIGHT: 1 đêm = [NGAY(12:00), NGAY(12:00)+1d)
            start = toDate(NGAY);
            end = addDays(start, 1);
        }
        if (!(start && end) || end <= start) {
            const e = new Error('Khoảng thời gian không hợp lệ'); e.status = 400; throw e;
        }

        // Giá & số lượng
        const soLuong = Number(CTSD_SO_LUONG_FE ?? SO_LUONG ?? 1);
        const donGia = Number(CTSD_DON_GIA_FE ?? DON_GIA ?? 0);
        const tongTien = soLuong * donGia;

        // 1) CHECK CONFLICT RÕ RÀNG THEO HOUR/NIGHT
        const activeWhere = {
            PHONG_MA: Number(PHONG_MA),
            CTSD_TRANGTHAI: { in: ['ACTIVE'] },
            HOP_DONG_DAT_PHONG: {
                HDONG_TRANG_THAI: {
                    notIn: [
                        TRANGTHAI_HOPDONG.CHECKED_OUT,
                        TRANGTHAI_HOPDONG.CANCELLED,
                    ],
                },
            },
        };

        let conflict = null;

        if (isNight) {
            // Khoảng đêm: [start, end) = [NGAY(12:00), +1d)
            // 1a) Giờ giao đêm
            const hourClash = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    ...activeWhere,
                    // chỉ bắt những bản ghi có giờ
                    CTSD_O_TU_GIO: { not: null, lt: end },
                    CTSD_O_DEN_GIO: { not: null, gt: start },
                },
                select: { HDONG_MA: true, PHONG_MA: true, CTSD_STT: true },
            });

            // 1b) Đêm trùng NGAY đúng ngày (chính xác, lợi dụng uniq_ctsd_night)
            const nightSame = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    ...activeWhere,
                    CTSD_NGAY_DA_O: start, // đúng ngày trưa đó
                },
                select: { HDONG_MA: true, PHONG_MA: true, CTSD_STT: true },
            });

            conflict = hourClash || nightSame;

        } else { // isHour
            // Khoảng giờ: [start, end)
            // 2a) Giờ giao giờ
            const hourClash = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    ...activeWhere,
                    CTSD_O_TU_GIO: { not: null, lt: end },
                    CTSD_O_DEN_GIO: { not: null, gt: start },
                },
                select: { HDONG_MA: true, PHONG_MA: true, CTSD_STT: true },
            });

            // 2b) Đêm giao giờ: ta lấy về vài đêm trong dải hẹp rồi lọc chính xác bằng JS
            const approxNights = await prisma.cHI_TIET_SU_DUNG.findMany({
                where: {
                    ...activeWhere,
                    CTSD_NGAY_DA_O: {
                        // đêm có noon nằm trước 'end' và không quá xa về trước 'start'
                        lt: end,
                        gte: new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()), // ~ từ 00:00 ngày start theo local
                    },
                },
                select: { CTSD_NGAY_DA_O: true, HDONG_MA: true, PHONG_MA: true, CTSD_STT: true },
            });

            const nightClash = approxNights.find(n => {
                const ns = n.CTSD_NGAY_DA_O;               // noon
                if (!ns) return false;
                const ne = new Date(ns.getTime() + 24 * 3600 * 1000); // noon+1d
                // giao nhau chuẩn: [ns, ne) ∩ [start, end)
                return ns < end && ne > start;
            });

            conflict = hourClash || nightClash;
        }

        if (conflict) {
            // XOÁ HĐ vừa tạo để không sinh rác rồi trả 409
            await prisma.hOP_DONG_DAT_PHONG.delete({ where: { HDONG_MA: bookingId } }).catch(() => { });
            const e = new Error('Phòng đã có người đặt trong khoảng thời gian này');
            e.status = 409;
            throw e;
        }

        // 3) Lấy CTSD_STT kế tiếp trong phạm vi (HDONG_MA, PHONG_MA)
        const last = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: { HDONG_MA: bookingId, PHONG_MA: Number(PHONG_MA) },
            orderBy: { CTSD_STT: 'desc' },
            select: { CTSD_STT: true },
        });
        const nextStt = (last?.CTSD_STT ?? 0) + 1;

        // 4) Tạo CTSD (dùng đúng tên cột theo schema)
        const baseData = {
            HDONG_MA: bookingId,
            PHONG_MA: Number(PHONG_MA),
            CTSD_STT: nextStt,

            CTSD_SO_LUONG: soLuong,
            CTSD_DON_GIA: donGia,
            CTSD_TONG_TIEN: tongTien,

            CTSD_TRANGTHAI: 'ACTIVE',
        };

        const created = await prisma.cHI_TIET_SU_DUNG.create({
            data: isHour
                ? {
                    ...baseData,
                    CTSD_O_TU_GIO: start,
                    CTSD_O_DEN_GIO: end,
                    // KHÔNG gửi CTSD_NGAY_DA_O
                }
                : {
                    ...baseData,
                    CTSD_NGAY_DA_O: start,
                    // KHÔNG gửi CTSD_O_TU_GIO / CTSD_O_DEN_GIO
                },
        });

        res.status(201).json(created);
    } catch (err) { next(err); }
}


//mới
// async function create(req, res, next) {
//     try {
//         const bookingId = Number(req.params.id);
//         const {
//             PHONG_MA,
//             TU_GIO,
//             DEN_GIO,
//             NGAY,
//             SO_LUONG,
//             DON_GIA,
//             CTSD_SO_LUONG: CTSD_SO_LUONG_FE,
//             CTSD_DON_GIA: CTSD_DON_GIA_FE,
//         } = req.body || {};

//         if (!bookingId || !PHONG_MA) {
//             const e = new Error('Thiếu dữ liệu tạo chi tiết sử dụng');
//             e.status = 400;
//             throw e;
//         }

//         // Xác định hình thức: HOUR hoặc NIGHT
//         const isHour = !!(TU_GIO && DEN_GIO);
//         const isNight = !!NGAY;

//         if (!isHour && !isNight) {
//             const e = new Error('Thiếu thời gian: cần TU_GIO & DEN_GIO (HOUR) hoặc NGAY (NIGHT)');
//             e.status = 400;
//             throw e;
//         }

//         // Parse khoảng thời gian
//         let start = null, end = null;
//         if (isHour) {
//             start = toDate(TU_GIO);
//             end = toDate(DEN_GIO);
//         } else {
//             start = toDate(NGAY);
//             end = addDays(start, 1);
//         }
//         if (!(start && end) || end <= start) {
//             const e = new Error('Khoảng thời gian không hợp lệ');
//             e.status = 400;
//             throw e;
//         }

//         const soLuong = Number(CTSD_SO_LUONG_FE ?? SO_LUONG ?? 1);
//         const donGia = Number(CTSD_DON_GIA_FE ?? DON_GIA ?? 0);
//         const tongTien = soLuong * donGia;

//         // ====== CHECK CONFLICT ======
//         const activeWhere = {
//             PHONG_MA: Number(PHONG_MA),
//             CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
//             HOP_DONG_DAT_PHONG: {
//                 HDONG_TRANG_THAI: {
//                     notIn: [
//                         TRANGTHAI_HOPDONG.CHECKED_OUT,
//                         TRANGTHAI_HOPDONG.CANCELLED,
//                     ],
//                 },
//             },
//         };

//         let conflict = null;

//         if (isNight) {
//             // ✅ Theo NGÀY: chỉ kiểm tra đêm trùng
//             const nightSame = await prisma.cHI_TIET_SU_DUNG.findFirst({
//                 where: {
//                     ...activeWhere,
//                     CTSD_NGAY_DA_O: start, // cùng ngày
//                 },
//                 select: { HDONG_MA: true, PHONG_MA: true },
//             });
//             conflict = nightSame;
//         } else {
//             // ✅ Theo GIỜ: chỉ kiểm tra các CTSD có giờ (bỏ kiểm tra đêm)
//             const possible = await prisma.cHI_TIET_SU_DUNG.findMany({
//                 where: {
//                     ...activeWhere,
//                     CTSD_O_TU_GIO: { not: null, lt: end },
//                     CTSD_O_DEN_GIO: { not: null, gt: start },
//                 },
//                 select: {
//                     HDONG_MA: true,
//                     PHONG_MA: true,
//                     CTSD_O_TU_GIO: true,
//                     CTSD_O_DEN_GIO: true,
//                 },
//             });

//             // Lọc lại để bỏ những trường hợp chỉ chạm biên
//             conflict = possible.find(h => {
//                 const existingStart = new Date(h.CTSD_O_TU_GIO);
//                 const existingEnd = new Date(h.CTSD_O_DEN_GIO);
//                 return !(end <= existingStart || start >= existingEnd);
//             });
//         }

//         if (conflict) {
//             await prisma.hOP_DONG_DAT_PHONG
//                 .delete({ where: { HDONG_MA: bookingId } })
//                 .catch(() => { });
//             const e = new Error('Phòng đã có người đặt trong khoảng thời gian này');
//             e.status = 409;
//             throw e;
//         }

//         // ====== Tạo chi tiết sử dụng ======
//         const last = await prisma.cHI_TIET_SU_DUNG.findFirst({
//             where: { HDONG_MA: bookingId, PHONG_MA: Number(PHONG_MA) },
//             orderBy: { CTSD_STT: 'desc' },
//             select: { CTSD_STT: true },
//         });
//         const nextStt = (last?.CTSD_STT ?? 0) + 1;

//         const baseData = {
//             HDONG_MA: bookingId,
//             PHONG_MA: Number(PHONG_MA),
//             CTSD_STT: nextStt,
//             CTSD_SO_LUONG: soLuong,
//             CTSD_DON_GIA: donGia,
//             CTSD_TONG_TIEN: tongTien,
//             CTSD_TRANGTHAI: 'ACTIVE',
//         };

//         const created = await prisma.cHI_TIET_SU_DUNG.create({
//             data: isHour
//                 ? {
//                     ...baseData,
//                     CTSD_O_TU_GIO: start,
//                     CTSD_O_DEN_GIO: end,
//                 }
//                 : {
//                     ...baseData,
//                     CTSD_NGAY_DA_O: start,
//                 },
//         });

//         res.status(201).json(created);
//     } catch (err) {
//         next(err);
//     }
// }



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
