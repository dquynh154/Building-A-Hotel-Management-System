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
        const { fee = 0, overrideDeposit } = req.body || {};

        // 1) Load HĐ
        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: hdId },
            select: {
                HDONG_MA: true, HDONG_TRANG_THAI: true,
                HDONG_TIENCOCYEUCAU: true, HDONG_TONGTIENDUKIEN: true
            }
        });
        if (!hd) { const e = new Error('Hợp đồng không tồn tại'); e.status = 404; throw e; }

        // Tùy chính sách: cho phép tạo khi CONFIRMED/CHECKED_IN/CHECKED_OUT
        if (['CANCELLED', 'NO_SHOW'].includes(hd.HDONG_TRANG_THAI)) {
            const e = new Error('Không thể tạo hóa đơn cho HĐ đã hủy/không đến'); e.status = 409; throw e;
        }

        // 2) Check chưa có hóa đơn link (tránh trùng)
        const existedLink = await prisma.hOA_DON_HOP_DONG.findFirst({
            where: { HDONG_MA: hdId }, select: { HDON_MA: true }
        });
        if (existedLink) {
            const inv = await prisma.hOA_DON.findUnique({ where: { HDON_MA: existedLink.HDON_MA } });
            return res.status(200).json({ message: 'Đã có hóa đơn cho HĐ này', invoice: inv });
        }

        // 3) Tính Gross / Discount / Net
        const { roomTotal, serviceTotal, gross } = await sumRoomAndService(hdId);
        const discount = await getDiscount(hdId);
        const phi = toNum(fee);
        const coc = overrideDeposit != null ? toNum(overrideDeposit) : toNum(hd.HDONG_TIENCOCYEUCAU);
        let net = gross - discount + phi - coc;
        if (net < 0) net = 0;

        // 4) Tạo Hóa đơn
        const detail = {
            bookingId: hdId,
            breakdown: {
                roomTotal: money(roomTotal),
                serviceTotal: money(serviceTotal),
                gross: money(gross),
                discount: money(discount),
                fee: money(phi),
                deposit: money(coc),
                net: money(net)
            }
        };

        const invoice = await prisma.hOA_DON.create({
            data: {
                NV_MA: req.user?.id || 1,                      // người lập (tùy bạn)
                HDON_TONG_TIEN: money(gross),
                HDON_GIAM_GIA: money(discount),
                HDON_PHI: money(phi),
                HDON_COC_DA_TRU: money(coc),
                HDON_THANH_TIEN: money(net),
                HDON_CHITIET_JSON: detail,
                HDON_TRANG_THAI: 'ISSUED',
            }
        });

        // 5) Link HĐon ↔ HĐ đặt phòng
        await prisma.hOA_DON_HOP_DONG.create({
            data: { HDON_MA: invoice.HDON_MA, HDONG_MA: hdId }
        });

        // 6) Trả kết quả + tổng đã thanh toán (nếu có)
        const paid = await sumSucceededPayments(invoice.HDON_MA);
        const due = Math.max(0, toNum(invoice.HDON_THANH_TIEN) - paid);

        res.status(201).json({
            ...invoice,
            _payment: { paid: money(paid), due: money(due) }
        });
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
