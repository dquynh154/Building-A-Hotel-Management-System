// src/controllers/hopdong.js
const { prisma } = require('../db/prisma');

const toNum = (v) => Number(v || 0);
const money = (n) => Number(n || 0).toFixed(2);

const ALLOW_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'];
const toDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const clampPct = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 10;
};
// (tuỳ) tổng hợp nhanh để FE hiển thị
async function summarizeBooking(HDONG_MA) {
    HDONG_MA = Number(HDONG_MA);

    // tiền phòng từ CTSD ACTIVE/INVOICED
    const ACTIVE_STATES = ['ACTIVE', 'INVOICED'];
    const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA, CTSD_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTSD_TONG_TIEN: true }
    });
    const roomTotal = ctsd.reduce((s, r) => s + toNum(r.CTSD_TONG_TIEN), 0);

    // dịch vụ từ CTDV ACTIVE/INVOICED
    const ctdv = await prisma.cHI_TIET_DICH_VU.findMany({
        where: { HDONG_MA, CTDV_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTDV_SOLUONG: true, CTDV_DONGIA: true }
    });
    const serviceTotal = ctdv.reduce((s, r) => s + (toNum(r.CTDV_DONGIA) * toNum(r.CTDV_SOLUONG)), 0);

    return {
        roomTotal: money(roomTotal),
        serviceTotal: money(serviceTotal),
        gross: money(roomTotal + serviceTotal),
    };
}

// GET /bookings
// query: search?, eq.HDONG_TRANG_THAI?, dateFrom?, dateTo?, take?, skip?
async function list(req, res, next) {
    try {
        const { take = 20, skip = 0, search, 'eq.HDONG_TRANG_THAI': eqStatus, dateFrom, dateTo } = req.query || {};
        const where = {};

        if (search && String(search).trim()) {
            const s = String(search).trim();
            where.OR = [
                { HDONG_MA: isNaN(Number(s)) ? undefined : Number(s) },
                { KHACH_HANG: { KH_HOTEN: { contains: s, mode: 'insensitive' } } },
            ].filter(Boolean);
        }

        if (eqStatus && ALLOW_STATUSES.includes(String(eqStatus))) {
            where.HDONG_TRANG_THAI = String(eqStatus);
        }

        // SỬA Ở ĐÂY: dùng HDONG_TAO_LUC đúng với schema
        if (dateFrom || dateTo) {
            where.HDONG_TAO_LUC = {};
            if (dateFrom) where.HDONG_TAO_LUC.gte = new Date(dateFrom);
            if (dateTo) where.HDONG_TAO_LUC.lte = new Date(dateTo);
        }

        const [items, total] = await Promise.all([
            prisma.hOP_DONG_DAT_PHONG.findMany({
                where,
                orderBy: { HDONG_MA: 'desc' },
                take: Number(take),
                skip: Number(skip),
                include: {
                    KHACH_HANG: true,
                    CHI_TIET_SU_DUNG: { take: 1, include: { PHONG: true } },
                }
            }),
            prisma.hOP_DONG_DAT_PHONG.count({ where })
        ]);

        res.json({ items, total });
    } catch (e) { next(e); }
}

// GET /bookings/:id
async function get(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ message: 'Thiếu hoặc id không hợp lệ' });
        }
        const row = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            include: {
                KHACH_HANG: true,
                NHAN_VIEN: true,
                HINH_THUC_THUE: true,
                CHI_TIET_SU_DUNG: {
                    orderBy: [{ PHONG_MA: 'asc' }, { CTSD_STT: 'asc' }],
                    include: {
                        PHONG: {
                            include: { LOAI_PHONG: true } // 👉 lấy luôn loại phòng
                        }
                    }
                },
                CHI_TIET_DICH_VU: {
                    orderBy: [{ CTDV_STT: 'asc' }],
                    include: { DICH_VU: true }
                },
            }
        });
        if (!row) return res.status(404).json({ message: 'Not found' });

        const sum = await summarizeBooking(id);
        res.json({ ...row, _sum: sum });
    } catch (e) { next(e); }
}

// POST /bookings
// body: { KH_MA?, NV_MA?, HDONG_TIENCOCYEUCAU?, HDONG_GHICHU?, HDONG_TRANG_THAI? }

async function create(req, res, next) {
    try {
        const {
            HT_MA, HDONG_NGAYDAT, HDONG_NGAYTRA,
            KH_MA, NV_MA,
            HDONG_TIENCOCYEUCAU, HDONG_GHICHU,
            HDONG_TRANG_THAI,
            HDONG_TONGTIENDUKIEN,
            HDONG_TILECOCAPDUNG,

        } = req.body || {};

        // 1) Validate bắt buộc theo schema
        if (!(HT_MA && HDONG_NGAYDAT && HDONG_NGAYTRA)) {
            return res.status(400).json({ message: 'Thiếu HT_MA / HDONG_NGAYDAT / HDONG_NGAYTRA' });
        }

        // 2) Ép kiểu
        const htMa = Number(HT_MA);
        const ngayDat = toDate(HDONG_NGAYDAT);
        const ngayTra = toDate(HDONG_NGAYTRA);

        if (!Number.isInteger(htMa) || htMa <= 0) {
            return res.status(400).json({ message: 'HT_MA không hợp lệ' });
        }
        if (!ngayDat || !ngayTra) {
            return res.status(400).json({ message: 'HDONG_NGAYDAT/HDONG_NGAYTRA không phải ngày hợp lệ' });
        }
        if (ngayTra <= ngayDat) {
            return res.status(400).json({ message: 'HDONG_NGAYTRA phải lớn hơn HDONG_NGAYDAT' });
        }

        // 3) Trạng thái
        const status = ALLOW_STATUSES.includes(String(HDONG_TRANG_THAI))
            ? String(HDONG_TRANG_THAI)
            : 'CONFIRMED';

        // 4) Tạo bản ghi
        const created = await prisma.hOP_DONG_DAT_PHONG.create({
            data: {
                HT_MA: htMa,
                HDONG_NGAYDAT: ngayDat,
                HDONG_NGAYTRA: ngayTra,

                KH_MA: KH_MA ? Number(KH_MA) : null,
                NV_MA: req.user?.id || (NV_MA ? Number(NV_MA) : null),

                HDONG_TIENCOCYEUCAU: HDONG_TIENCOCYEUCAU != null ? money(HDONG_TIENCOCYEUCAU) : '0.00',
                HDONG_TONGTIENDUKIEN: money(toNum(HDONG_TONGTIENDUKIEN || 0)),
                HDONG_TILECOCAPDUNG: clampPct(HDONG_TILECOCAPDUNG ?? 10), // 👈 THÊM DÒNG NÀY
                HDONG_TIENCOCYEUCAU: money(toNum(HDONG_TIENCOCYEUCAU || 0)),
                HDONG_GHICHU: HDONG_GHICHU ?? null,
                HDONG_TRANG_THAI: status,

            }
        });




        res.status(201).json(created);
    } catch (e) { next(e); }
}

// PUT /bookings/:id
// body: { KH_MA?, NV_MA?, HDONG_TIENCOCYEUCAU?, HDONG_GHICHU?, HDONG_TRANG_THAI? }
async function update(req, res, next) {
    try {
        const id = Number(req.params.id);
        const data = {};
        const b = req.body || {};

        if (b.KH_MA != null) data.KH_MA = Number(b.KH_MA);
        if (b.NV_MA != null) data.NV_MA = Number(b.NV_MA);
        if (b.HDONG_TIENCOCYEUCAU != null) data.HDONG_TIENCOCYEUCAU = money(b.HDONG_TIENCOCYEUCAU);
        if (b.HDONG_GHICHU !== undefined) data.HDONG_GHICHU = b.HDONG_GHICHU;
        if (b.HDONG_TRANG_THAI && ALLOW_STATUSES.includes(String(b.HDONG_TRANG_THAI))) {
            data.HDONG_TRANG_THAI = String(b.HDONG_TRANG_THAI);
        }

        const updated = await prisma.hOP_DONG_DAT_PHONG.update({ where: { HDONG_MA: id }, data });
        res.json(updated);
    } catch (e) { next(e); }
}

// DELETE /bookings/:id
async function remove(req, res, next) {
    try {
        const id = Number(req.params.id);
        const row = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id }, select: { HDONG_TRANG_THAI: true }
        });
        if (!row) return res.status(404).json({ message: 'Not found' });
        if (['CHECKED_IN', 'CHECKED_OUT'].includes(row.HDONG_TRANG_THAI)) {
            const err = new Error('Không thể xoá hợp đồng đã/đang lưu trú'); err.status = 409; throw err;
        }
        await prisma.hOP_DONG_DAT_PHONG.delete({ where: { HDONG_MA: id } });
        res.json({ ok: true });
    } catch (e) { next(e); }
}

// POST /bookings/:id/checkin

// async function checkin(req, res, next) {
//     try {
//         const id = Number(req.params.id);

//         const result = await prisma.$transaction(async (tx) => {
//             // 1) Đổi trạng thái HĐ + ghi thời điểm nhận thực tế
//             const hd = await tx.hOP_DONG_DAT_PHONG.update({
//                 where: { HDONG_MA: id },
//                 data: { HDONG_TRANG_THAI: 'CHECKED_IN', HDONG_NGAYTHUCNHAN: new Date() },
//                 select: { HDONG_MA: true }
//             });

//             // 2) Lấy danh sách phòng thuộc HĐ (từ CTSD)
//             const items = await tx.cHI_TIET_SU_DUNG.findMany({
//                 where: { HDONG_MA: id },
//                 select: { PHONG_MA: true }
//             });
//             const roomIds = [...new Set(items.map(i => i.PHONG_MA).filter(Boolean))];

//             // 3) Đổi trạng thái phòng -> OCCUPIED
//             if (roomIds.length) {
//                 await tx.pHONG.updateMany({
//                     where: { PHONG_MA: { in: roomIds } },
//                     data: { PHONG_TRANGTHAI: 'OCCUPIED' }  
//                 });
//             }

//             return { hd, roomIds };
//         });

//         res.json({ ok: true, ...result });
//     } catch (e) { next(e); }
// }


// POST /bookings/:id/checkin
// POST /bookings/:id/checkin
// Dùng cho khách "nhận phòng liền" (walk-in booking)

async function checkin(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { PHONG_MA } = req.body || {};
        const now = new Date();

        console.log('>>> CHECKIN (walk-in):', id, 'PHONG_MA =', PHONG_MA);

        if (!id) {
            console.log('🚨 STOP: Không có id');
            return res.status(400).json({ message: 'ID không hợp lệ' });
        }
        if (!PHONG_MA) {
            console.log('🚨 STOP: Không có PHONG_MA');
            return res.status(400).json({ message: 'Thiếu mã phòng (PHONG_MA)' });
        }

        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            select: { HDONG_TRANG_THAI: true },
        });
        if (!booking) {
            console.log('🚨 STOP: Không tìm thấy hợp đồng');
            return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });
        }
        if (!['PENDING', 'CONFIRMED'].includes(booking.HDONG_TRANG_THAI)) {
            console.log('🚨 STOP: Trạng thái hiện tại =', booking.HDONG_TRANG_THAI);
            return res.status(409).json({
                message: `Hợp đồng hiện tại (${booking.HDONG_TRANG_THAI}) không thể nhận phòng.`,
            });
        }

        const conflict = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: {
                PHONG_MA: Number(PHONG_MA),
                CTSD_TRANGTHAI: 'ACTIVE', 
                HOP_DONG_DAT_PHONG: { HDONG_TRANG_THAI: 'CHECKED_IN' },
            },
            select: { HDONG_MA: true },
        });
        if (conflict) {
            console.log('🚨 STOP: Phòng đang có HĐ CHECKED_IN', conflict.HDONG_MA);
            await prisma.hOP_DONG_DAT_PHONG.delete({ where: { HDONG_MA: id } });
            return res.status(409).json({
                message: `Phòng ${PHONG_MA} đang có khách ở trong hợp đồng ${conflict.HDONG_MA}.`,
            });
        }

        console.log('✅ Passed all checks, updating...');
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.hOP_DONG_DAT_PHONG.update({
                where: { HDONG_MA: id },
                data: {
                    HDONG_TRANG_THAI: 'CHECKED_IN',
                    HDONG_NGAYTHUCNHAN: now,
                },
                select: { HDONG_MA: true, HDONG_TRANG_THAI: true, HDONG_NGAYTHUCNHAN: true },
            });

            await tx.pHONG.update({
                where: { PHONG_MA: Number(PHONG_MA) },
                data: { PHONG_TRANGTHAI: 'OCCUPIED' },
            });

            return updated;
        });

        console.log('>>> UPDATED', result);
        return res.json({ ok: true, booking: result });
    } catch (e) {
        console.error('❌ ERROR in checkin:', e);
        next(e);
    }
}





// POST /bookings/:id/checkin1
async function checkin1(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ message: 'ID không hợp lệ' });

        // 1) Load header HĐ + validate trạng thái
        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            select: {
                HDONG_MA: true,
                HDONG_TRANG_THAI: true,
                HDONG_NGAYDAT: true,
                HDONG_NGAYTRA: true,
            },
        });
        if (!hd) return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });
        if (hd.HDONG_TRANG_THAI !== 'CONFIRMED') {
            return res.status(409).json({ message: 'Chỉ hợp đồng CONFIRMED mới được nhận phòng' });
        }

        // 2) Thời điểm nhận phòng (FE có thể gửi { at: ISO } hoặc để trống => now)
        const at = req.body?.at ? new Date(req.body.at) : new Date();
        if (isNaN(+at)) return res.status(400).json({ message: 'Thời điểm nhận phòng (at) không hợp lệ' });

        // CHÚ Ý: cho phép nhận sớm hơn HDONG_NGAYDAT nếu phòng trống.
        // Nếu muốn cứng rắn: kiểm tra at >= HDONG_NGAYDAT và at < HDONG_NGAYTRA.

        // 3) Lấy danh sách phòng thuộc HĐ
        const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: { HDONG_MA: id, CTSD_TRANGTHAI: { in: ['ACTIVE'] } },
            select: { PHONG_MA: true },
        });
        const roomIds = [...new Set(ctsd.map(r => r.PHONG_MA).filter(Boolean))];
        if (roomIds.length === 0) {
            return res.status(409).json({ message: 'Hợp đồng chưa gán phòng, không thể nhận phòng' });
        }

        // 4) Kiểm tra từng phòng có bị hợp đồng khác chồng lấn tại thời điểm "at" hay không
        const BLOCKING_STATUSES = ['CONFIRMED', 'CHECKED_IN'];

        for (const pid of roomIds) {
            // 4a. Kiểm tra nếu phòng đang có hợp đồng khác CHECKED_IN chưa CHECK_OUT
            const activeStay = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    PHONG_MA: pid,
                    CTSD_TRANGTHAI: 'ACTIVE',
                    HDONG_MA: { not: id },
                    HOP_DONG_DAT_PHONG: {
                        HDONG_TRANG_THAI: 'CHECKED_IN', // khách vẫn đang ở
                    },
                },
                select: { HDONG_MA: true, PHONG: { select: { PHONG_TEN: true } }, HOP_DONG_DAT_PHONG: { select: { HDONG_NGAYDAT: true, HDONG_NGAYTRA: true } } },
            });

            if (activeStay) {
                const roomName = activeStay.PHONG?.PHONG_TEN || `Phòng ${pid}`;
                const toLocal = (d) =>
                    new Date(d).toLocaleString("vi-VN", {
                        hour12: false,
                        timeZone: "Asia/Ho_Chi_Minh",
                    });
                const cFrom = toLocal(activeStay.HOP_DONG_DAT_PHONG.HDONG_NGAYDAT);
                const cTo = toLocal(activeStay.HOP_DONG_DAT_PHONG.HDONG_NGAYTRA);
                return res.status(409).json({
                    message: `${roomName} hiện đang có khách ở trong hợp đồng ${activeStay.HDONG_MA} (${cFrom} → ${cTo}). Vui lòng checkout trước khi nhận phòng mới.`,
                });
            }

            // 4b. Kiểm tra trùng lịch với hợp đồng CONFIRMED khác
            const conflict = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    PHONG_MA: pid,
                    CTSD_TRANGTHAI: 'ACTIVE',
                    HDONG_MA: { not: id },
                    HOP_DONG_DAT_PHONG: {
                        HDONG_TRANG_THAI: { in: ['CONFIRMED', 'CHECKED_IN'] },
                        AND: [
                            { HDONG_NGAYDAT: { lt: hd.HDONG_NGAYTRA } }, // hợp đồng khác bắt đầu trước khi HĐ hiện tại kết thúc
                            { HDONG_NGAYTRA: { gt: at } }, // hợp đồng khác kết thúc sau khi HĐ hiện tại bắt đầu
                        ],

                    },
                },
                select: {
                    HDONG_MA: true,
                    PHONG: { select: { PHONG_TEN: true } },
                    HOP_DONG_DAT_PHONG: {
                        select: { HDONG_NGAYDAT: true, HDONG_NGAYTRA: true },
                    },
                },
            });

            if (conflict) {
                const roomName = conflict.PHONG?.PHONG_TEN || `Phòng ${pid}`;
                const toLocal = (d) =>
                    new Date(d).toLocaleString("vi-VN", {
                        hour12: false,
                        timeZone: "Asia/Ho_Chi_Minh",
                    });
                const cFrom = toLocal(conflict.HOP_DONG_DAT_PHONG.HDONG_NGAYDAT);
                const cTo = toLocal(conflict.HOP_DONG_DAT_PHONG.HDONG_NGAYTRA);
                return res.status(409).json({
                    message: `${roomName} hiện đang có lịch đặt trong hợp đồng ${conflict.HDONG_MA} (${cFrom} → ${cTo}). Không thể nhận phòng tại thời điểm này.`,
                });
            }

        }


        // 5) Không có xung đột → nhận phòng
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.hOP_DONG_DAT_PHONG.update({
                where: { HDONG_MA: id },
                data: { HDONG_TRANG_THAI: 'CHECKED_IN', HDONG_NGAYTHUCNHAN: at },
                select: { HDONG_MA: true, HDONG_TRANG_THAI: true, HDONG_NGAYTHUCNHAN: true },
            });

            await tx.pHONG.updateMany({
                where: { PHONG_MA: { in: roomIds } },
                data: { PHONG_TRANGTHAI: 'OCCUPIED' }, // đúng code trạng thái phòng của bạn
            });

            return updated;
        });

        return res.json({ ok: true, booking: result });
    } catch (e) {
        next(e);
    }
}


// POST /bookings/:id/checkout
// async function checkout(req, res, next) {
//     try {
//         const id = Number(req.params.id);

//         // tuỳ: bắt buộc tất cả CTSD đã kết thúc?
//         const openItem = await prisma.cHI_TIET_SU_DUNG.findFirst({
//             where: { HDONG_MA: id, CTSD_TRANGTHAI: 'ACTIVE' },
//             select: { CTSD_STT: true }
//         });
//         if (openItem) {
//             const err = new Error('Còn mục sử dụng phòng đang ACTIVE, không thể checkout'); err.status = 409; throw err;
//         }

//         const hd = await prisma.hOP_DONG_DAT_PHONG.update({
//             where: { HDONG_MA: id },
//             data: { HDONG_TRANG_THAI: 'CHECKED_OUT', HDONG_NGAYTHUCTRA: new Date() }
//         });
//         res.json(hd);
//     } catch (e) { next(e); }
// }
// ===== Helper: tính trạng thái hóa đơn theo HĐ (total/paid/due/over) =====
// async function computeInvoiceStatusByBooking(hdId) {
//     // Link hóa đơn ↔ hợp đồng
//     const link = await prisma.hOA_DON_HOP_DONG.findFirst({
//         where: { HDONG_MA: hdId },
//         select: { HDON_MA: true },
//     });

//     // Chưa có hóa đơn ⇒ coi như chưa thu, due = tổng hiện tại (CTSD + CTDV)
//     if (!link) {
//         const roomAgg = await prisma.cHI_TIET_SU_DUNG.aggregate({
//             _sum: { CTSD_TONG_TIEN: true },
//             where: { HDONG_MA: hdId },
//         });
//         const roomTotal = Number(roomAgg._sum.CTSD_TONG_TIEN || 0);

//         // Tổng tiền dịch vụ (tính thủ công)
//         const svcRows = await prisma.cHI_TIET_DICH_VU.findMany({
//             where: { HDONG_MA: hdId, CTDV_TRANGTHAI: { in: ['ACTIVE', 'DOI_PHONG'] } },
//             select: { CTDV_SOLUONG: true, CTDV_DONGIA: true },
//         });
//         const svcTotal = svcRows.reduce(
//             (sum, r) => sum + Number(r.CTDV_SOLUONG || 0) * Number(r.CTDV_DONGIA || 0),
//             0
//         );

//         const total = roomTotal + svcTotal;

//         return {
//             hasInvoice: false,
//             invoiceId: null,
//             status: 'NO_INVOICE',
//             total,
//             paid: 0,
//             due: total,
//             over: 0,
//         };
//     }

//     // Có hóa đơn ⇒ lấy tổng + cộng tiền đã thu thành công
//     const invoice = await prisma.hOA_DON.findUnique({
//         where: { HDON_MA: link.HDON_MA },
//         select: { HDON_MA: true, HDON_TRANG_THAI: true, HDON_THANH_TIEN: true },
//     });

//     const paidAgg = await prisma.tHANH_TOAN.aggregate({
//         _sum: { TT_SO_TIEN: true },
//         where: {
//             HDON_MA: link.HDON_MA,
//             TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED',
//         },
//     });

//     const total = Number(invoice?.HDON_THANH_TIEN || 0);
//     const paid = Number(paidAgg._sum.TT_SO_TIEN || 0);
//     const due = Math.max(0, total - paid);
//     const over = Math.max(0, paid - total);

//     return {
//         hasInvoice: true,
//         invoiceId: invoice?.HDON_MA ?? null,
//         status: invoice?.HDON_TRANG_THAI ?? 'UNKNOWN',
//         total,
//         paid,
//         due,
//         over,
//     };
// }
async function computeInvoiceStatusByBooking(hdId) {
    // 🔹 Lấy tất cả hóa đơn của hợp đồng (thay vì chỉ 1)
    const links = await prisma.hOA_DON_HOP_DONG.findMany({
        where: { HDONG_MA: hdId },
        select: { HDON_MA: true },
    });

    if (!links.length) {
        // Chưa có hóa đơn ⇒ tính trực tiếp từ CTSD + CTDV
        const roomAgg = await prisma.cHI_TIET_SU_DUNG.aggregate({
            _sum: { CTSD_TONG_TIEN: true },
            where: { HDONG_MA: hdId },
        });
        const roomTotal = Number(roomAgg._sum.CTSD_TONG_TIEN || 0);

        const svcRows = await prisma.cHI_TIET_DICH_VU.findMany({
            where: { HDONG_MA: hdId, CTDV_TRANGTHAI: { in: ['ACTIVE', 'DOI_PHONG'] } },
            select: { CTDV_SOLUONG: true, CTDV_DONGIA: true },
        });
        const svcTotal = svcRows.reduce(
            (sum, r) => sum + Number(r.CTDV_SOLUONG || 0) * Number(r.CTDV_DONGIA || 0),
            0
        );

        const total = roomTotal + svcTotal;

        return {
            hasInvoice: false,
            invoiceId: null,
            status: 'NO_INVOICE',
            total,
            paid: 0,
            due: total,
            over: 0,
        };
    }

    // 🔹 Lấy tất cả hóa đơn liên quan
    const invoices = await prisma.hOA_DON.findMany({
        where: { HDON_MA: { in: links.map(l => l.HDON_MA) } },
        select: { HDON_MA: true, HDON_TRANG_THAI: true, HDON_THANH_TIEN: true, HDON_LOAI: true },
    });

    const allIds = invoices.map(inv => inv.HDON_MA);

    // 🔹 Tổng tiền hóa đơn
    const total = invoices.reduce((s, inv) => s + Number(inv.HDON_THANH_TIEN || 0), 0);

    // 🔹 Tổng tiền thanh toán thành công cho các hóa đơn đó
    const paidAgg = await prisma.tHANH_TOAN.aggregate({
        _sum: { TT_SO_TIEN: true },
        where: {
            HDON_MA: { in: allIds },
            TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED',
        },
    });
    const paid = Number(paidAgg._sum.TT_SO_TIEN || 0);
    const due = Math.max(0, total - paid);
    const over = Math.max(0, paid - total);

    // 🔹 Nếu có MAIN → ưu tiên trả về ID đó
    const mainInvoice = invoices.find(i => i.HDON_LOAI === 'MAIN');

    return {
        hasInvoice: true,
        invoiceId: mainInvoice?.HDON_MA || invoices[0].HDON_MA,
        status: mainInvoice?.HDON_TRANG_THAI || invoices[0].HDON_TRANG_THAI,
        total,
        paid,
        due,
        over,
    };
}

// ===== POST /bookings/:id/checkout =====
async function checkout(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ message: 'ID không hợp lệ' });
        }

        // 1) Header HĐ & guard trạng thái
        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            select: {
                HDONG_MA: true,
                HDONG_TRANG_THAI: true,
                HDONG_NGAYTHUCTRA: true,
            },
        });
        if (!hd) return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });

        const st = (hd.HDONG_TRANG_THAI || '').toUpperCase();
        if (st === 'CHECKED_OUT') {
            return res.status(409).json({
                message: 'Hợp đồng đã trả phòng.',
                detail: { at: hd.HDONG_NGAYTHUCTRA?.toISOString?.() },
            });
        }
        if (st !== 'CHECKED_IN') {
            return res
                .status(409)
                .json({ message: `Chỉ hợp đồng đang CHECKED_IN mới được trả phòng (hiện tại: ${st}).` });
        }

        // 2) Bắt buộc tất toán đủ trước khi trả phòng
        const inv = await computeInvoiceStatusByBooking(id);
        if (inv.due > 0) {
            return res.status(409).json({
                message: 'Chưa thanh toán đủ. Vui lòng tất toán trước khi trả phòng.',
                detail: { due: inv.due, total: inv.total, paid: inv.paid },
            });
        }

        // 3) Danh sách phòng thuộc HĐ (để đổi trạng thái phòng)
        const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: { HDONG_MA: id },
            select: { PHONG_MA: true },
        });
        const roomIds = [...new Set(ctsd.map(r => r.PHONG_MA).filter(Boolean))];

        // 4) Thời điểm thực trả
        const at = req.body?.at ? new Date(req.body.at) : new Date();
        if (Number.isNaN(+at)) {
            return res.status(400).json({ message: 'Thời điểm trả phòng (at) không hợp lệ' });
        }

        // 5) Transaction trả phòng
        const result = await prisma.$transaction(async (tx) => {
            // 5.1) Cập nhật HĐ → CHECKED_OUT + mốc thực trả
            const updated = await tx.hOP_DONG_DAT_PHONG.update({
                where: { HDONG_MA: id },
                data: { HDONG_TRANG_THAI: 'CHECKED_OUT', HDONG_NGAYTHUCTRA: at },
                select: { HDONG_MA: true, HDONG_TRANG_THAI: true, HDONG_NGAYTHUCTRA: true },
            });

            // 5.2) Đóng CTSD (nếu bạn có enum khác, đổi 'COMPLETED' cho khớp)
            await tx.cHI_TIET_SU_DUNG.updateMany({
                where: { HDONG_MA: id },
                data: { CTSD_TRANGTHAI: 'INVOICED' },
            });

            // 5.3) Phòng → CHUA_DON (đổi thành 'AVAILABLE' nếu không theo quy trình “bẩn”)
            if (roomIds.length > 0) {
                await tx.pHONG.updateMany({
                    where: { PHONG_MA: { in: roomIds } },
                    data: { PHONG_TRANGTHAI: 'CHUA_DON' }, // hoặc 'AVAILABLE'
                });
            }

            // 5.4) (tuỳ chọn) cập nhật trạng thái hóa đơn: đã thu đủ ⇒ PAID
            if (inv.hasInvoice && inv.invoiceId) {
                await tx.hOA_DON.update({
                    where: { HDON_MA: inv.invoiceId },
                    data: { HDON_TRANG_THAI: 'PAID' },
                });
            }

            return updated;
        });

        // 6) Trả về
        return res.json({ ok: true, booking: result, rooms: roomIds });
    } catch (e) {
        next(e);
    }
}



// POST /bookings/:id/cancel
async function cancel(req, res, next) {
    try {
        const id = Number(req.params.id);
        const lydo = req.body?.lydo ?? null;

        const hd = await prisma.hOP_DONG_DAT_PHONG.update({
            where: { HDONG_MA: id },
            data: {
                HDONG_TRANG_THAI: 'CANCELLED',
                HDONG_GHICHU: lydo ? `[CANCELLED] ${lydo}` : '[CANCELLED]'
            }
        });
        res.json(hd);
    } catch (e) { next(e); }
}

// DELETE /bookings/:id/guests/:khId
async function delete_kh(req, res, next) {
    try{
        const HDONG_MA = Number(req.params.id);
        const KH_MA = Number(req.params.khId);
        await prisma.lUU_TRU_KHACH.delete({
            where: { HDONG_MA_KH_MA: { HDONG_MA, KH_MA } },
        });
        res.json({ ok: true });
    }
    catch (e) { next(e); }
}
// POST /bookings/:id/guests
async function add_guest(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { guests = [] } = req.body;
        for (const g of guests) {
            await prisma.lUU_TRU_KHACH.create({
                data: {
                    HDONG_MA: id,
                    KH_MA: g.KH_MA,
                    LA_KHACH_CHINH: !!g.LA_KHACH_CHINH,
                    LA_KHACH_DAT: false,
                },
            });
        }
        res.json({ ok: true });
    } catch (e) { next(e); }
}


module.exports = { list, get, create, update, remove, checkin, checkin1, checkout, cancel, delete_kh , add_guest};
