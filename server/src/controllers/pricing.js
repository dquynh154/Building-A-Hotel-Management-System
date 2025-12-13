const { prisma } = require('../db/prisma');

// Chuyển datetime -> YYYY-MM-DD (không lệch timezone)
function toYMD(d) {
    const dt = new Date(d);
    return dt.toISOString().slice(0, 10);
}

// So sánh ngày theo chuỗi YYYY-MM-DD (ổn định tuyệt đối)
function isInRange(ymd, fromYMD, toYMD) {
    return ymd >= fromYMD && ymd <= toYMD;
}

module.exports.quote = async function quote(req, res, next) {
    try {
        const { PHONG_MA, LP_MA: LP_INPUT, HT_MA, from, to } = req.query;

        if (!from || !to || !HT_MA) {
            return res.status(400).json({ message: 'Thiếu tham số from/to/HT_MA' });
        }

        // 1) Ngày ở dạng YMD
        const startYMD = from; // "2025-12-25"
        const endYMD = to;   // "2025-12-27"

        const startDate = new Date(startYMD);
        const endDate = new Date(endYMD);

        if (isNaN(startDate) || isNaN(endDate) || endDate <= startDate) {
            return res.status(400).json({ message: 'Khoảng thời gian không hợp lệ' });
        }

        // 2) Resolve LP_MA nếu người dùng chỉ gửi PHONG_MA
        let LP_MA = Number(LP_INPUT) || null;
        if (!LP_MA && PHONG_MA) {
            const room = await prisma.pHONG.findUnique({
                where: { PHONG_MA: Number(PHONG_MA) },
                select: { LP_MA: true }
            });
            LP_MA = room?.LP_MA || null;
        }
        if (!LP_MA) {
            return res.status(400).json({ message: 'Không xác định được loại phòng (LP_MA)' });
        }

        // 3) Lấy "BASE TD" — thời điểm cơ bản
        const baseTD = await prisma.tHOI_DIEM.findFirst({
            where: { TD_TRANGTHAI: true, THOI_DIEM_BASE: { isNot: null } },
            select: { TD_MA: true },
            orderBy: { TD_MA: 'asc' },
        });
        const baseTD_MA = baseTD?.TD_MA;

        // 4) Lấy SPECIAL có giao với [from, to]
        let specials = await prisma.tHOI_DIEM_SPECIAL.findMany({
            where: {
                THOI_DIEM: { TD_TRANGTHAI: true },
                TD_NGAY_BAT_DAU: { lte: endDate },
                TD_NGAY_KET_THUC: { gte: startDate }
            },
            select: {
                TD_MA: true,
                TD_NGAY_BAT_DAU: true,
                TD_NGAY_KET_THUC: true
            }
        });

        // chuyển về dạng YYYY-MM-DD để so sánh cho stable
        specials = specials.map(sp => ({
            TD_MA: sp.TD_MA,
            fromYMD: toYMD(sp.TD_NGAY_BAT_DAU),
            toYMD: toYMD(sp.TD_NGAY_KET_THUC)
        }));

        // 5) MODE = GIỜ hay NGÀY?
        const diffMs = endDate - startDate;
        const diffHours = diffMs / 36e5;

        // Cache giá TD
        const priceCache = new Map();
        async function getPrice(TD_MA) {
            const cacheKey = `${TD_MA}`;
            if (priceCache.has(cacheKey)) return priceCache.get(cacheKey);

            // 1️⃣ Thử giá theo TD_MA (SPECIAL hoặc BASE)
            let rec = await prisma.dON_GIA.findUnique({
                where: {
                    LP_MA_HT_MA_TD_MA: {
                        LP_MA,
                        HT_MA: Number(HT_MA),
                        TD_MA
                    }
                },
                select: { DG_DONGIA: true }
            });

            // 2️⃣ Nếu không có → fallback về BASE
            if (!rec && TD_MA !== baseTD_MA) {
                rec = await prisma.dON_GIA.findUnique({
                    where: {
                        LP_MA_HT_MA_TD_MA: {
                            LP_MA,
                            HT_MA: Number(HT_MA),
                            TD_MA: baseTD_MA
                        }
                    },
                    select: { DG_DONGIA: true }
                });
            }

            const val = rec ? Number(rec.DG_DONGIA) : null;
            priceCache.set(cacheKey, val);
            return val;
        }


        // ============================================================
        // ======================== MODE = HOUR ========================
        // ============================================================
        if (diffHours > 0 && diffHours <= 6) {
            const mode = 'HOUR';

            // "Ngày" để xét special theo giờ là ngày bắt đầu
            const startYMD_Hour = toYMD(startDate);

            let td = baseTD_MA;
            for (const sp of specials) {
                if (isInRange(startYMD_Hour, sp.fromYMD, sp.toYMD)) {
                    td = sp.TD_MA;
                    break;
                }
            }

            const unit = await getPrice(td);
            if (!unit) {
                return res.status(400).json({ message: 'Thiếu đơn giá (HOUR)' });
            }

            // block 30 phút
            const billedMinutes = Math.ceil(diffMs / (30 * 60 * 1000)) * 30;
            const billedHours = billedMinutes / 60;

            const total = billedHours * unit;

            return res.json({
                mode,
                total,
                billedHours,
                unit,
            });
        }

        // ============================================================
        // ======================== MODE = DAY =========================
        // ============================================================
        const mode = 'DAY';

        let nights = Math.round((endDate - startDate) / 86400000);
        nights = Math.max(1, nights);

        let total = 0;
        const daysArr = [];

        for (let i = 0; i < nights; i++) {
            const d = new Date(startYMD);
            d.setDate(d.getDate() + i);
            const ymd = toYMD(d); // stable, không lệch giờ

            // Xác định TD (SPECIAL hoặc BASE)
            let td = baseTD_MA;
            for (const sp of specials) {
                if (isInRange(ymd, sp.fromYMD, sp.toYMD)) {
                    td = sp.TD_MA;
                    break;
                }
            }

            const price = await getPrice(td);
            if (!price) {
                return res.status(400).json({ message: `Thiếu đơn giá cho ngày ${ymd}` });
            }

            total += price;
            daysArr.push({ date: ymd, price });
        }

        return res.json({
            mode,
            nights,
            total,
            daysArr
        });

    } catch (err) {
        console.error(err);
        next(err);
    }
};
