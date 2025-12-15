// GET /availability/room-types?from=ISO&to=ISO&ht=DAY|HOUR
const { prisma } = require('../db/prisma');

const TD_BASE = 1;
const HT_MAP = { DAY: 1, HOUR: 2 };

function toDate(v) {
    const d = new Date(v);
    return isNaN(+d) ? null : d;
}

async function roomTypeAvailability(req, res, next) {
    try {
        const from = toDate(req.query.from);
        const to = toDate(req.query.to);

        if (!from || !to || !(to > from)) {
            return res.status(400).json({ message: 'from/to không hợp lệ' });
        }

        const htKey = String(req.query.ht || 'DAY').toUpperCase();
        const HT_MA = HT_MAP[htKey] || HT_MAP.DAY;

        /* ======================================================
         * 1) Tổng số phòng theo loại
         * ====================================================== */
        const allRooms = await prisma.pHONG.findMany({
            select: { PHONG_MA: true, LP_MA: true },
        });

        const totalByLP = new Map();
        for (const r of allRooms) {
            totalByLP.set(r.LP_MA, (totalByLP.get(r.LP_MA) || 0) + 1);
        }

        /* ======================================================
         * 2) Chuẩn hóa mốc ngày / giờ
         * ====================================================== */
        const fromDay = new Date(from);
        fromDay.setHours(0, 0, 0, 0);

        const toDay = new Date(to);
        toDay.setHours(0, 0, 0, 0);

        /* ======================================================
         * 3) PHÒNG BẬN THEO NGÀY
         * - chỉ ACTIVE, INVOICED
         * - DOI_PHONG KHÔNG tính
         * ====================================================== */
        const busyByDay = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: {
                CTSD_TRANGTHAI: { in: ['ACTIVE'] },
                CTSD_NGAY_DA_O: {
                    gte: fromDay,
                    lt: toDay,
                },
            },
            select: { PHONG_MA: true },
        });

        /* ======================================================
         * 4) PHÒNG BẬN THEO GIỜ
         * ====================================================== */
        const busyByHour = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: {
                CTSD_TRANGTHAI: { in: ['ACTIVE'] },
                CTSD_O_TU_GIO: { lt: to },
                CTSD_O_DEN_GIO: { gt: from },
            },
            select: { PHONG_MA: true },
        });

        /* ======================================================
         * 5) TẬP PHÒNG BẬN – tùy hình thức thuê
         * ====================================================== */
        const busyRoomIds = new Set([
            ...busyByDay.map(x => x.PHONG_MA),
            ...busyByHour.map(x => x.PHONG_MA),
        ]);


        /* ======================================================
         * 6) ĐẶT TRƯỚC (CT_DAT_TRUOC)
         * - CHỈ tính khi hợp đồng CHƯA có CTSD ACTIVE
         * ====================================================== */
        const prebooked = await prisma.cT_DAT_TRUOC.findMany({
            where: {
                TRANG_THAI: { in: ['PENDING', 'CONFIRMED'] },
                HOP_DONG_DAT_PHONG: {
                    HDONG_TRANG_THAI: { in: ['PENDING', 'CONFIRMED'] },
                    AND: [
                        { HDONG_NGAYDAT: { lt: to } },
                        { HDONG_NGAYTRA: { gt: from } },
                    ],
                    CHI_TIET_SU_DUNG: {
                        none: {
                            CTSD_TRANGTHAI: { in: ['ACTIVE'] },
                        },
                    },
                },
            },
            select: { LP_MA: true, SO_LUONG: true },
        });

        const prebookedByLP = new Map();
        for (const p of prebooked) {
            prebookedByLP.set(
                p.LP_MA,
                (prebookedByLP.get(p.LP_MA) || 0) + (p.SO_LUONG || 0)
            );
        }

        /* ======================================================
         * 7) Đếm phòng bận theo LP
         * ====================================================== */
        const busyByLP = new Map();

        for (const r of allRooms) {
            if (busyRoomIds.has(r.PHONG_MA)) {
                busyByLP.set(r.LP_MA, (busyByLP.get(r.LP_MA) || 0) + 1);
            }
        }

        for (const [lp, qty] of prebookedByLP.entries()) {
            busyByLP.set(lp, (busyByLP.get(lp) || 0) + qty);
        }

        /* ======================================================
         * 8) Giá base
         * ====================================================== */
        const basePrices = await prisma.dON_GIA.findMany({
            where: { TD_MA: TD_BASE, HT_MA },
            select: { LP_MA: true, DG_DONGIA: true },
        });

        const priceByLP = new Map(
            basePrices.map(p => [p.LP_MA, Number(p.DG_DONGIA)])
        );

        /* ======================================================
         * 9) Kết quả
         * ====================================================== */
        const lpList = await prisma.lOAI_PHONG.findMany({
            select: { LP_MA: true, LP_TEN: true },
        });

        const rows = lpList.map(lp => {
            const total = totalByLP.get(lp.LP_MA) || 0;
            const busy = busyByLP.get(lp.LP_MA) || 0;
            const free = Math.max(0, total - busy);

            return {
                LP_MA: lp.LP_MA,
                LP_TEN: lp.LP_TEN,
                totalRooms: total,
                busyRooms: busy,
                freeRooms: free,
                price: priceByLP.get(lp.LP_MA) || 0,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error('ERR /availability/room-types:', err);
        next(err);
    }
}

module.exports = { roomTypeAvailability };
