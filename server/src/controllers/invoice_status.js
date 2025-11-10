// controllers/invoice_status.js
const { prisma } = require('../db/prisma');

const toNum = v => Number(v || 0);

// exports.byBooking = async (req, res, next) => {
//     try {
//         const hdId = Number(req.params.hdId);

//         // tìm link hóa đơn ↔ hợp đồng (nếu có)
//         const link = await prisma.hOA_DON_HOP_DONG.findFirst({
//             where: { HDONG_MA: hdId },
//             select: { HDON_MA: true }
//         });

//         if (!link) {
//             return res.json({
//                 hasInvoice: false,
//                 status: 'NO_INVOICE',
//                 paid: 0,
//                 due: 0,
//                 total: 0,
//                 invoiceId: null
//             });
//         }

//         const invoice = await prisma.hOA_DON.findUnique({
//             where: { HDON_MA: link.HDON_MA },
//             select: {
//                 HDON_MA: true,
//                 HDON_TRANG_THAI: true,
//                 HDON_THANH_TIEN: true
//             }
//         });

//         // tổng tiền đã thanh toán (SUCCEEDED)
//         const pays = await prisma.tHANH_TOAN.findMany({
//             where: { HDON_MA: link.HDON_MA, TT_TRANG_THAI_GIAO_DICH: 'SUCCEEDED' },
//             select: { TT_SO_TIEN: true }
//         });
//         const paid = pays.reduce((s, p) => s + toNum(p.TT_SO_TIEN), 0);
//         const total = toNum(invoice?.HDON_THANH_TIEN || 0);
//         const due = Math.max(0, total - paid);

//         res.json({
//             hasInvoice: true,
//             invoiceId: invoice.HDON_MA,
//             status: invoice.HDON_TRANG_THAI, // ISSUED | PAID | ...
//             total,
//             paid,
//             due
//         });
//     } catch (e) { next(e); }
// };

exports.byBooking = async (req, res, next) => {
    try {
        const hdId = Number(req.params.hdId);

        const invoice = await prisma.hOA_DON.findFirst({
            where: {
                LIEN_KET: { some: { HDONG_MA: hdId } },
                HDON_LOAI: "MAIN",
            },
            select: {
                HDON_MA: true,
                HDON_TRANG_THAI: true,
                HDON_THANH_TIEN: true,
            },
        });

        if (!invoice) {
            return res.json({
                hasInvoice: false,
                status: "NO_INVOICE",
                total: 0,
                paid: 0,
                due: 0,
            });
        }

        const pays = await prisma.tHANH_TOAN.findMany({
            where: { HDON_MA: invoice.HDON_MA, TT_TRANG_THAI_GIAO_DICH: "SUCCEEDED" },
            select: { TT_SO_TIEN: true },
        });
        const paid = pays.reduce((s, p) => s + Number(p.TT_SO_TIEN || 0), 0);
        const total = Number(invoice.HDON_THANH_TIEN || 0);
        const due = Math.max(0, total - paid);

        res.json({
            hasInvoice: true,
            invoiceId: invoice.HDON_MA,
            status: invoice.HDON_TRANG_THAI,
            total,
            paid,
            due,
        });
    } catch (e) {
        next(e);
    }
};

