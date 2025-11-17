// src/controllers/invoice.controller.js
const { prisma, Prisma } = require('../db/prisma');

const toNum = (v) => Number(v || 0);
const money = (n) => Number(n).toFixed(2);
const ACTIVE_STATES = ['ACTIVE', 'DOI_PHONG',];

// ----- helpers tổng hợp -----
async function sumRoomAndService(HDONG_MA) {
    HDONG_MA = Number(HDONG_MA);

    // Tiền phòng: CTSD_TONG_TIEN các CTSD ACTIVE/INVOICED
    const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA, CTSD_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTSD_TONG_TIEN: true }
    });
    const roomTotal = ctsd.reduce((s, r) => s + toNum(r.CTSD_TONG_TIEN), 0);

    // Tiền DV: sum(SL*ĐG) các CTDV ACTIVE/INVOICED
    const ctdv = await prisma.cHI_TIET_DICH_VU.findMany({
        where: { HDONG_MA, CTDV_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTDV_SOLUONG: true, CTDV_DONGIA: true }
    });
    const serviceTotal = ctdv.reduce((s, r) => s + (toNum(r.CTDV_DONGIA) * Number(r.CTDV_SOLUONG || 0)), 0);

    return { roomTotal, serviceTotal, gross: roomTotal + serviceTotal };
}

async function getDiscount(HDONG_MA) {
    const km = await prisma.kHUYEN_MAI_SU_DUNG.findUnique({
        where: { HDONG_MA: Number(HDONG_MA) },
        select: { KM_SOTIEN_GIAM: true }
    });
    return toNum(km?.KM_SOTIEN_GIAM || 0);
}

async function sumSucceededPayments(HDON_MA) {
    const pays = await prisma.tHANH_TOAN.findMany({
        where: { HDON_MA: Number(HDON_MA), TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED' },
        select: { TT_SO_TIEN: true }
    });
    return pays.reduce((s, r) => s + toNum(r.TT_SO_TIEN), 0);
}

// ===== CONTROLLERS =====

// POST /invoices/from-booking/:hdId
// body: { fee?: number|string, overrideDeposit?: number|string }
// async function createFromBooking(req, res, next) {
//     try {
//         const hdId = Number(req.params.hdId);
//         const { discount = 0, fee = 0, overrideDeposit } = req.body || {};

//         // 1) Load HĐ
//         const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
//             where: { HDONG_MA: hdId },
//             select: {
//                 HDONG_MA: true,
//                 HDONG_TRANG_THAI: true,
//                 HDONG_TIENCOCYEUCAU: true,
//                 HDONG_TONGTIENDUKIEN: true,
//             }
//         });
//         if (!hd) { const e = new Error('Hợp đồng không tồn tại'); e.status = 404; throw e; }
//         if (['CANCELLED', 'NO_SHOW'].includes(hd.HDONG_TRANG_THAI)) {
//             const e = new Error('Không thể tạo hóa đơn cho HĐ đã hủy/không đến'); e.status = 409; throw e;
//         }

//         // 2) Tính Gross / Discount / Net  (giảm giá lấy TỪ BODY)
//         const { roomTotal, serviceTotal, gross } = await sumRoomAndService(hdId);
//         const giam = toNum(discount);         // ⬅️ từ body
//         const phi = toNum(fee);              // ⬅️ từ body
//         const coc = overrideDeposit != null
//             ? toNum(overrideDeposit)
//             : toNum(hd.HDONG_TIENCOCYEUCAU);
//         let net = gross - giam + phi - coc;
//         if (net < 0) net = 0;

//         // 3) Nếu đã có link hóa đơn cho HĐ này → cập nhật hóa đơn cũ theo số mới
//         const existedLink = await prisma.hOA_DON_HOP_DONG.findFirst({
//             where: { HDONG_MA: hdId }, select: { HDON_MA: true }
//         });

//         const breakdown = {
//             bookingId: hdId,
//             breakdown: {
//                 roomTotal: money(roomTotal),
//                 serviceTotal: money(serviceTotal),
//                 gross: money(gross),
//                 discount: money(giam),
//                 fee: money(phi),
//                 deposit: money(coc),
//                 net: money(net),
//             }
//         };

//         if (existedLink) {
//             const updated = await prisma.hOA_DON.update({
//                 where: { HDON_MA: existedLink.HDON_MA },
//                 data: {
//                     NV_MA: req.user?.id || req.user?.sub || 1,
//                     HDON_TONG_TIEN: money(gross),
//                     HDON_GIAM_GIA: money(giam),
//                     HDON_PHI: money(phi),
//                     HDON_COC_DA_TRU: money(coc),
//                     HDON_THANH_TIEN: money(net),
//                     HDON_CHITIET_JSON: breakdown,
//                 }
//             });

//             // tổng đã thanh toán & còn thiếu
//             const pays = await prisma.tHANH_TOAN.findMany({
//                 where: { HDON_MA: updated.HDON_MA, TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED' },
//                 select: { TT_SO_TIEN: true }
//             });
//             const paid = pays.reduce((s, r) => s + toNum(r.TT_SO_TIEN), 0);
//             const due = Math.max(0, toNum(updated.HDON_THANH_TIEN) - paid);
//             return res.status(200).json({ ...updated, _payment: { paid: money(paid), due: money(due) } });
//         }

//         // 4) Chưa có → tạo mới
//         const invoice = await prisma.hOA_DON.create({
//             data: {
//                 NV_MA: req.user?.id || req.user?.sub || 1,
//                 HDON_TONG_TIEN: money(gross),
//                 HDON_GIAM_GIA: money(giam),
//                 HDON_PHI: money(phi),
//                 HDON_COC_DA_TRU: money(coc),
//                 HDON_THANH_TIEN: money(net),
//                 HDON_CHITIET_JSON: breakdown,
//                 HDON_TRANG_THAI: 'ISSUED',
//             }
//         });

//         await prisma.hOA_DON_HOP_DONG.create({
//             data: { HDON_MA: invoice.HDON_MA, HDONG_MA: hdId }
//         });

//         const pays = await prisma.tHANH_TOAN.findMany({
//             where: { HDON_MA: invoice.HDON_MA, TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED' },
//             select: { TT_SO_TIEN: true }
//         });
//         const paid = pays.reduce((s, r) => s + toNum(r.TT_SO_TIEN), 0);
//         const due = Math.max(0, toNum(invoice.HDON_THANH_TIEN) - paid);

//         res.status(201).json({ ...invoice, _payment: { paid: money(paid), due: money(due) } });
//     } catch (e) { next(e); }
// }
async function createFromBooking(req, res, next) {
    try {
        const hdId = Number(req.params.hdId);
        const { discount = 0, fee = 0, overrideDeposit, inputPaid = 0 } = req.body || {};
        const paidAmount = Number(inputPaid || 0);

        // 1️⃣ Lấy hợp đồng
        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: hdId },
            select: { HDONG_MA: true, HDONG_TRANG_THAI: true, HDONG_TIENCOCYEUCAU: true },
        });
        if (!hd) throw Object.assign(new Error("Hợp đồng không tồn tại"), { status: 404 });
        if (["CANCELLED", "NO_SHOW"].includes(hd.HDONG_TRANG_THAI))
            throw Object.assign(new Error("Không thể tạo hóa đơn cho HĐ đã hủy/không đến"), { status: 409 });

        // 2️⃣ Tính tổng tiền
        const { roomTotal, serviceTotal } = await sumRoomAndService(hdId);
        const giam = toNum(discount);
        const phi = toNum(fee);
        const gross = roomTotal + serviceTotal;

        // 3️⃣ Kiểm tra có hóa đơn cọc (DEPOSIT) chưa
        const depositInv = await prisma.hOA_DON.findFirst({
            where: {
                LIEN_KET: { some: { HDONG_MA: hdId } },
                HDON_LOAI: "DEPOSIT",
                HDON_TRANG_THAI: "PAID",
            },
            select: { HDON_MA: true, HDON_THANH_TIEN: true },
        });
        const depositPaid = depositInv ? Number(depositInv.HDON_THANH_TIEN || 0) : 0;

        // 4️⃣ Tổng cần thanh toán
        const grandTotal = gross;
        const needToPay = Math.max(0, grandTotal - depositPaid - giam + phi);

        // // Nếu không nhập tiền hoặc nhập thiếu
        if (paidAmount < needToPay) {
            throw Object.assign(
                new Error(`Cần thanh toán đủ ${needToPay.toLocaleString("vi-VN")} VND để hoàn tất.`),
                { status: 400 }
            );
        }

        // 5️⃣ Tạo hóa đơn MAIN
        const invoice = await prisma.hOA_DON.create({
            data: {
                NV_MA: req.user?.id || req.user?.sub || 1,
                HDON_TONG_TIEN: new Prisma.Decimal(grandTotal),
                HDON_GIAM_GIA: new Prisma.Decimal(giam),
                HDON_PHI: new Prisma.Decimal(phi),
                HDON_COC_DA_TRU: new Prisma.Decimal(depositPaid),
                HDON_THANH_TIEN: new Prisma.Decimal(needToPay),
                HDON_CHITIET_JSON: {
                    bookingId: hdId,
                    breakdown: {
                        roomTotal,
                        serviceTotal,
                        gross,
                        discount: giam,
                        fee: phi,
                        deposit: depositPaid,
                        net: needToPay,
                    },
                },
                HDON_TRANG_THAI: "PAID",
                HDON_LOAI: "MAIN",
            },
        });

        await prisma.hOA_DON_HOP_DONG.create({
            data: { HDON_MA: invoice.HDON_MA, HDONG_MA: hdId },
        });
        if (paidAmount <= 0) {
            return res.status(400).json({ message: 'Không thể ghi thanh toán 0 đồng.' });
        }

        // 6️⃣ Ghi thanh toán
        await prisma.tHANH_TOAN.create({
            data: {
                HDON_MA: invoice.HDON_MA,
                TT_SO_TIEN: new Prisma.Decimal(needToPay),
                TT_SO_TIEN_KHACH_DUA: new Prisma.Decimal(paidAmount),
                TT_TIEN_THUA: new Prisma.Decimal(Math.max(0, paidAmount - needToPay)),
                TT_PHUONG_THUC: "CASH",
                TT_TRANG_THAI_GIAO_DICH: "SUCCEEDED",
            },
        });

        res.status(201).json({
            ...invoice,
            _payment: { paid: needToPay, due: 0 },
        });
    } catch (e) {
        next(e);
    }
}




async function get(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ message: 'id không hợp lệ' });
        }

        // 1) Hóa đơn + các khoản thanh toán
        const inv = await prisma.hOA_DON.findUnique({
            where: { HDON_MA: id },
            include: {
                THANH_TOAN: true, // TT_SO_TIEN, TT_PHUONG_THUC, TT_TRANG_THAI_GIAO_DICH, ...
                NHAN_VIEN: {                      // 👈 nếu model HOA_DON có relation NHAN_VIEN
                    select: { NV_MA: true, NV_HOTEN: true, NV_SDT: true, NV_EMAIL: true }
                },
            },
        });
        if (!inv) return res.status(404).json({ message: 'Not found' });

        // 2) Link hóa đơn ↔ hợp đồng
        const link = await prisma.hOA_DON_HOP_DONG.findFirst({
            where: { HDON_MA: id },
            select: { HDONG_MA: true },
        });

        let BOOKING = null;
        let KHACH_HANG = null;
        let CHI_TIET = [];
        let STAFF = inv.NHAN_VIEN ?? null;

        if (link?.HDONG_MA) {
            // 3) Ưu tiên khách gắn trong HĐ
            const hd = await prisma.hOP_DONG_DAT_PHONG.findFirst({
                where: { HDONG_MA: link.HDONG_MA },
                select: {
                    HDONG_MA: true,
                    HDONG_NGAYDAT: true,
                    HDONG_NGAYTRA: true,
                    HDONG_NGAYTHUCNHAN: true,
                    HDONG_NGAYTHUCTRA: true,
                    KHACH_HANG: {
                        select: {
                            KH_HOTEN: true, KH_DIACHI: true, KH_SDT: true, KH_EMAIL: true,
                        },
                    },
                    NHAN_VIEN: {                    // 👈 fallback NV từ hợp đồng
                        select: { NV_MA: true, NV_HOTEN: true, NV_SDT: true, NV_EMAIL: true }
                    },
                },
            });

            if (hd) {
                BOOKING = {
                    HDONG_MA: hd.HDONG_MA,
                    HDONG_NGAYDAT: hd.HDONG_NGAYDAT,
                    HDONG_NGAYTRA: hd.HDONG_NGAYTRA,
                    HDONG_NGAYTHUCNHAN: hd.HDONG_NGAYTHUCNHAN,
                    HDONG_NGAYTHUCTRA: hd.HDONG_NGAYTHUCTRA,
                };
                KHACH_HANG = hd.KHACH_HANG ?? null;
                if (!STAFF && hd.NHAN_VIEN) STAFF = hd.NHAN_VIEN;
            }

            // 4) Fallback: khách chính từ LUU_TRU_KHACH nếu HĐ chưa có KH
            if (!KHACH_HANG) {
                const lt = await prisma.lUU_TRU_KHACH.findFirst({
                    where: { HDONG_MA: link.HDONG_MA, LA_KHACH_CHINH: true },
                    include: {
                        KHACH_HANG: {
                            select: {
                                KH_HOTEN: true, KH_DIACHI: true, KH_MASO_THUE: true, KH_SDT: true, KH_EMAIL: true,
                            },
                        },
                    },
                    orderBy: { KH_MA: 'asc' },
                });
                if (lt?.KHACH_HANG) KHACH_HANG = lt.KHACH_HANG;
            }

            // 5) GHÉP CHI_TIET
            // 5.1 Dịch vụ
            const dv = await prisma.cHI_TIET_DICH_VU.findMany({
                where: { HDONG_MA: link.HDONG_MA },
                include: {
                    DICH_VU: { select: { DV_TEN: true } },
                    PHONG: { select: { PHONG_TEN: true } },
                },
                orderBy: [{ CTDV_STT: 'asc' }],
            });

            const dvRows = dv.map(r => {
                const ten = r.DICH_VU?.DV_TEN ?? r.CTDV_TEN ?? 'Dịch vụ';
                const room = r.PHONG?.PHONG_TEN ? ` - ${r.PHONG.PHONG_TEN}` : '';
                const qty = Number(r.CTDV_SOLUONG ?? r.so_luong ?? 1);
                const unit = Number(r.CTDV_DONGIA ?? r.don_gia ?? 0);
                const amt = Number(r.thanh_tien ?? qty * unit);
                return {
                    loai: 'DICH_VU', dien_giai: `${ten}${room}`, so_luong: qty, don_gia: unit, thanh_tien: amt, PHONG_MA: r.PHONG_MA ?? null,
                    PHONG_TEN: ten,
                };
            });

            // 5.2 Tiền phòng
            const sd = await prisma.cHI_TIET_SU_DUNG.findMany({
                where: { HDONG_MA: link.HDONG_MA },
                include: { PHONG: { select: { PHONG_TEN: true } } },
                orderBy: [{ PHONG_MA: 'asc' }, { CTSD_STT: 'asc' }],
            });

            const roomRows = sd.map(r => {
                const roomName = r.PHONG?.PHONG_TEN || (r.PHONG_MA ? `Phòng ${r.PHONG_MA}` : 'Phòng');
                // nếu bạn có số đêm/đơn giá trong CTSD thì tận dụng, không thì để 1 × đơn giá/tổng
                const qty = Number(r.CTSD_SO_LUONG ?? r.so_dem ?? 1);
                const unit = Number(r.CTSD_DON_GIA ?? r.CTSD_GIA ?? r.don_gia ?? 0);
                const amt = Number(r.CTSD_TONG_TIEN ?? r.thanh_tien ?? (unit ? qty * unit : 0));
                const dienGiai = unit || amt ? `${roomName}` : `${roomName}`;
                return {
                    loai: 'PHONG', dien_giai: dienGiai, so_luong: qty, don_gia: unit, thanh_tien: amt, PHONG_MA: r.PHONG_MA ?? null,
                    PHONG_TEN: roomName,
                };
            });

            CHI_TIET = [...roomRows, ...dvRows].filter(x => Number.isFinite(x.thanh_tien));
        }

        // 6) paid/due (optional)
        const total = Number(inv?.HDON_THANH_TIEN || 0);
        const paid = (inv?.THANH_TOAN || [])
            .filter(p => (p.TT_TRANG_THAI_GIAO_DICH || '').toUpperCase() === 'SUCCEEDED')
            .reduce((s, p) => s + Number(p.TT_SO_TIEN || 0), 0);
        const due = Math.max(0, total - paid);

        // 7) Trả về
        return res.json({
            ...inv,
            KHACH_HANG,
            BOOKING,
            CHI_TIET,
            STAFF,
            _payment: { paid, due },
        });
    } catch (e) {
        console.error('GET /hoadon/:id error:', e);
        next(e);
    }
}
// POST /invoices/:id/finalize
// Ép trạng thái → PAID nếu đã đủ tiền
async function finalize(req, res, next) {
    try {
        const id = Number(req.params.id);
        const inv = await prisma.hOA_DON.findUnique({ where: { HDON_MA: id } });
        if (!inv) { const e = new Error('Hóa đơn không tồn tại'); e.status = 404; throw e; }

        const paid = await sumSucceededPayments(id);
        if (paid + 1e-6 < toNum(inv.HDON_THANH_TIEN)) {
            const e = new Error('Chưa thanh toán đủ để finalize'); e.status = 409; throw e;
        }

        const updated = await prisma.hOA_DON.update({
            where: { HDON_MA: id },
            data: { HDON_TRANG_THAI: 'PAID' }
        });
        res.json(updated);
    } catch (e) { next(e); }
}

module.exports = { createFromBooking, get, finalize };
