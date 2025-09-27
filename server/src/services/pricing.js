// services/pricing.service.js
const { prisma } = require('../db/prisma');

async function resolvePrice(LP_MA, HT_MA, date) {
    const d = new Date(date);
    // SPECIAL trước
    const sp = await prisma.dON_GIA.findFirst({
        where: {
            LP_MA, HT_MA,
            THOI_DIEM: {
                THOI_DIEM_SPECIAL: { is: { TD_NGAY_BAT_DAU: { lte: d }, TD_NGAY_KET_THUC: { gte: d } } }
            }
        },
        include: { THOI_DIEM: { include: { THOI_DIEM_SPECIAL: true } } },
        orderBy: [
            { THOI_DIEM: { THOI_DIEM_SPECIAL: { TD_NGAY_KET_THUC: 'asc' } } },
            { TD_MA: 'desc' }
        ]
    });
    if (sp) return sp.DG_DONGIA;

    // BASE
    const base = await prisma.dON_GIA.findFirst({
        where: { LP_MA, HT_MA, THOI_DIEM: { THOI_DIEM_BASE: { isNot: null } } }
    });
    return base?.DG_DONGIA ?? null;
}

module.exports = { resolvePrice };
