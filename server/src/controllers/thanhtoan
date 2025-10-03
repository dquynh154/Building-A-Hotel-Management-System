// src/controllers/payment.controller.js
const { prisma } = require('../db/prisma');

const toNum = (v) => Number(v || 0);
const money = (n) => Number(n).toFixed(2);

// Sau khi trạng thái giao dịch đổi → cập nhật invoice (đổi sang PAID nếu đủ)
async function refreshInvoiceStatus(HDON_MA) {
  HDON_MA = Number(HDON_MA);
  const inv = await prisma.hOA_DON.findUnique({ where: { HDON_MA } });
  if (!inv) return;

  const pays = await prisma.tHANH_TOAN.findMany({
    where: { HDON_MA, TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED' },
    select: { TT_SO_TIEN: true }
  });
  const paid = pays.reduce((s, r) => s + toNum(r.TT_SO_TIEN), 0);
  const due = Math.max(0, toNum(inv.HDON_THANH_TIEN) - paid);

  // nếu đủ tiền thì tự chuyển PAID
  if (due <= 1e-6 && inv.HDON_TRANG_THAI !== 'PAID') {
    await prisma.hOA_DON.update({ where: { HDON_MA }, data: { HDON_TRANG_THAI: 'PAID' } });
  }
  return { paid: money(paid), due: money(due) };
}

// POST /payments
// body: { HDON_MA, TT_PHUONG_THUC, TT_SO_TIEN, TT_SO_TIEN_KHACH_DUA?, TT_MA_GIAO_DICH?, TT_NHA_CUNG_CAP? }
async function create(req, res, next) {
  try {
    const {
      HDON_MA, TT_PHUONG_THUC, TT_SO_TIEN,
      TT_SO_TIEN_KHACH_DUA, TT_MA_GIAO_DICH, TT_NHA_CUNG_CAP, TT_GHI_CHU
    } = req.body || {};

    if (!(HDON_MA && TT_PHUONG_THUC && TT_SO_TIEN != null)) {
      const e = new Error('Thiếu HDON_MA / TT_PHUONG_THUC / TT_SO_TIEN'); e.status = 400; throw e;
    }

    const inv = await prisma.hOA_DON.findUnique({ where: { HDON_MA: Number(HDON_MA) } });
    if (!inv) { const e = new Error('Hóa đơn không tồn tại'); e.status = 404; throw e; }

    let change = null;
    let state = 'INITIATED';

    // Với CASH, cho success ngay & tính tiền thừa nếu có
    if (TT_PHUONG_THUC === 'CASH') {
      const khachDua = toNum(TT_SO_TIEN_KHACH_DUA ?? TT_SO_TIEN);
      const soTien = toNum(TT_SO_TIEN);
      change = khachDua - soTien;
      state = 'SUCCEEDED';
    }

    const pay = await prisma.tHANH_TOAN.create({
      data: {
        HDON_MA: Number(HDON_MA),
        TT_PHUONG_THUC,
        TT_NHA_CUNG_CAP: TT_NHA_CUNG_CAP ?? null,
        TT_TRANG_THAI_GIAO_DICH: state, // INITIATED | SUCCEEDED | FAILED | REFUNDED
        TT_SO_TIEN: money(TT_SO_TIEN),
        TT_SO_TIEN_KHACH_DUA: TT_SO_TIEN_KHACH_DUA != null ? money(TT_SO_TIEN_KHACH_DUA) : null,
        TT_TIEN_THUA: change != null ? money(change) : null,
        TT_MA_GIAO_DICH: TT_MA_GIAO_DICH ?? null,
        TT_GHI_CHU: TT_GHI_CHU ?? null,
      }
    });

    const _payment = await refreshInvoiceStatus(pay.HDON_MA);
    res.status(201).json({ ...pay, _payment });
  } catch (e) { next(e); }
}

// POST /payments/:id/succeed   (callback hoặc operator xác nhận)
async function markSucceeded(req, res, next) {
  try {
    const id = Number(req.params.id);
    const pay = await prisma.tHANH_TOAN.update({
      where: { TT_MA: id },
      data: { TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED' }
    });
    const _payment = await refreshInvoiceStatus(pay.HDON_MA);
    res.json({ ...pay, _payment });
  } catch (e) { next(e); }
}

// POST /payments/:id/failed
async function markFailed(req, res, next) {
  try {
    const id = Number(req.params.id);
    const pay = await prisma.tHANH_TOAN.update({
      where: { TT_MA: id },
      data: { TT_TRANG_THAI_GIAO_DICH: 'FAILED' }
    });
    const _payment = await refreshInvoiceStatus(pay.HDON_MA);
    res.json({ ...pay, _payment });
  } catch (e) { next(e); }
}

module.exports = { create, markSucceeded, markFailed };
