// GET /availability/room-types?from=ISO&to=ISO&ht=DAY|HOUR
const { prisma } = require('../db/prisma');

const TD_BASE = 1;
const HT_MAP = { DAY: 1, HOUR: 2 };
// Hợp đồng được coi là "chiếm phòng trong tương lai" (đã đặt hoặc đang ở)
const BLOCKING_STATUSES = ['CONFIRMED', 'CHECKED_IN']; // thêm 'PENDING' nếu muốn chặn cả nháp

function toDate(v) { const d = new Date(v); return isNaN(+d) ? null : d; }
function overlap(a1, a2, b1, b2) { return (!a2 || !b2 || a1 < b2) && (!b1 || !a1 || b1 < a2); }

async function roomTypeAvailability(req, res, next) {
    try {
        const from = toDate(req.query.from);
        const to = toDate(req.query.to);
        if (!from || !to || !(to > from)) {
            return res.status(400).json({ message: 'from/to không hợp lệ' });
        }
        const htKey = String(req.query.ht || 'DAY').toUpperCase();
        const HT_MA = HT_MAP[htKey] || HT_MAP.DAY;

        // 1) Tất cả phòng (để biết tổng theo LP)
        const allRooms = await prisma.pHONG.findMany({
            select: { PHONG_MA: true, LP_MA: true },
        });
        const totalByLP = new Map();
        allRooms.forEach(r => totalByLP.set(r.LP_MA, (totalByLP.get(r.LP_MA) || 0) + 1));

        // 2) Lấy các phòng "đang/đã được đặt" trong khoảng [from, to)
        //    dựa trên khoảng ngày của HỢP ĐỒNG; không xét PHONG_TRANGTHAI.
        const busyCtsd = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: {
                HOP_DONG_DAT_PHONG: {
                    HDONG_TRANG_THAI: { in: BLOCKING_STATUSES },
                    // chặn nếu HĐ giao nhau khoảng người dùng chọn
                    AND: [
                        { HDONG_NGAYDAT: { lt: to } },
                        { HDONG_NGAYTRA: { gt: from } },
                    ],
                },
                CTSD_TRANGTHAI: { in: ['ACTIVE'] }, // tuỳ bạn, có thể bỏ điều kiện này
            },
            select: { PHONG_MA: true, HOP_DONG_DAT_PHONG: { select: { HDONG_NGAYDAT: true, HDONG_NGAYTRA: true } } }
        });

        // Lọc lại overlap (phòng hờ)
        const busyRoomIds = new Set(
            busyCtsd
                .filter(x => overlap(x.HOP_DONG_DAT_PHONG.HDONG_NGAYDAT, x.HOP_DONG_DAT_PHONG.HDONG_NGAYTRA, from, to))
                .map(x => x.PHONG_MA)
        );


        // 3b) Tính cả các đặt trực tuyến chưa xếp phòng (CT_DAT_TRUOC)
        const prebooked = await prisma.cT_DAT_TRUOC.findMany({
            where: {
                HOP_DONG_DAT_PHONG: {
                    HDONG_TRANG_THAI: { in: ['PENDING', 'CONFIRMED'] },
                    AND: [
                        { HDONG_NGAYDAT: { lt: to } },
                        { HDONG_NGAYTRA: { gt: from } },
                    ],
                },
            },
            select: { LP_MA: true, SO_LUONG: true },
        });

        // cộng dồn số lượng phòng "đặt trước" theo loại
        const prebookedByLP = new Map();
        prebooked.forEach(p => {
            const old = prebookedByLP.get(p.LP_MA) || 0;
            prebookedByLP.set(p.LP_MA, old + (p.SO_LUONG || 0));
        });


        // 3) Đếm bận theo LP
        const busyByLP = new Map();
        allRooms.forEach(r => {
            if (busyRoomIds.has(r.PHONG_MA)) {
                busyByLP.set(r.LP_MA, (busyByLP.get(r.LP_MA) || 0) + 1);
            }
        });
        prebookedByLP.forEach((qty, lp) => {
            busyByLP.set(lp, (busyByLP.get(lp) || 0) + qty);
        });
        // 4) Giá base theo HT + TD_BASE
        const basePrices = await prisma.dON_GIA.findMany({
            where: { TD_MA: TD_BASE, HT_MA: HT_MA },
            select: { LP_MA: true, DG_DONGIA: true },
        });
        const priceByLP = new Map(basePrices.map(p => [p.LP_MA, Number(p.DG_DONGIA)]));

        // 5) Trả theo danh sách loại phòng
        const lpList = await prisma.lOAI_PHONG.findMany({ select: { LP_MA: true, LP_TEN: true } });
        const rows = lpList.map(lp => {
            const total = totalByLP.get(lp.LP_MA) || 0;
            const busy = busyByLP.get(lp.LP_MA) || 0;
            const free = Math.max(0, total - busy);
            return {
                LP_MA: lp.LP_MA,
                LP_TEN: lp.LP_TEN,
                totalRooms: total,
                busyRooms: busy,
                freeRooms: free,             // 👈 chính là “chưa có ai đặt trong khoảng”
                price: priceByLP.get(lp.LP_MA) || 0,
            };
        });

        res.json(rows);
    } catch (e) { next(e); }
}

module.exports = { roomTypeAvailability };
