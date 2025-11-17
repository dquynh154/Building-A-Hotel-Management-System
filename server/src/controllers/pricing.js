// controllers/pricing.js
const { prisma } = require('../db/prisma');

function ymdLocal(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const y = x.getFullYear(), m = String(x.getMonth() + 1).padStart(2, '0'), day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function startOfDayLocal(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDaysLocal(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Chọn SPECIAL phù hợp nhất cho 1 "ngày" local (ưu tiên SPECIAL có TD_NGAY_BAT_DAU mới nhất)
function pickSpecialForDate(specials, day /* Date at 00:00 local */) {
    const t = day.getTime();
    let best = null;
    for (const s of specials) {
        const a = new Date(s.TD_NGAY_BAT_DAU); a.setHours(0, 0, 0, 0);
        const b = new Date(s.TD_NGAY_KET_THUC); b.setHours(23, 59, 59, 999);
        if (t >= a.getTime() && t <= b.getTime()) {
            if (!best) best = s;
            else {
                // ưu tiên SPECIAL có start muộn hơn (cụ thể hơn)
                const ba = new Date(best.TD_NGAY_BAT_DAU);
                if (a.getTime() > ba.getTime()) best = s;
                else if (a.getTime() === ba.getTime() && (s.TD_MA > best.TD_MA)) best = s;
            }
        }
    }
    return best;
}

async function quote(req, res, next) {
    try {
        const { PHONG_MA, LP_MA: LP_MA_Q, HT_MA, from, to } = req.query || {};

        // 1) validate thời gian
        const start = new Date(String(from || ''));
        const end = new Date(String(to || ''));
        if (!from || !to || isNaN(+start) || isNaN(+end) || +end <= +start) {
            const e = new Error('Khoảng thời gian không hợp lệ'); e.status = 400; throw e;
        }
        if (!HT_MA) { const e = new Error('Thiếu HT_MA (hình thức thuê)'); e.status = 400; throw e; }

        // 2) resolve LP_MA
        let LP_MA = Number(LP_MA_Q) || null;
        if (!LP_MA) {
            if (!PHONG_MA) { const e = new Error('Thiếu PHONG_MA hoặc LP_MA'); e.status = 400; throw e; }
            const room = await prisma.pHONG.findUnique({
                where: { PHONG_MA: Number(PHONG_MA) },
                select: { LP_MA: true },
            });
            LP_MA = room?.LP_MA || null;
        }
        if (!LP_MA) { const e = new Error('Không tìm thấy loại phòng'); e.status = 404; throw e; }

        // 3) Lấy "BASE TD" đang active (chọn cái đầu tiên)
        const baseTD = await prisma.tHOI_DIEM.findFirst({
            where: { TD_TRANGTHAI: true, THOI_DIEM_BASE: { isNot: null } },
            select: { TD_MA: true },
            orderBy: { TD_MA: 'asc' }, // bạn có thể đổi theo ưu tiên khác
        });
        const baseTD_MA = baseTD?.TD_MA || null;

        // 4) Lấy các SPECIAL chồng với khoảng yêu cầu
        //    (chỉ cần những special active và có khoảng ngày chạm vào [start, end))
        const specials = await prisma.tHOI_DIEM_SPECIAL.findMany({
            where: {
                THOI_DIEM: { TD_TRANGTHAI: true },
                TD_NGAY_BAT_DAU: { lte: end },
                TD_NGAY_KET_THUC: { gte: start },
            },
            select: { TD_MA: true, TD_NGAY_BAT_DAU: true, TD_NGAY_KET_THUC: true },
        });

        // 5) Mode tính & đơn giá
        const diffMs = end.getTime() - start.getTime();
        const diffHours = diffMs / 36e5;

        // Helper: lấy đơn giá theo TD_MA (có fallback BASE nếu TD_MA không có giá)
        const priceCache = new Map(); // TD_MA -> number
        async function getPriceForTD(td_ma) {
            if (!td_ma && !baseTD_MA) return null;
            const key = td_ma || baseTD_MA;
            if (priceCache.has(key)) return priceCache.get(key);

            // cố lấy đúng TD trước
            let rec = td_ma ? await prisma.dON_GIA.findUnique({
                where: { LP_MA_HT_MA_TD_MA: { LP_MA: Number(LP_MA), HT_MA: Number(HT_MA), TD_MA: Number(td_ma) } },
                select: { DG_DONGIA: true },
            }) : null;

            // fallback về BASE nếu không có giá cho SPECIAL
            if (!rec && baseTD_MA && td_ma !== baseTD_MA) {
                rec = await prisma.dON_GIA.findUnique({
                    where: { LP_MA_HT_MA_TD_MA: { LP_MA: Number(LP_MA), HT_MA: Number(HT_MA), TD_MA: Number(baseTD_MA) } },
                    select: { DG_DONGIA: true },
                });
            }

            const val = rec ? Number(rec.DG_DONGIA || 0) : null;
            priceCache.set(key, val);
            return val;
        }

        let mode = 'DAY';
        let total = 0;
        let daysArr = null;

        if (diffHours > 0 && diffHours <= 6) {
            // ===== THEO GIỜ (kể cả qua 0h) =====
            mode = 'HOUR';

            // chọn SPECIAL theo "ngày chứa thời điểm bắt đầu"
            const dayStart = startOfDayLocal(start);
            const match = pickSpecialForDate(specials, dayStart);
            const tdForHour = match?.TD_MA || baseTD_MA;

            const unit = await getPriceForTD(tdForHour);
            if (!unit) { const e = new Error('Chưa khai báo đơn giá cho loại phòng/hình thức ở thời điểm này'); e.status = 404; throw e; }

            // block 30 phút
            const stepMin = 30;
            const billedMinutes = Math.ceil(diffMs / (stepMin * 60 * 1000)) * stepMin;
            const billedHours = billedMinutes / 60;

            total = billedHours * unit;
        } else {
            // ===== THEO ĐÊM =====
            mode = 'DAY';

            const startDay = startOfDayLocal(start);
            const endDay = startOfDayLocal(end); // ngày checkout 00:00
            let nights = Math.ceil((endDay.getTime() - startDay.getTime()) / 86400000);
            nights = Math.max(1, nights);

            daysArr = [];
            for (let i = 0; i < nights; i++) {
                const di = addDaysLocal(startDay, i);
                const match = pickSpecialForDate(specials, di);
                const td = match?.TD_MA || baseTD_MA;

                const unit = await getPriceForTD(td);
                if (!unit) { const e = new Error(`Chưa khai báo đơn giá cho ngày ${ymdLocal(di)}`); e.status = 404; throw e; }

                daysArr.push({ date: ymdLocal(di), price: unit });
                total += unit;
            }
        }

        return res.json({ mode, total, daysArr });
    } catch (e) {
        next(e);
    }
}

module.exports = { quote };


// controllers/pricing.js
// const { prisma } = require('../db/prisma');

// /**
//  * GET /pricing/quote
//  * query: { PHONG_MA?, LP_MA?, HT_MA, from, to }
//  * - Nếu cùng ngày và chênh lệch <= 6 giờ => HOUR
//  * - Ngược lại => DAY (theo đêm/ngày)
//  * Trả về: { mode: 'HOUR'|'DAY', total: number, daysArr?: [{date, price}] }
//  */
// async function quote(req, res, next) {
//     try {
//         const { PHONG_MA, LP_MA: LP_MA_Q, HT_MA, from, to } = req.query || {};

//         // 1) validate thời gian
//         const start = new Date(String(from || ''));
//         const end = new Date(String(to || ''));
//         if (!from || !to || isNaN(+start) || isNaN(+end) || +end <= +start) {
//             const e = new Error('Khoảng thời gian không hợp lệ'); e.status = 400; throw e;
//         }

//         // 2) resolve LP_MA
//         let LP_MA = Number(LP_MA_Q) || null;
//         if (!LP_MA) {
//             if (!PHONG_MA) { const e = new Error('Thiếu PHONG_MA hoặc LP_MA'); e.status = 400; throw e; }
//             const room = await prisma.pHONG.findUnique({
//                 where: { PHONG_MA: Number(PHONG_MA) },
//                 select: { LP_MA: true },
//             });
//             LP_MA = room?.LP_MA || null;
//         }
//         if (!LP_MA) { const e = new Error('Không tìm thấy loại phòng'); e.status = 404; throw e; }

//         // 3) đơn giá: bảng DON_GIA có cột DG_DONGIA (không có DG_GIO/DG_NGAY)
//         const dg = await prisma.dON_GIA.findFirst({
//             where: { LP_MA: Number(LP_MA), HT_MA: Number(HT_MA) },
//             select: { DG_DONGIA: true },
//         });
//         if (!dg) { const e = new Error('Chưa khai báo đơn giá cho loại phòng / hình thức này'); e.status = 404; throw e; }
//         const unitPrice = Number(dg.DG_DONGIA || 0);

//         // 4) xác định mode: HOUR hay DAY
//         const sameYmd = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
//         const diffHours = (end.getTime() - start.getTime()) / 36e5;

//         let mode = 'DAY';
//         let total = 0;
//         let daysArr = null;

//         if (sameYmd && diffHours > 0 && diffHours <= 6) {
//             // ===== THEO GIỜ =====
//             mode = 'HOUR';
//             // thường tính tròn giờ lên
//             const hoursBill = Math.ceil(diffHours);
//             total = hoursBill * unitPrice;
//         } else {
//             // ===== THEO ĐÊM / NGÀY =====
//             mode = 'DAY';
//             // số đêm tính theo ngày (checkin 14:00 → checkout 12:00 vẫn tính 1 đêm)
//             // làm tròn lên nếu lẻ
//             const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
//             const nights = Math.max(1, diffDays);
//             total = nights * unitPrice;

//             // phát sinh mảng từng ngày để FE bôi màu / hiển thị
//             daysArr = [];
//             for (let i = 0; i < nights; i++) {
//                 const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
//                 daysArr.push({ date: d.toISOString().slice(0, 10), price: unitPrice });
//             }
//         }

//         return res.json({ mode, total, daysArr });
//     } catch (e) { next(e); }
// }

// module.exports = { quote };
