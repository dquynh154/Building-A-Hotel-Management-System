// booking_lite.js
const { prisma } = require('../db/prisma');

const toDate = (v) => (v ? new Date(v) : null);

// overlap check: [a1,a2) với [b1,b2)
function overlap(a1, a2, b1, b2) {
    return (!a2 || !b2 || a1 < b2) && (!b1 || !a1 || b1 < a2);
}

// GET /bookings/lite?from=ISO&to=ISO&search=...
// Trả về mảng item cấp CTSD (1 CTSD = 1 block trên timeline)
async function lite(req, res, next) {
    try {
        const from = toDate(req.query.from);
        const to = toDate(req.query.to);
        const q = (req.query.search || '').toString().trim();

        // Lấy CTSD (ACTIVE/INVOICED) + join HĐ + KH + Phòng
        const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: {
                CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
                // lọc thô theo khoảng nếu có (đẩy vào SQL cho nhanh)
                OR: from && to ? [
                    { AND: [{ CTSD_O_TU_GIO: { lte: to } }, { CTSD_O_DEN_GIO: { gte: from } }] },
                    { AND: [{ CTSD_NGAY_DA_O: { gte: from } }, { CTSD_NGAY_DA_O: { lte: to } }] },
                ] : undefined,
            },
            include: {
                HOP_DONG_DAT_PHONG: {
                    select: {
                        HDONG_MA: true,
                        KHACH_HANG: { select: { KH_HOTEN: true } },
                        HT_MA: true,
                        HDONG_TRANG_THAI: true,
                    }
                },
                PHONG: { select: { PHONG_MA: true, PHONG_TEN: true } },
            },
            orderBy: [{ HDONG_MA: 'desc' }, { PHONG_MA: 'asc' }, { CTSD_STT: 'asc' }]
        });

        // Map về dạng gọn cho FE
        let rows = ctsd.map(r => {
            // Tính TU_LUC/DEN_LUC: ưu tiên giờ; nếu theo đêm thì dùng CTSD_NGAY_DA_O → +1 ngày (đơn giản)
            const tu = r.CTSD_O_TU_GIO || r.CTSD_NGAY_DA_O;
            const den = r.CTSD_O_DEN_GIO || (r.CTSD_NGAY_DA_O ? new Date(new Date(r.CTSD_NGAY_DA_O).getTime() + 24 * 3600 * 1000) : null);

            return {
                HDONG_MA: r.HDONG_MA,
                PHONG_MA: r.PHONG_MA,
                PHONG_TEN: r.PHONG?.PHONG_TEN ?? '',
                KH_TEN: r.HOP_DONG_DAT_PHONG?.KHACH_HANG?.KH_HOTEN ?? null,
                HT_MA: r.HOP_DONG_DAT_PHONG?.HT_MA ?? 0,
                TRANG_THAI: r.HOP_DONG_DAT_PHONG?.HDONG_TRANG_THAI ?? 'PENDING',
                TU_LUC: tu ? new Date(tu).toISOString() : null,
                DEN_LUC: den ? new Date(den).toISOString() : null,
            };
        });

        // Lọc overlap chuẩn xác lần cuối (trường hợp theo đêm sinh DEN_LUC +1d)
        if (from && to) {
            rows = rows.filter(r => overlap(new Date(r.TU_LUC), new Date(r.DEN_LUC), from, to));
        }

        // Lọc search: theo tên KH / tên phòng / mã HĐ
        if (q) {
            const ql = q.toLowerCase();
            rows = rows.filter(r =>
                String(r.HDONG_MA).includes(q) ||
                (r.KH_TEN && r.KH_TEN.toLowerCase().includes(ql)) ||
                (r.PHONG_TEN && r.PHONG_TEN.toLowerCase().includes(ql))
            );
        }

        res.json(rows);
    } catch (e) { next(e); }
}

module.exports = { lite };
