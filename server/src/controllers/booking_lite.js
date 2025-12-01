// server/src/controllers/booking_lite.js
// Phương án B: mỗi (HĐ × Phòng) chỉ 1 block, TU_LUC/DEN_LUC luôn lấy từ HỢP ĐỒNG

const { prisma } = require('../db/prisma');

// helper
const toDate = (v) => (v ? new Date(v) : null);

// overlap check: [a1,a2) với [b1,b2)
function overlap(a1, a2, b1, b2) {
    return (!a2 || !b2 || a1 < b2) && (!b1 || !a1 || b1 < a2);
}

// GET /bookings/lite?from=ISO&to=ISO&search=...
// Trả về mảng item đã GOM theo (HDONG_MA, PHONG_MA)
// - Thời gian block luôn lấy từ HỢP ĐỒNG: HDONG_NGAYDAT -> HDONG_NGAYTRA
// - Không hiển thị nhiều block cho các CTSD theo đêm nữa
// async function lite(req, res, next) {
//     try {
//         const from = toDate(req.query.from);
//         const to = toDate(req.query.to);
//         const q = (req.query.search || '').toString().trim().toLowerCase();

//         // Lấy CTSD thuộc các HĐ còn hiệu lực hiển thị (ACTIVE/INVOICED),
//         // kèm header HĐ để lấy HDONG_NGAYDAT/HDONG_NGAYTRA và tên KH
//         const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
//             where: {
//                 CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
//                 // (tuỳ chọn) lọc thô theo khoảng thời gian để giảm tải DB
//                 OR: from && to ? [
//                     // theo giờ (nếu có)
//                     { AND: [{ CTSD_O_TU_GIO: { lte: to } }, { CTSD_O_DEN_GIO: { gte: from } }] },
//                     // theo đêm (lọc theo ngày đã ở)
//                     { AND: [{ CTSD_NGAY_DA_O: { gte: from } }, { CTSD_NGAY_DA_O: { lte: to } }] },
//                 ] : undefined,
//             },
//             select: {
//                 HDONG_MA: true,
//                 PHONG_MA: true,
//                 CTSD_STT: true, // không bắt buộc dùng trong phương án B, nhưng giữ để debug
//                 PHONG: { select: { PHONG_TEN: true } },
//                 HOP_DONG_DAT_PHONG: {
//                     select: {
//                         HDONG_MA: true,
//                         HT_MA: true,
//                         HDONG_TRANG_THAI: true,
//                         HDONG_NGAYDAT: true,  // 👈 lấy giờ bắt đầu từ HĐ
//                         HDONG_NGAYTRA: true,  // 👈 lấy giờ kết thúc từ HĐ
//                         KHACH_HANG: { select: { KH_HOTEN: true } },
//                         HDONG_NGAYTHUCNHAN: true,
//                         HDONG_NGAYTHUCTRA: true,
//                     }
//                 },
//             },
//             orderBy: [
//                 { HDONG_MA: 'desc' },
//                 { PHONG_MA: 'asc' },
//                 { CTSD_STT: 'asc' },
//             ],
//         });

//         // Map sang dạng "thô": mỗi CTSD → 1 row, nhưng thời gian lấy TỪ HỢP ĐỒNG
//         let rows = ctsd.map(r => {
//             const hd = r.HOP_DONG_DAT_PHONG;
//             const tu = hd?.HDONG_NGAYDAT ? new Date(hd.HDONG_NGAYDAT) : null;
//             const den = hd?.HDONG_NGAYTRA ? new Date(hd.HDONG_NGAYTRA) : null;

//             return {
//                 HDONG_MA: r.HDONG_MA,
//                 PHONG_MA: r.PHONG_MA,
//                 PHONG_TEN: r.PHONG?.PHONG_TEN ?? '',
//                 KH_TEN: hd?.KHACH_HANG?.KH_HOTEN ?? null,
//                 HT_MA: hd?.HT_MA ?? 0,
//                 TRANG_THAI: hd?.HDONG_TRANG_THAI ?? 'PENDING',
//                 TU_LUC: tu ? tu.toISOString() : null,
//                 DEN_LUC: den ? den.toISOString() : null,

//                 HDONG_NGAYDAT: hd?.HDONG_NGAYDAT ? new Date(hd.HDONG_NGAYDAT).toISOString() : null,
//                 HDONG_NGAYTRA: hd?.HDONG_NGAYTRA ? new Date(hd.HDONG_NGAYTRA).toISOString() : null,
//                 HDONG_NGAYTHUCNHAN: hd?.HDONG_NGAYTHUCNHAN ? new Date(hd.HDONG_NGAYTHUCNHAN).toISOString() : null,
//                 HDONG_NGAYTHUCTRA: hd?.HDONG_NGAYTHUCTRA ? new Date(hd.HDONG_NGAYTHUCTRA).toISOString() : null,
//             };
//         });

//         // 👉 GOM về 1 block cho mỗi (HDONG_MA × PHONG_MA)
//         // Nếu nhiều CTSD cùng hợp đồng/phòng xuất hiện, chỉ giữ 1,
//         // TU_LUC/DEN_LUC đều lấy từ header HĐ nên thường giống nhau
//         const byKey = new Map();
//         for (const r of rows) {
//             const k = `${r.HDONG_MA}:${r.PHONG_MA}`;
//             const ex = byKey.get(k);
//             if (!ex) {
//                 byKey.set(k, r);
//             } else {
//                 // (tuỳ chọn) gộp min/max đề phòng dữ liệu lệch
//                 const tuMin = new Date(ex.TU_LUC) < new Date(r.TU_LUC) ? ex.TU_LUC : r.TU_LUC;
//                 const denMax = new Date(ex.DEN_LUC) > new Date(r.DEN_LUC) ? ex.DEN_LUC : r.DEN_LUC;
//                 byKey.set(k, { ...ex, TU_LUC: tuMin, DEN_LUC: denMax });
//             }
//         }
//         rows = Array.from(byKey.values());

//         // Lọc overlap chuẩn xác lần cuối theo khoảng from/to (nếu client truyền)
//         if (from && to) {
//             rows = rows.filter(r => overlap(new Date(r.TU_LUC), new Date(r.DEN_LUC), from, to));
//         }

//         // Lọc search: theo mã HĐ / tên KH / tên phòng
//         if (q) {
//             rows = rows.filter(r =>
//                 String(r.HDONG_MA).includes(q) ||
//                 (r.KH_TEN && r.KH_TEN.toLowerCase().includes(q)) ||
//                 (r.PHONG_TEN && r.PHONG_TEN.toLowerCase().includes(q))
//             );
//         }

//         res.json(rows);
//     } catch (e) {
//         next(e);
//     }
// }
async function lite(req, res, next) {
    try {
        const from = toDate(req.query.from);
        const to = toDate(req.query.to);
        const q = (req.query.search || '').toString().trim().toLowerCase();

        // 1️⃣ Lấy các hợp đồng có CTSD (ACTIVE / INVOICED)
        const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: {
                CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
                OR: from && to ? [
                    { AND: [{ CTSD_O_TU_GIO: { lte: to } }, { CTSD_O_DEN_GIO: { gte: from } }] },
                    { AND: [{ CTSD_NGAY_DA_O: { gte: from } }, { CTSD_NGAY_DA_O: { lte: to } }] },
                ] : undefined,
            },
            select: {
                HDONG_MA: true,
                PHONG_MA: true,
                PHONG: { select: { PHONG_TEN: true } },
                HOP_DONG_DAT_PHONG: {
                    select: {
                        HDONG_MA: true,
                        HT_MA: true,
                        HDONG_TRANG_THAI: true,
                        HDONG_NGAYDAT: true,
                        HDONG_NGAYTRA: true,
                        KHACH_HANG: { select: { KH_HOTEN: true } },
                        HDONG_NGAYTHUCNHAN: true,
                        HDONG_NGAYTHUCTRA: true,
                    },
                },
            },
            orderBy: [
                { HDONG_MA: 'desc' },
                { PHONG_MA: 'asc' },
            ],
        });

        // 2️⃣ Lấy thêm các hợp đồng chưa có CTSD (đặt trực tuyến)
        const hopdong = await prisma.hOP_DONG_DAT_PHONG.findMany({
            where: {
                HDONG_TRANG_THAI: { in: ['PENDING', 'CONFIRMED','CANCELLED','NO_SHOW'] },
                // chỉ lấy hợp đồng chưa có chi tiết sử dụng
                CHI_TIET_SU_DUNG: { none: {} },
            },
            select: {
                HDONG_MA: true,
                HT_MA: true,
                HDONG_TRANG_THAI: true,
                HDONG_NGAYDAT: true,
                HDONG_NGAYTRA: true,
                KHACH_HANG: { select: { KH_HOTEN: true } },
                CT_DAT_TRUOC: {
                    select: {
                        LOAI_PHONG: { select: { LP_TEN: true } },
                    },
                },
            },
            orderBy: { HDONG_MA: 'desc' },
        });

        // 3️⃣ Gộp hai nguồn về cùng định dạng
        let rows = [
            ...ctsd.map(r => {
                const hd = r.HOP_DONG_DAT_PHONG;
                const tu = hd?.HDONG_NGAYDAT ? new Date(hd.HDONG_NGAYDAT) : null;
                const den = hd?.HDONG_NGAYTRA ? new Date(hd.HDONG_NGAYTRA) : null;
                return {
                    HDONG_MA: r.HDONG_MA,
                    PHONG_MA: r.PHONG_MA,
                    PHONG_TEN: r.PHONG?.PHONG_TEN ?? '',
                    KH_TEN: hd?.KHACH_HANG?.KH_HOTEN ?? null,
                    HT_MA: hd?.HT_MA ?? 0,
                    TRANG_THAI: hd?.HDONG_TRANG_THAI ?? 'PENDING',
                    TU_LUC: tu ? tu.toISOString() : null,
                    DEN_LUC: den ? den.toISOString() : null,
                    HDONG_NGAYTHUCNHAN: hd?.HDONG_NGAYTHUCNHAN ?? null,
                    HDONG_NGAYTHUCTRA: hd?.HDONG_NGAYTHUCTRA ?? null,
                };
            }),
            ...hopdong.map(hd => ({
                HDONG_MA: hd.HDONG_MA,
                PHONG_MA: null,
                PHONG_TEN: hd.CT_DAT_TRUOC?.[0]?.LOAI_PHONG?.LP_TEN ?? '(Chưa gán phòng)',
                KH_TEN: hd.KHACH_HANG?.KH_HOTEN ?? null,
                HT_MA: hd.HT_MA ?? 0,
                TRANG_THAI: hd.HDONG_TRANG_THAI ?? 'CONFIRMED',
                TU_LUC: hd.HDONG_NGAYDAT ? new Date(hd.HDONG_NGAYDAT).toISOString() : null,
                DEN_LUC: hd.HDONG_NGAYTRA ? new Date(hd.HDONG_NGAYTRA).toISOString() : null,
                HDONG_NGAYTHUCNHAN: null,
                HDONG_NGAYTHUCTRA: null,
            })),
        ];

        // 4️⃣ Gộp theo (HDONG_MA × PHONG_MA)
        const byKey = new Map();
        for (const r of rows) {
            const k = `${r.HDONG_MA}:${r.PHONG_MA ?? 'null'}`;
            const ex = byKey.get(k);
            if (!ex) byKey.set(k, r);
            else {
                const tuMin = new Date(ex.TU_LUC) < new Date(r.TU_LUC) ? ex.TU_LUC : r.TU_LUC;
                const denMax = new Date(ex.DEN_LUC) > new Date(r.DEN_LUC) ? ex.DEN_LUC : r.DEN_LUC;
                byKey.set(k, { ...ex, TU_LUC: tuMin, DEN_LUC: denMax });
            }
        }
        rows = Array.from(byKey.values());

        // 5️⃣ Lọc overlap và search
        if (from && to) {
            rows = rows.filter(r => overlap(new Date(r.TU_LUC), new Date(r.DEN_LUC), from, to));
        }

        if (q) {
            rows = rows.filter(r =>
                String(r.HDONG_MA).includes(q) ||
                (r.KH_TEN && r.KH_TEN.toLowerCase().includes(q)) ||
                (r.PHONG_TEN && r.PHONG_TEN.toLowerCase().includes(q))
            );
        }

        res.json(rows);
    } catch (e) {
        console.error('❌ Lỗi booking_lite:', e);
        next(e);
    }
}

module.exports = { lite };
