const r = require("express").Router();
const { prisma } = require("../db/prisma");

/* ============= HELPERS (hoisted, an toàn tuyệt đối) ============= */

function toDate(v) {
    const d = new Date(v);
    return isNaN(+d) ? null : d;
}
const toDate1 = (v) => (v ? new Date(v) : null);

function toKeyByGroup(dateObj, group) {
    if (!dateObj || isNaN(+dateObj)) return null;

    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");

    if (group === "year") return `${y}`;
    if (group === "month") return `${y}-${m}`;
    return `${y}-${m}-${d}`;
}
function overlaps(stayStart, stayEnd, filterStart, filterEnd) {
    return stayStart <= filterEnd && stayEnd >= filterStart;
}
/* ============= ROUTE ============= */

r.get("/bao-cao/doanh-thu", async (req, res, next) => {
    try {
        const { from, to, group = "day" } = req.query;

        const fromDate = toDate(from);
        const toDateObj = toDate(to);

        if (!fromDate || !toDateObj) {
            return res.status(400).json({ message: "from/to không hợp lệ" });
        }
        fromDate.setHours(0, 0, 0, 0);
        toDateObj.setHours(23, 59, 59, 999);

        const invoices = await prisma.hOA_DON.findMany({
            where: {
                HDON_TAO_LUC: { gte: fromDate, lte: toDateObj },
                HDON_TRANG_THAI: "PAID",
            },
            select: {
                HDON_TAO_LUC: true,
                HDON_THANH_TIEN: true,
                HDON_GIAM_GIA: true,
                HDON_PHI: true,
            },
            orderBy: { HDON_TAO_LUC: "asc" },
        });

        const buckets = {};

        for (const inv of invoices) {
            if (!inv.HDON_TAO_LUC) continue;

            const d = new Date(inv.HDON_TAO_LUC);
            if (isNaN(+d)) continue;

            const key = toKeyByGroup(d, group);
            if (!key) continue;

            if (!buckets[key]) {
                buckets[key] = {
                    date: key,
                    total: 0,
                    discount: 0,
                    fee: 0,
                };
            }

            buckets[key].total += Number(inv.HDON_THANH_TIEN || 0);
            buckets[key].discount += Number(inv.HDON_GIAM_GIA || 0);
            buckets[key].fee += Number(inv.HDON_PHI || 0);
        }

        const table = Object.values(buckets);

        const summary = {
            total: table.reduce((s, r) => s + r.total, 0),
            discount: table.reduce((s, r) => s + r.discount, 0),
            fee: table.reduce((s, r) => s + r.fee, 0),
        };

        const chart = table.map((r) => ({ date: r.date, total: r.total }));

        res.json({ summary, chart, table });
    } catch (err) {
        next(err);
    }
});

// =================  BÁO CÁO KHÁCH LƯU TRÚ  ==================

r.get("/bao-cao/khach-luu-tru", async (req, res, next) => {
    try {
        const { from, to } = req.query;

        const fromDate = toDate1(from);
        const toDate = toDate1(to);

        if (!fromDate || !toDate)
            return res.status(400).json({ message: "Thiếu from/to" });

        // Lấy các hợp đồng có giao nhau với khoảng ngày
        const hopdong = await prisma.hOP_DONG_DAT_PHONG.findMany({
            where: {
                HDONG_TRANG_THAI: { in: ["CHECKED_IN", "CHECKED_OUT"] },
                // giao nhau: (ngày thuê <= to) AND (ngày trả >= from)
                AND: [
                    { HDONG_NGAYDAT: { lte: toDate } },
                    { HDONG_NGAYTRA: { gte: fromDate } }
                ]
            },
            include: {
                LUU_TRU_KHACH: {
                    include: {
                        KHACH_HANG: true
                    }
                },
                CHI_TIET_SU_DUNG: {
                    include: {
                        PHONG: {
                            include: { LOAI_PHONG: true }
                        }
                    }
                }
            }
        });

        // -----------------------------
        //  Xử lý output summary
        // -----------------------------
        const result = [];

        for (const hd of hopdong) {
            const stayStart = hd.HDONG_NGAYTHUCNHAN || hd.HDONG_NGAYDAT;
            const stayEnd = hd.HDONG_NGAYTHUCTRA || hd.HDONG_NGAYTRA;

            if (!overlaps(stayStart, stayEnd, fromDate, toDate)) continue;

            const rooms = hd.CHI_TIET_SU_DUNG.map((c) => ({
                room: c.PHONG.PHONG_TEN,
                roomType: c.PHONG.LOAI_PHONG.LP_TEN
            }));

            const guests = hd.LUU_TRU_KHACH.map((lt) => ({
                name: lt.KHACH_HANG.KH_HOTEN,
                cccd: lt.KHACH_HANG.KH_CCCD,
                phone: lt.KHACH_HANG.KH_SDT,
                address: lt.KHACH_HANG.KH_DIACHI,
                isMain: lt.LA_KHACH_CHINH,
            }));

            result.push({
                hopDong: hd.HDONG_MA,
                stayFrom: stayStart,
                stayTo: stayEnd,
                rooms,
                guests
            });
        }

        res.json({ items: result });
    } catch (err) {
        next(err);
    }
});

module.exports = r;
