// controllers/invoice_status.js
const { prisma } = require('../db/prisma');

const toNum = (v) => Number(v || 0);

exports.byBooking = async (req, res, next) => {
    try {
        const hdId = Number(req.params.hdId);
        if (!Number.isFinite(hdId) || hdId <= 0) {
            return res.status(400).json({ message: 'hdId không hợp lệ' });
        }

        // 1) Tìm link HĐ ↔ Hóa đơn
        const link = await prisma.hOA_DON_HOP_DONG.findFirst({
            where: { HDONG_MA: hdId },
            select: { HDON_MA: true }
        });

        if (!link) {
            return res.json({
                hasInvoice: false,
                status: 'NO_INVOICE',
                invoiceId: null,
                total: 0,
                paid: 0,
                due: 0,
                over: 0,
                ts: Date.now()  // giúp FE bust cache nếu cần
            });
        }

        // 2) Lấy hóa đơn
        const invoice = await prisma.hOA_DON.findUnique({
            where: { HDON_MA: link.HDON_MA },
            select: {
                HDON_MA: true,
                HDON_TRANG_THAI: true,     // ISSUED | PAID | ...
                HDON_THANH_TIEN: true      // tổng tiền hóa đơn (đã cộng phòng + DV)
            }
        });

        const total = toNum(invoice?.HDON_THANH_TIEN);

        // 3) Tổng tiền đã thu (chỉ tính giao dịch thành công)
        // Dùng aggregate gọn/nhanh hơn
        const paidAgg = await prisma.tHANH_TOAN.aggregate({
            _sum: { TT_SO_TIEN: true },
            where: {
                HDON_MA: link.HDON_MA,
                TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED'
            }
        });
        const paid = toNum(paidAgg._sum.TT_SO_TIEN);

        // 4) Tính còn thiếu/dư
        const due = Math.max(0, total - paid);
        const over = Math.max(0, paid - total);

        // 5) Trả về số liệu chuẩn để FE render trực tiếp (không suy luận)
        return res.json({
            hasInvoice: true,
            invoiceId: invoice?.HDON_MA ?? null,
            status: invoice?.HDON_TRANG_THAI ?? 'UNKNOWN',
            total,
            paid,
            due,
            over,
            ts: Date.now()
        });
    } catch (e) {
        next(e);
    }
};
