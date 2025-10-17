// controllers/pricing.js
const { prisma } = require('../db/prisma');

/**
 * GET /pricing/quote
 * query: { PHONG_MA?, LP_MA?, HT_MA, from, to }
 * - Nếu cùng ngày và chênh lệch <= 6 giờ => HOUR
 * - Ngược lại => DAY (theo đêm/ngày)
 * Trả về: { mode: 'HOUR'|'DAY', total: number, daysArr?: [{date, price}] }
 */
async function quote(req, res, next) {
    try {
        const { PHONG_MA, LP_MA: LP_MA_Q, HT_MA, from, to } = req.query || {};

        // 1) validate thời gian
        const start = new Date(String(from || ''));
        const end = new Date(String(to || ''));
        if (!from || !to || isNaN(+start) || isNaN(+end) || +end <= +start) {
            const e = new Error('Khoảng thời gian không hợp lệ'); e.status = 400; throw e;
        }

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

        // 3) đơn giá: bảng DON_GIA có cột DG_DONGIA (không có DG_GIO/DG_NGAY)
        const dg = await prisma.dON_GIA.findFirst({
            where: { LP_MA: Number(LP_MA), HT_MA: Number(HT_MA) },
            select: { DG_DONGIA: true },
        });
        if (!dg) { const e = new Error('Chưa khai báo đơn giá cho loại phòng / hình thức này'); e.status = 404; throw e; }
        const unitPrice = Number(dg.DG_DONGIA || 0);

        // 4) xác định mode: HOUR hay DAY
        const sameYmd = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
        const diffHours = (end.getTime() - start.getTime()) / 36e5;

        let mode = 'DAY';
        let total = 0;
        let daysArr = null;

        if (sameYmd && diffHours > 0 && diffHours <= 6) {
            // ===== THEO GIỜ =====
            mode = 'HOUR';
            // thường tính tròn giờ lên
            const hoursBill = Math.ceil(diffHours);
            total = hoursBill * unitPrice;
        } else {
            // ===== THEO ĐÊM / NGÀY =====
            mode = 'DAY';
            // số đêm tính theo ngày (checkin 14:00 → checkout 12:00 vẫn tính 1 đêm)
            // làm tròn lên nếu lẻ
            const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
            const nights = Math.max(1, diffDays);
            total = nights * unitPrice;

            // phát sinh mảng từng ngày để FE bôi màu / hiển thị
            daysArr = [];
            for (let i = 0; i < nights; i++) {
                const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
                daysArr.push({ date: d.toISOString().slice(0, 10), price: unitPrice });
            }
        }

        return res.json({ mode, total, daysArr });
    } catch (e) { next(e); }
}

module.exports = { quote };
