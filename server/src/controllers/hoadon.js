// src/controllers/invoice.controller.js
const { prisma } = require('../db/prisma');

const toNum = (v) => Number(v || 0);
const money = (n) => Number(n).toFixed(2);
const ACTIVE_STATES = ['ACTIVE', 'INVOICED'];

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
async function createFromBooking(req, res, next) {
    try {
        const hdId = Number(req.params.hdId);
        const { discount = 0, fee = 0, overrideDeposit } = req.body || {};

        // 1) Load HĐ
        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: hdId },
            select: {
                HDONG_MA: true,
                HDONG_TRANG_THAI: true,
                HDONG_TIENCOCYEUCAU: true,
                HDONG_TONGTIENDUKIEN: true,
            }
        });
        if (!hd) { const e = new Error('Hợp đồng không tồn tại'); e.status = 404; throw e; }
        if (['CANCELLED', 'NO_SHOW'].includes(hd.HDONG_TRANG_THAI)) {
            const e = new Error('Không thể tạo hóa đơn cho HĐ đã hủy/không đến'); e.status = 409; throw e;
        }

        // 2) Tính Gross / Discount / Net  (giảm giá lấy TỪ BODY)
        const { roomTotal, serviceTotal, gross } = await sumRoomAndService(hdId);
        const giam = toNum(discount);         // ⬅️ từ body
        const phi = toNum(fee);              // ⬅️ từ body
        const coc = overrideDeposit != null
            ? toNum(overrideDeposit)
            : toNum(hd.HDONG_TIENCOCYEUCAU);
        let net = gross - giam + phi - coc;
        if (net < 0) net = 0;

        // 3) Nếu đã có link hóa đơn cho HĐ này → cập nhật hóa đơn cũ theo số mới
        const existedLink = await prisma.hOA_DON_HOP_DONG.findFirst({
            where: { HDONG_MA: hdId }, select: { HDON_MA: true }
        });

        const breakdown = {
            bookingId: hdId,
            breakdown: {
                roomTotal: money(roomTotal),
                serviceTotal: money(serviceTotal),
                gross: money(gross),
                discount: money(giam),
                fee: money(phi),
                deposit: money(coc),
                net: money(net),
            }
        };

        if (existedLink) {
            const updated = await prisma.hOA_DON.update({
                where: { HDON_MA: existedLink.HDON_MA },
                data: {
                    NV_MA: req.user?.id || req.user?.sub || 1,
                    HDON_TONG_TIEN: money(gross),
                    HDON_GIAM_GIA: money(giam),
                    HDON_PHI: money(phi),
                    HDON_COC_DA_TRU: money(coc),
                    HDON_THANH_TIEN: money(net),
                    HDON_CHITIET_JSON: breakdown,
                }
            });

            // tổng đã thanh toán & còn thiếu
            const pays = await prisma.tHANH_TOAN.findMany({
                where: { HDON_MA: updated.HDON_MA, TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED' },
                select: { TT_SO_TIEN: true }
            });
            const paid = pays.reduce((s, r) => s + toNum(r.TT_SO_TIEN), 0);
            const due = Math.max(0, toNum(updated.HDON_THANH_TIEN) - paid);
            return res.status(200).json({ ...updated, _payment: { paid: money(paid), due: money(due) } });
        }

        // 4) Chưa có → tạo mới
        const invoice = await prisma.hOA_DON.create({
            data: {
                NV_MA: req.user?.id || req.user?.sub || 1,
                HDON_TONG_TIEN: money(gross),
                HDON_GIAM_GIA: money(giam),
                HDON_PHI: money(phi),
                HDON_COC_DA_TRU: money(coc),
                HDON_THANH_TIEN: money(net),
                HDON_CHITIET_JSON: breakdown,
                HDON_TRANG_THAI: 'ISSUED',
            }
        });

        await prisma.hOA_DON_HOP_DONG.create({
            data: { HDON_MA: invoice.HDON_MA, HDONG_MA: hdId }
        });

        const pays = await prisma.tHANH_TOAN.findMany({
            where: { HDON_MA: invoice.HDON_MA, TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED' },
            select: { TT_SO_TIEN: true }
        });
        const paid = pays.reduce((s, r) => s + toNum(r.TT_SO_TIEN), 0);
        const due = Math.max(0, toNum(invoice.HDON_THANH_TIEN) - paid);

        res.status(201).json({ ...invoice, _payment: { paid: money(paid), due: money(due) } });
    } catch (e) { next(e); }
}

// GET /invoices/:id
async function get(req, res, next) {
    try {
        const id = Number(req.params.id);
        const inv = await prisma.hOA_DON.findUnique({
            where: { HDON_MA: id },
            include: { THANH_TOAN: true, LIEN_KET: true }
        });
        if (!inv) return res.status(404).json({ message: 'Not found' });

        const paid = await sumSucceededPayments(id);
        const due = Math.max(0, toNum(inv.HDON_THANH_TIEN) - paid);

        res.json({ ...inv, _payment: { paid: money(paid), due: money(due) } });
    } catch (e) { next(e); }
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
