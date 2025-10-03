// src/controllers/invoice-links.controller.js
const { prisma } = require('../db/prisma');

const toNum = v => Number(v || 0);
const money = n => Number(n).toFixed(2);
const ACTIVE_STATES = ['ACTIVE', 'INVOICED'];

// ----- helpers tổng hợp cho MỘT booking -----
async function sumBookingTotals(HDONG_MA) {
    HDONG_MA = Number(HDONG_MA);

    const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA, CTSD_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTSD_TONG_TIEN: true }
    });
    const roomTotal = ctsd.reduce((s, r) => s + toNum(r.CTSD_TONG_TIEN), 0);

    const ctdv = await prisma.cHI_TIET_DICH_VU.findMany({
        where: { HDONG_MA, CTDV_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTDV_SOLUONG: true, CTDV_DONGIA: true }
    });
    const serviceTotal = ctdv.reduce((s, r) => s + (toNum(r.CTDV_DONGIA) * Number(r.CTDV_SOLUONG || 0)), 0);

    const km = await prisma.kHUYEN_MAI_SU_DUNG.findUnique({
        where: { HDONG_MA },
        select: { KM_SOTIEN_GIAM: true }
    });
    const discount = toNum(km?.KM_SOTIEN_GIAM || 0);

    const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
        where: { HDONG_MA },
        select: { HDONG_TIENCOCYEUCAU: true }
    });
    const deposit = toNum(hd?.HDONG_TIENCOCYEUCAU || 0);

    return {
        roomTotal, serviceTotal,
        gross: roomTotal + serviceTotal,
        discount, deposit
    };
}

// ----- helpers tổng hợp cho TOÀN bộ invoice (nhiều bookings) -----
async function recalcInvoice(HDON_MA, fee = 0) {
    HDON_MA = Number(HDON_MA);
    const inv = await prisma.hOA_DON.findUnique({ where: { HDON_MA } });
    if (!inv) { const e = new Error('Hóa đơn không tồn tại'); e.status = 404; throw e; }

    // lấy danh sách booking đang link
    const links = await prisma.hOA_DON_HOP_DONG.findMany({
        where: { HDON_MA }, select: { HDONG_MA: true }
    });
    if (links.length === 0) {
        // nếu không còn link nào, để số tiền về 0 (tuỳ policy của bạn)
        const updated = await prisma.hOA_DON.update({
            where: { HDON_MA },
            data: {
                HDON_TONG_TIEN: '0.00',
                HDON_GIAM_GIA: '0.00',
                HDON_COC_DA_TRU: '0.00',
                HDON_PHI: money(fee),
                HDON_THANH_TIEN: money(Math.max(0, fee))
            }
        });
        return updated;
    }

    // cộng gộp
    let room = 0, svc = 0, gross = 0, discount = 0, deposit = 0;
    for (const { HDONG_MA } of links) {
        const one = await sumBookingTotals(HDONG_MA);
        room += one.roomTotal;
        svc += one.serviceTotal;
        gross += one.gross;
        discount += one.discount;
        deposit += one.deposit;
    }
    const feeNum = fee != null ? toNum(fee) : toNum(inv.HDON_PHI);
    const net = Math.max(0, gross - discount + feeNum - deposit);

    const detail = {
        bookings: links.map(l => l.HDONG_MA),
        breakdown: {
            roomTotal: money(room),
            serviceTotal: money(svc),
            gross: money(gross),
            discount: money(discount),
            fee: money(feeNum),
            deposit: money(deposit),
            net: money(net)
        }
    };

    const updated = await prisma.hOA_DON.update({
        where: { HDON_MA },
        data: {
            HDON_TONG_TIEN: money(gross),
            HDON_GIAM_GIA: money(discount),
            HDON_COC_DA_TRU: money(deposit),
            HDON_PHI: money(feeNum),
            HDON_THANH_TIEN: money(net),
            HDON_CHITIET_JSON: detail
        }
    });
    return updated;
}

// ===== CONTROLLERS =====

// GET /invoice-links/:invoiceId
async function list(req, res, next) {
    try {
        const id = Number(req.params.invoiceId);
        const rows = await prisma.hOA_DON_HOP_DONG.findMany({
            where: { HDON_MA: id },
            include: { HOP_DONG_DAT_PHONG: true }
        });
        res.json(rows);
    } catch (e) { next(e); }
}

// POST /invoice-links
// body: { HDON_MA, HDONG_MA }
async function add(req, res, next) {
    try {
        const { HDON_MA, HDONG_MA } = req.body || {};
        if (!(HDON_MA && HDONG_MA)) {
            const e = new Error('Thiếu HDON_MA / HDONG_MA'); e.status = 400; throw e;
        }
        const inv = await prisma.hOA_DON.findUnique({ where: { HDON_MA: Number(HDON_MA) } });
        if (!inv) { const e = new Error('Hóa đơn không tồn tại'); e.status = 404; throw e; }
        if (inv.HDON_TRANG_THAI === 'PAID') {
            const e = new Error('Hóa đơn đã PAID — không thể thêm liên kết'); e.status = 409; throw e;
        }

        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({ where: { HDONG_MA: Number(HDONG_MA) } });
        if (!hd) { const e = new Error('Hợp đồng không tồn tại'); e.status = 404; throw e; }

        // chặn trùng PK tổng hợp
        const existed = await prisma.hOA_DON_HOP_DONG.findUnique({
            where: { HDON_MA_HDONG_MA: { HDON_MA: Number(HDON_MA), HDONG_MA: Number(HDONG_MA) } }
        });
        if (existed) { const e = new Error('Đã liên kết HĐ này vào hóa đơn'); e.status = 409; throw e; }

        await prisma.hOA_DON_HOP_DONG.create({
            data: { HDON_MA: Number(HDON_MA), HDONG_MA: Number(HDONG_MA) }
        });

        // recalc invoice sau khi thêm
        const updated = await recalcInvoice(Number(HDON_MA));
        res.status(201).json(updated);
    } catch (e) { next(e); }
}

// DELETE /invoice-links/:invoiceId/:bookingId
async function remove(req, res, next) {
    try {
        const HDON_MA = Number(req.params.invoiceId);
        const HDONG_MA = Number(req.params.bookingId);

        const inv = await prisma.hOA_DON.findUnique({ where: { HDON_MA } });
        if (!inv) { const e = new Error('Hóa đơn không tồn tại'); e.status = 404; throw e; }
        if (inv.HDON_TRANG_THAI === 'PAID') {
            const e = new Error('Hóa đơn đã PAID — không thể huỷ liên kết'); e.status = 409; throw e;
        }

        await prisma.hOA_DON_HOP_DONG.delete({
            where: { HDON_MA_HDONG_MA: { HDON_MA, HDONG_MA } }
        });

        // recalc invoice sau khi gỡ bớt
        const updated = await recalcInvoice(HDON_MA);
        res.json(updated);
    } catch (e) { next(e); }
}

// POST /invoice-links/:invoiceId/recalc   (optional, có thể kèm fee mới)
async function recalc(req, res, next) {
    try {
        const id = Number(req.params.invoiceId);
        const fee = req.body?.fee;
        const updated = await recalcInvoice(id, fee);
        res.json(updated);
    } catch (e) { next(e); }
}

module.exports = { list, add, remove, recalc };
