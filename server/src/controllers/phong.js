const { crud } = require('./crud');
const { prisma } = require('../db/prisma');

const phong = crud('pHONG', {
    pk: 'PHONG_MA',
    include: { LOAI_PHONG: true, TANG: true },

    beforeCreate: async (data) => {
        const ten = String(data.PHONG_TEN || '').trim();
        if (!ten) { const err = new Error('Vui lòng điền tên phòng'); err.status = 400; throw err; }
        data.PHONG_TEN = ten;

        // FK check
        if (!data.LP_MA || !data.TANG_MA) {
            const err = new Error('Thiếu LP_MA/TANG_MA'); err.status = 400; throw err;
        }
        const [lp, tang] = await Promise.all([
            prisma.lOAI_PHONG.findUnique({ where: { LP_MA: Number(data.LP_MA) }, select: { LP_MA: true } }),
            prisma.tANG.findUnique({ where: { TANG_MA: Number(data.TANG_MA) }, select: { TANG_MA: true } }),
        ]);
        if (!lp) { const e = new Error('LP_MA không tồn tại'); e.status = 400; throw e; }
        if (!tang) { const e = new Error('TANG_MA không tồn tại'); e.status = 400; throw e; }

        // Trạng thái: nếu không gửi thì để Prisma default AVAILABLE
        if (data.PHONG_TRANGTHAI && !['AVAILABLE', 'MAINTENANCE'].includes(String(data.PHONG_TRANGTHAI))) {
            const e = new Error('PHONG_TRANGTHAI chỉ được đặt qua CRUD: AVAILABLE/MAINTENANCE'); e.status = 400; throw e;
        }
        return data;
    },

    beforeUpdate: async (data, { id }) => {
        // Chuẩn hoá tên
        if (data.PHONG_TEN != null) {
            const ten = String(data.PHONG_TEN).trim();
            if (!ten) { const err = new Error('Tên phòng không hợp lệ'); err.status = 400; throw err; }
            data.PHONG_TEN = ten;
        }

        // Nếu đổi LP_MA/TANG_MA → check FK
        if (data.LP_MA != null) {
            const lp = await prisma.lOAI_PHONG.findUnique({ where: { LP_MA: Number(data.LP_MA) }, select: { LP_MA: true } });
            if (!lp) { const e = new Error('LP_MA không tồn tại'); e.status = 400; throw e; }
        }
        if (data.TANG_MA != null) {
            const tang = await prisma.tANG.findUnique({ where: { TANG_MA: Number(data.TANG_MA) }, select: { TANG_MA: true } });
            if (!tang) { const e = new Error('TANG_MA không tồn tại'); e.status = 400; throw e; }
        }

        // Chặn set trạng thái “nghiệp vụ” qua CRUD
        if (data.PHONG_TRANGTHAI != null) {
            const next = String(data.PHONG_TRANGTHAI);
            if (!['AVAILABLE', 'MAINTENANCE'].includes(next)) {
                const e = new Error('Chỉ cho phép đổi trạng thái Trống / Bảo trì tại khi quản lý. Đang ở / Chưa dọn chỉ đổi qua khi check-in/checkout');
                e.status = 400; throw e;
            }
            // (tuỳ) Không cho chuyển sang AVAILABLE nếu hiện tại đang CHUA_DON:
            const cur = await prisma.pHONG.findUnique({ where: { PHONG_MA: Number(id) }, select: { PHONG_TRANGTHAI: true } });
            if (cur?.PHONG_TRANGTHAI === 'CHUA_DON' && next === 'AVAILABLE') {
                const e = new Error('Phòng CHUA_DON phải dọn xong mới AVAILABLE'); e.status = 409; throw e;
            }
        }

        return data;
    },

    searchFields: ['PHONG_TEN'],
    eqFields: ['PHONG_TRANGTHAI', 'LP_MA', 'TANG_MA'],
});

phong.countByLoaiPhong = async (req, res, next) => {
    try {
        // Nhận filter từ query
        const q = req.query || {};
        const where = {};

        // search theo tên phòng
        if (q.search) {
            where.PHONG_TEN = { contains: String(q.search).trim(), mode: 'insensitive' };
        }
        // filter trạng thái (ví dụ: AVAILABLE, OCCUPIED, ...)
        if (q['eq.PHONG_TRANGTHAI']) {
            where.PHONG_TRANGTHAI = String(q['eq.PHONG_TRANGTHAI']);
        }
        // filter theo tầng nếu cần
        if (q['eq.TANG_MA']) {
            where.TANG_MA = Number(q['eq.TANG_MA']);
        }
        // (tuỳ) filter theo LP_MA cụ thể
        if (q['eq.LP_MA']) {
            where.LP_MA = Number(q['eq.LP_MA']);
        }

        // groupBy để đếm
        const grouped = await prisma.pHONG.groupBy({
            by: ['LP_MA'],
            _count: { _all: true },
            where,
        });
        const countMap = Object.fromEntries(
            grouped.map(g => [g.LP_MA, g._count._all])
        );

        // Lấy danh sách loại phòng để trả cả loại không có phòng (count=0)
        const lpList = await prisma.lOAI_PHONG.findMany({
            select: { LP_MA: true, LP_TEN: true },
            orderBy: { LP_MA: 'asc' },
        });

        const rows = lpList.map(lp => ({
            LP_MA: lp.LP_MA,
            LP_TEN: lp.LP_TEN,
            count: countMap[lp.LP_MA] ?? 0,
        }));

        res.json(rows);
    } catch (err) {
        next(err);
    }
};

// ==== THÊM MỚI Ở CUỐI FILE controllers/phong.js ====
const TD_BASE = 1;                 // thời điểm base
const HT_ID = { DAY: 1, HOUR: 2 }; // 1=Ngày, 2=Giờ
const toNumber = (v) => Number(v || 0);

// Ghi đè list: trả kèm PRICE_DAY/PRICE_HOUR
async function listPhongWithBase(req, res, next) {
    try {
        const take = Number(req.query.take || 50);
        const skip = Number(req.query.skip || 0);
        const withTotal = String(req.query.withTotal || '0') === '1';

        const [items, total] = await Promise.all([
            prisma.pHONG.findMany({
                take, skip,
                orderBy: [{ TANG_MA: 'asc' }, { PHONG_TEN: 'asc' }],
                include: {
                    TANG: true,
                    LOAI_PHONG: {
                        include: {
                            DON_GIA: {
                                where: { TD_MA: TD_BASE, HT_MA: { in: [HT_ID.DAY, HT_ID.HOUR] } },
                                select: { HT_MA: true, DG_DONGIA: true },
                            },
                        },
                    },
                },
            }),
            withTotal ? prisma.pHONG.count() : Promise.resolve(0),
        ]);

        const mapped = items.map((r) => {
            let PRICE_DAY = null, PRICE_HOUR = null;
            const list = r.LOAI_PHONG?.DON_GIA || [];
            for (const dg of list) {
                if (dg.HT_MA === HT_ID.DAY) PRICE_DAY = toNumber(dg.DG_DONGIA);
                if (dg.HT_MA === HT_ID.HOUR) PRICE_HOUR = toNumber(dg.DG_DONGIA);
            }
            return { ...r, PRICE_DAY, PRICE_HOUR };
        });

        res.json(withTotal ? { items: mapped, total } : mapped);
    } catch (e) { next(e); }
}

// === Thay vì export mặc định CRUD, ta ghi đè phương thức list ===
module.exports = {
    ...phong,           // create/get/update/remove/... giữ nguyên
    list: listPhongWithBase, // 👈 GHI ĐÈ HÀM LIST
};
