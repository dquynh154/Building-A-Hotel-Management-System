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
                const e = new Error('Chỉ cho phép đổi AVAILABLE/MAINTENANCE tại CRUD. OCCUPIED/CHUA_DON đổi qua check-in/checkout');
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


module.exports = phong;