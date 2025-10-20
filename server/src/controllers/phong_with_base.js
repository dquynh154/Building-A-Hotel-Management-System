// src/controllers/phong_with_base.js
const { prisma } = require('../db/prisma');

const TD_BASE = 1;               // thời điểm base
const HT_ID = { DAY: 1, HOUR: 2 }; // map cố định theo DB của bạn

const money = n => Number(n || 0);

async function listRoomsWithBasePrice(req, res, next) {
    try {
        // lấy danh sách phòng kèm loại phòng và ĐƠN GIÁ base cho 2 HT
        const rooms = await prisma.pHONG.findMany({
            include: {
                LOAI_PHONG: {
                    include: {
                        DON_GIA: {
                            where: {
                                TD_MA: TD_BASE,
                                HT_MA: { in: [HT_ID.DAY, HT_ID.HOUR] },
                            },
                            select: {
                                HT_MA: true,
                                TD_MA: true,
                                DG_DONGIA: true,
                            }
                        }
                    }
                }
            },
            orderBy: [{ TANG_MA: 'asc' }, { PHONG_TEN: 'asc' }],
        });

        const data = rooms.map(r => {
            const list = r.LOAI_PHONG?.DON_GIA || [];

            // mặc định null nếu không có
            let PRICE_DAY = null;
            let PRICE_HOUR = null;

            for (const p of list) {
                if (p.HT_MA === HT_ID.DAY) PRICE_DAY = money(p.DG_DONGIA);
                if (p.HT_MA === HT_ID.HOUR) PRICE_HOUR = money(p.DG_DONGIA);
            }

            return {
                ...r,
                PRICE_DAY,
                PRICE_HOUR,
                // nếu bạn muốn vẫn gửi nguyên list đơn giá base cho phòng:
                PRICES_BASE: list,
            };
        });

        res.json(data);
    } catch (e) { next(e); }
}

module.exports = { listRoomsWithBasePrice };
