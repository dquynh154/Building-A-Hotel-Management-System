// src/controllers/trangbi.controller.js
const { crud } = require('./crud');
const { prisma } = require('../db/prisma');

// helper: ép số nếu là string số
const asNum = (v) => (/^\d+$/.test(String(v)) ? Number(v) : v);

const trangBi = crud('tRANGBI_TIENNGHI', {
    // dùng factory cho PK tổng hợp bằng cách tự viết get/update/remove riêng ở routes,
    // còn list/create để factory làm; ta vẫn khai báo pk giả để factory không crash.
    pk: 'LP_MA',   // chỉ để factory dùng trong list/create; get/update/remove ta sẽ override ở route.
    include: {
        LOAI_PHONG: true,
        TIEN_NGHI: true,
    },

    // kiểm tra input + FK trước khi create
    beforeCreate: async (data) => {
        const LP_MA = asNum(data.LP_MA);
        const TN_MA = asNum(data.TN_MA);
        if (!LP_MA || !TN_MA) {
            const e = new Error('Thiếu LP_MA hoặc TN_MA'); e.status = 400; throw e;
        }
        // FK check
        const [lp, tn] = await Promise.all([
            prisma.lOAI_PHONG.findUnique({ where: { LP_MA: LP_MA }, select: { LP_MA: true } }),
            prisma.tIEN_NGHI.findUnique({ where: { TN_MA: TN_MA }, select: { TN_MA: true } }),
        ]);
        if (!lp) { const e = new Error('LP_MA không tồn tại'); e.status = 400; throw e; }
        if (!tn) { const e = new Error('TN_MA không tồn tại'); e.status = 400; throw e; }

        // chuẩn hoá số lượng
        if (data.TN_SOLUONG != null) {
            const n = Number(data.TN_SOLUONG);
            if (!Number.isFinite(n) || n < 0) { const e = new Error('TN_SOLUONG không hợp lệ'); e.status = 400; throw e; }
            data.TN_SOLUONG = n;
        }

        // ngày trang bị (optional)
        if (data.TN_NGAY_TB) {
            const d = new Date(String(data.TN_NGAY_TB));
            if (Number.isNaN(d.getTime())) { const e = new Error('TN_NGAY_TB không hợp lệ'); e.status = 400; throw e; }
            data.TN_NGAY_TB = d;
        }

        // chống duplicate thủ công (dù DB đã @@id)
        const existed = await prisma.tRANGBI_TIENNGHI.findUnique({
            where: { LP_MA_TN_MA: { LP_MA, TN_MA } }
        });
        if (existed) { const e = new Error('Loại phòng này đã có tiện nghi đó'); e.status = 409; throw e; }

        return { ...data, LP_MA, TN_MA };
    },

    // update chỉ cho phép sửa TN_SOLUONG, TN_NGAY_TB (không đổi khoá)
    beforeUpdate: async (data) => {
        if ('LP_MA' in data || 'TN_MA' in data) {
            const e = new Error('Không được đổi khoá (LP_MA/TN_MA)'); e.status = 400; throw e;
        }
        if (data.TN_SOLUONG != null) {
            const n = Number(data.TN_SOLUONG);
            if (!Number.isFinite(n) || n < 0) { const e = new Error('TN_SOLUONG không hợp lệ'); e.status = 400; throw e; }
            data.TN_SOLUONG = n;
        }
        if (data.TN_NGAY_TB) {
            const d = new Date(String(data.TN_NGAY_TB));
            if (Number.isNaN(d.getTime())) { const e = new Error('TN_NGAY_TB không hợp lệ'); e.status = 400; throw e; }
            data.TN_NGAY_TB = d;
        }
        return data;
    },

    // lọc chính xác theo FK
    eqFields: ['LP_MA', 'TN_MA'],
    // search tên liên quan thì để ở phía list custom (nếu muốn nâng cấp)
});
async function get(req, res, next) {
    try {
        const { LP_MA, TN_MA } = req.params;
        const row = await prisma.tRANGBI_TIENNGHI.findUnique({
            where: { LP_MA_TN_MA: { LP_MA: Number(LP_MA), TN_MA: Number(TN_MA) } },
            include: { LOAI_PHONG: true, TIEN_NGHI: true }
        });
        if (!row) return res.status(404).json({ message: 'Not found' });
        res.json(row);
    } catch (e) { next(e); }
}

async function update(req, res, next) {
    try {
        const { LP_MA, TN_MA } = req.params;
        const data = {};
        if (req.body.TN_SOLUONG != null) {
            const n = Number(req.body.TN_SOLUONG);
            if (!Number.isFinite(n) || n < 0) { const e = new Error('TN_SOLUONG không hợp lệ'); e.status = 400; throw e; }
            data.TN_SOLUONG = n;
        }
        if (req.body.TN_NGAY_TB) {
            const d = new Date(String(req.body.TN_NGAY_TB));
            if (Number.isNaN(d.getTime())) { const e = new Error('TN_NGAY_TB không hợp lệ'); e.status = 400; throw e; }
            data.TN_NGAY_TB = d;
        }
        // không cho đổi khoá
        if ('LP_MA' in req.body || 'TN_MA' in req.body) {
            const e = new Error('Không được đổi LP_MA/TN_MA'); e.status = 400; throw e;
        }

        const row = await prisma.tRANGBI_TIENNGHI.update({
            where: { LP_MA_TN_MA: { LP_MA: Number(LP_MA), TN_MA: Number(TN_MA) } },
            data
        });
        res.json(row);
    } catch (e) { next(e); }
}

async function remove(req, res, next) {
    try {
        const { LP_MA, TN_MA } = req.params;
        await prisma.tRANGBI_TIENNGHI.delete({
            where: { LP_MA_TN_MA: { LP_MA: Number(LP_MA), TN_MA: Number(TN_MA) } }
        });
        res.json({ ok: true });
    } catch (e) { next(e); }
}

module.exports = {
    // từ factory
    list: trangBi.list,
    create: trangBi.create,
    // PK tổng hợp
    get,
    update,
    remove,
};

