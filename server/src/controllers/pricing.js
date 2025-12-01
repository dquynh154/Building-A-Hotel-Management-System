const { prisma } = require('../db/prisma');

// chuyển Date (hoặc string) → "YYYY-MM-DD"
function toYMD(d) {
    const dt = new Date(d);
    return dt.toISOString().slice(0, 10);  // luôn lấy ngày UTC → tuyệt đối ổn định
}

// Kiểm tra ngày ymd nằm trong SPECIAL hay không (cũng theo ymd)
function isInRange(ymd, fromYMD, toYMD) {
    return ymd >= fromYMD && ymd <= toYMD;
}

async function quote(req, res, next) {
    try {
        const { PHONG_MA, LP_MA: LP_Q, HT_MA, from, to } = req.query;

        if (!from || !to) {
            return res.status(400).json({ message: "Thiếu ngày" });
        }

        const startYMD = from; // "2025-12-25"
        const endYMD = to;   // "2025-12-27"

        // tính số đêm = end - start
        const d1 = new Date(startYMD);
        const d2 = new Date(endYMD);
        let nights = Math.round((d2 - d1) / 86400000);
        if (nights < 1) nights = 1;

        // resolve LP_MA
        let LP_MA = Number(LP_Q);
        if (!LP_MA) {
            const room = await prisma.pHONG.findUnique({
                where: { PHONG_MA: Number(PHONG_MA) },
                select: { LP_MA: true },
            });
            LP_MA = room?.LP_MA;
        }

        // lấy TD cơ bản
        const baseTD = await prisma.tHOI_DIEM.findFirst({
            where: { TD_TRANGTHAI: true, THOI_DIEM_BASE: { isNot: null } },
            orderBy: { TD_MA: 'asc' },
        });
        const baseTD_MA = baseTD?.TD_MA;

        // lấy SPECIAL giao khoảng [from, to)
        const specials = await prisma.tHOI_DIEM_SPECIAL.findMany({
            where: {
                THOI_DIEM: { TD_TRANGTHAI: true },
                TD_NGAY_BAT_DAU: { lte: new Date(endYMD) },
                TD_NGAY_KET_THUC: { gte: new Date(startYMD) }
            },
            select: {
                TD_MA: true,
                TD_NGAY_BAT_DAU: true,
                TD_NGAY_KET_THUC: true
            }
        }).then(list =>
            list.map(sp => ({
                TD_MA: sp.TD_MA,
                fromYMD: toYMD(sp.TD_NGAY_BAT_DAU),
                toYMD: toYMD(sp.TD_NGAY_KET_THUC)
            }))
        );

        // cache đơn giá
        const priceCache = new Map();
        async function getPrice(TD_MA) {
            if (priceCache.has(TD_MA)) return priceCache.get(TD_MA);

            const rec = await prisma.dON_GIA.findUnique({
                where: { LP_MA_HT_MA_TD_MA: { LP_MA, HT_MA: Number(HT_MA), TD_MA } },
                select: { DG_DONGIA: true }
            });

            const val = rec ? Number(rec.DG_DONGIA) : null;
            priceCache.set(TD_MA, val);
            return val;
        }

        // tính giá từng đêm
        let total = 0;
        let daysArr = [];

        for (let i = 0; i < nights; i++) {
            const d = new Date(startYMD);
            d.setDate(d.getDate() + i);
            const ymd = toYMD(d);

            // chọn SPECIAL theo YYYY-MM-DD
            let td = baseTD_MA;
            for (const sp of specials) {
                if (isInRange(ymd, sp.fromYMD, sp.toYMD)) {
                    td = sp.TD_MA;
                    break;
                }
            }

            const price = await getPrice(td);
            if (!price) {
                return res.status(400).json({ message: `Thiếu giá cho ngày ${ymd}` });
            }

            total += price;
            daysArr.push({ date: ymd, price });
        }

        return res.json({ mode: "DAY", nights, total, daysArr });

    } catch (err) {
        console.error(err);
        next(err);
    }
}

module.exports = { quote };
