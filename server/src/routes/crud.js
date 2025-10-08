const r = require('express').Router();
const { crud } = require('../controllers/crud');
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const { prisma } = require('../db/prisma');   

const onlyAdmin = permit('ADMIN');
const staffOrAdmin = permit('RECEPTIONIST', 'ADMIN');

r.use(auth); // bắt buộc đăng nhập

const nhanVien = require('../controllers/nhanvien');
r.get('/nhan-vien', onlyAdmin, nhanVien.list);
r.get('/nhan-vien/:id', onlyAdmin, nhanVien.get);
r.post('/nhan-vien', onlyAdmin, nhanVien.create);
r.put('/nhan-vien/:id', onlyAdmin, nhanVien.update);
r.delete('/nhan-vien/:id', onlyAdmin, nhanVien.remove);


const tang = crud('tANG', {
    pk: 'TANG_MA',
    searchFields: ['TANG_TEN'],
    beforeCreate: async (data) => {
        if (!data.TANG_TEN || !String(data.TANG_TEN).trim()) {
            const err = new Error('Vui lòng điền tên tầng'); err.status = 400; throw err;
        }
        return data;
    },
    eqFields: [],
});
r.get('/tang', onlyAdmin, tang.list);
r.get('/tang/:id', onlyAdmin, tang.get);
r.post('/tang', onlyAdmin , tang.create);
r.put('/tang/:id', onlyAdmin, tang.update);
r.delete('/tang/:id', onlyAdmin, tang.remove);


const path = require('path');
const fs = require('fs');
const { UPLOAD_DIR } = require('../config/paths');

// Hàm xóa file an toàn
function safeUnlink(relUrl) {
    try {
        const filePath = path.join(UPLOAD_DIR, path.basename(relUrl));
        fs.unlinkSync(filePath);
    } catch (e) {
        if (e.code !== 'ENOENT') console.error('unlink error:', e.message);
    }
}


const loaiPhong = crud('lOAI_PHONG', {
    pk: 'LP_MA',
    beforeCreate: async (data) => {
        if (!data.LP_TEN || !String(data.LP_TEN).trim()) {
            const err = new Error('Vui lòng điền tên loại phòng'); err.status = 400; throw err;
        }
        const v = Number(data.LP_SONGUOI);
        if (!Number.isInteger(v) || v < 1) {
            const e = new Error('Sức chứa bắt buộc và phải là số nguyên ≥ 1'); e.status = 400; throw e;
        }
        data.LP_TEN = String(data.LP_TEN).trim();
        data.LP_SONGUOI = v;
        return data;
    },
    beforeUpdate: async (data) => {
        if (data.LP_SONGUOI != null) {
            const v = Number(data.LP_SONGUOI);
            if (!Number.isInteger(v) || v < 1) {
                const e = new Error('Sức chứa phải là số nguyên ≥ 1'); e.status = 400; throw e;
            }
            data.LP_SONGUOI = v;
        }
        return data;
    },
    searchFields: ['LP_TEN'],
    eqFields: [],
    include: {
        images: {
            select: { IMG_ID: true, URL: true, IS_MAIN: true, ORD: true },
            orderBy: [{ IS_MAIN: 'desc' }, { ORD: 'asc' }, { IMG_ID: 'asc' }],
            // để payload gọn, chỉ cần 1 ảnh đại diện:
            take: 1,
        },
    },  
});
loaiPhong.listWithCount = async (req, res, next) => {
    try {
        const q = req.query || {};

        // where cho PHONG (để lọc count theo trạng thái, tầng, search tên phòng,… nếu muốn)
        const roomWhere = {};
        if (q['eq.PHONG_TRANGTHAI']) roomWhere.PHONG_TRANGTHAI = String(q['eq.PHONG_TRANGTHAI']);
        if (q['eq.TANG_MA']) roomWhere.TANG_MA = Number(q['eq.TANG_MA']);
        if (q.search) roomWhere.PHONG_TEN = { contains: String(q.search).trim(), mode: 'insensitive' };

        // 1) Đếm theo LP_MA bên bảng PHONG
        const grouped = await prisma.pHONG.groupBy({
            by: ['LP_MA'],
            _count: { _all: true },
            where: roomWhere,
        });
        const countMap = Object.fromEntries(grouped.map(g => [g.LP_MA, g._count._all]));

        // 2) Lấy danh sách LOAI_PHONG rồi merge count (để loại không có phòng vẫn trả count=0)
        const lpList = await prisma.lOAI_PHONG.findMany({
            select: {
                LP_MA: true, LP_TEN: true, LP_SONGUOI: true, LP_TRANGTHAI: true,
                images: {
                    select: { IMG_ID: true, URL: true, IS_MAIN: true, ORD: true },
                    orderBy: [{ IS_MAIN: 'desc' }, { ORD: 'asc' }, { IMG_ID: 'asc' }],
                    take: 1,
                }, 
            },
            orderBy: { LP_MA: 'asc' },

        });

        const rows = lpList.map(lp => ({
            LP_MA: lp.LP_MA,
            LP_TEN: lp.LP_TEN,
            LP_SONGUOI: lp.LP_SONGUOI,
            LP_TRANGTHAI: lp.LP_TRANGTHAI,
            ROOM_COUNT: countMap[lp.LP_MA] ?? 0,
            images: lp.images,
        }));

        res.json(rows);
    } catch (err) {
        next(err);
    }
};

r.get('/loai-phong', staffOrAdmin, loaiPhong.list);
r.get('/loai-phong/:id', staffOrAdmin, loaiPhong.get);
r.post('/loai-phong', onlyAdmin, loaiPhong.create);
r.put('/loai-phong/:id', onlyAdmin, loaiPhong.update);
// r.delete('/loai-phong/:id', onlyAdmin, loaiPhong.remove);
r.delete('/loai-phong/:id', onlyAdmin, async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'ID không hợp lệ' });

    try {
        // 1) Lấy danh sách ảnh đang gắn với loại phòng
        const imgs = await prisma.lOAI_PHONG_IMAGE.findMany({
            where: { LP_MA: id },
            select: { IMG_ID: true, URL: true },
        });

        // 2) Xóa record ảnh trước (để tránh FK), đồng thời xóa file trên đĩa
        if (imgs.length) {
            await prisma.lOAI_PHONG_IMAGE.deleteMany({ where: { LP_MA: id } });
            imgs.forEach(img => safeUnlink(img.URL));
        }

        // 3) Xóa loại phòng
        await prisma.lOAI_PHONG.delete({ where: { LP_MA: id } });

        res.json({ ok: true });
    } catch (e) {
        // Nếu còn phòng tham chiếu (FK), Prisma có thể ném P2003
        if (e.code === 'P2003') {
            return res.status(409).json({ message: 'Không thể xóa: còn phòng tham chiếu loại phòng này.' });
        }
        next(e);
    }
});
r.get('/loai-phong/with-count', staffOrAdmin, loaiPhong.listWithCount);

const tienNghi = crud('tIEN_NGHI', { 
    pk: 'TN_MA',
    beforeCreate: async (data) => {
        if (!data.TN_TEN || !String(data.TN_TEN).trim()) {
            const err = new Error('Vui lòng điền tên tiện nghi'); err.status = 400; throw err;
        }
        return data;
    },
    searchFields: ['TN_TEN'],
    eqFields: [],
});
r.get('/tien-nghi', staffOrAdmin, tienNghi.list);
r.get('/tien-nghi/:id', staffOrAdmin, tienNghi.get);
r.post('/tien-nghi', onlyAdmin, tienNghi.create);
r.put('/tien-nghi/:id', onlyAdmin, tienNghi.update);
r.delete('/tien-nghi/:id', onlyAdmin, tienNghi.remove);


const phong = require('../controllers/phong');
r.get('/phong', staffOrAdmin, phong.list);
r.get('/phong/:id', staffOrAdmin, phong.get);
r.post('/phong', onlyAdmin, phong.create);
r.put('/phong/:id', onlyAdmin, phong.update);
r.delete('/phong/:id', onlyAdmin, phong.remove);
r.get('/phong/count-by-loaiphong', staffOrAdmin, phong.countByLoaiPhong);

const loaidv = crud('lOAI_DICH_VU', {
    pk: 'LDV_MA',
    beforeCreate: async (data) => {
        if (!data.LDV_TEN || !String(data.LDV_TEN).trim()) {
            const err = new Error('Vui lòng điền tên loại dịch vụ'); err.status = 400; throw err;
        }
        return data;
    },
    beforeUpdate: async (data) => {
        if (data.LDV_TEN != null) {
            const ten = String(data.LDV_TEN).trim();
            if (!ten) { const e = new Error('Tên loại dịch vụ không hợp lệ'); e.status = 400; throw e; }
            data.LDV_TEN = ten;
        }
        return data;
    },
    searchFields: ['LDV_TEN'],
    eqFields: [],
});
r.get('/loai-dich-vu', staffOrAdmin, loaidv.list);
r.get('/loai-dich-vu/:id', staffOrAdmin, loaidv.get);
r.post('/loai-dich-vu', onlyAdmin, loaidv.create);
r.put('/loai-dich-vu/:id', onlyAdmin, loaidv.update);
r.delete('/loai-dich-vu/:id', onlyAdmin, loaidv.remove);

const dichvu = crud('dICH_VU', {
    pk: 'DV_MA',
    include: { LOAI_DICH_VU: true },

    beforeCreate: async (data) => {
        // tên DV
        const ten = String(data.DV_TEN || '').trim();
        if (!ten) { const e = new Error('Vui lòng nhập DV_TEN'); e.status = 400; throw e; }
        data.DV_TEN = ten;

        // FK: LDV_MA bắt buộc tồn tại
        if (data.LDV_MA == null) { const e = new Error('Thiếu LDV_MA'); e.status = 400; throw e; }
        const ldv = await prisma.lOAI_DICH_VU.findUnique({
            where: { LDV_MA: Number(data.LDV_MA) }, select: { LDV_MA: true }
        });
        if (!ldv) { const e = new Error('LDV_MA không tồn tại'); e.status = 400; throw e; }

        // Đơn giá (Decimal) nên gửi string
        if (data.DV_DONGIA == null) { const e = new Error('Thiếu DV_DONGIA'); e.status = 400; throw e; }
        data.DV_DONGIA = String(data.DV_DONGIA);

        return data;
    },

    beforeUpdate: async (data) => {
        // tên
        if (data.DV_TEN != null) {
            const ten = String(data.DV_TEN).trim();
            if (!ten) { const e = new Error('DV_TEN không hợp lệ'); e.status = 400; throw e; }
            data.DV_TEN = ten;
        }

        // FK: nếu đổi LDV_MA thì check tồn tại
        if (data.LDV_MA != null) {
            const ldv = await prisma.lOAI_DICH_VU.findUnique({
                where: { LDV_MA: Number(data.LDV_MA) }, select: { LDV_MA: true }
            });
            if (!ldv) { const e = new Error('LDV_MA không tồn tại'); e.status = 400; throw e; }
        }

        // đơn giá
        if (data.DV_DONGIA != null) {
            data.DV_DONGIA = String(data.DV_DONGIA);
        }
        return data;
    },

    searchFields: ['DV_TEN','DV_DONGIA'],
    eqFields: ['LDV_MA'],
});
r.get('/dich-vu', staffOrAdmin, dichvu.list);
r.get('/dich-vu/:id', staffOrAdmin, dichvu.get);
r.post('/dich-vu', onlyAdmin, dichvu.create);
r.put('/dich-vu/:id', onlyAdmin, dichvu.update);
r.delete('/dich-vu/:id', onlyAdmin, dichvu.remove);

const khachhang = require('../controllers/khachhang');
r.get('/khach-hang', staffOrAdmin, khachhang.list);
r.get('/khach-hang/:id', staffOrAdmin, khachhang.get);
r.post('/khach-hang', staffOrAdmin, khachhang.create);
r.put('/khach-hang/:id', staffOrAdmin, khachhang.update);
r.delete('/khach-hang/:id', onlyAdmin, khachhang.remove);

const lichsudonphong = require('../controllers/lichsudonphong');
r.get('/lich-su-don-phong', staffOrAdmin, lichsudonphong.list);
r.get('/lich-su-don-phong/:id', staffOrAdmin, lichsudonphong.get);
r.post('/lich-su-don-phong', staffOrAdmin, lichsudonphong.create);
r.put('/lich-su-don-phong/:id', staffOrAdmin, lichsudonphong.update);
r.delete('/lich-su-don-phong/:id', onlyAdmin, lichsudonphong.remove);

const hinhthucthue = crud('hINH_THUC_THUE', {
    pk: 'HT_MA',
    beforeCreate: async (data) => {
        if (!data.HT_TEN || !String(data.HT_TEN).trim()) {
            const err = new Error('Vui lòng điền tên hình thức'); err.status = 400; throw err;
        }
        return data;
    },
});
r.get('/hinh-thuc-thue', onlyAdmin, hinhthucthue.list);
r.get('/hinh-thuc-thue/:id', onlyAdmin, hinhthucthue.get);
r.post('/hinh-thuc-thue', onlyAdmin, hinhthucthue.create);
r.put('/hinh-thuc-thue/:id', onlyAdmin, hinhthucthue.update);
r.delete('/hinh-thuc-thue/:id', onlyAdmin, hinhthucthue.remove);


const khuyenMai = require('../controllers/khuyenmai');
r.get('/khuyen-mai', staffOrAdmin, khuyenMai.list);
r.get('/khuyen-mai/:id', staffOrAdmin, khuyenMai.get);
r.post('/khuyen-mai', onlyAdmin, khuyenMai.create);
r.put('/khuyen-mai/:id', onlyAdmin, khuyenMai.update);
r.delete('/khuyen-mai/:id', onlyAdmin, khuyenMai.remove);

const ctl = require('../controllers/km_sudung');
// Áp dụng mã (Admin hoặc Lễ tân đều có thể)
r.post('/khuyen-mai-su-dung', staffOrAdmin, ctl.create);
// Huỷ áp dụng (chỉ Admin)
r.delete('/khuyen-mai-su-dung/:HDONG_MA', onlyAdmin, ctl.remove);
// Xem danh sách/lọc
r.get('/khuyen-mai-su-dung', staffOrAdmin, ctl.list);

const thoiDiem = require('../controllers/thoidiem');
r.get('/thoi-diem', onlyAdmin, thoiDiem.list);
r.get('/thoi-diem/:id', onlyAdmin, thoiDiem.get);
r.post('/thoi-diem', onlyAdmin, thoiDiem.create);
r.put('/thoi-diem/:id', onlyAdmin, thoiDiem.update);
r.delete('/thoi-diem/:id', onlyAdmin, thoiDiem.remove);

const donGia = require('../controllers/dongia');
r.get('/don-gia', onlyAdmin, donGia.listOrGet);
r.post('/don-gia', onlyAdmin, donGia.create);
r.put('/don-gia/:LP_MA/:HT_MA/:TD_MA', onlyAdmin, donGia.update);
r.delete('/don-gia/:LP_MA/:HT_MA/:TD_MA', onlyAdmin, donGia.remove);

// Helpers
r.get('/don-gia/resolve', staffOrAdmin, donGia.resolve);
r.get('/don-gia/calendar', staffOrAdmin, donGia.calendar);
r.post('/don-gia/generate-weekends', onlyAdmin, donGia.generateWeekends);

const trangBi = require('../controllers/trangbi_thietbi');
r.get('/trang-bi', staffOrAdmin, trangBi.list);
r.post('/trang-bi', onlyAdmin, trangBi.create);

// get/update/remove dùng controller custom (PK tổng hợp)
r.get('/trang-bi/:LP_MA/:TN_MA', staffOrAdmin, trangBi.get);
r.put('/trang-bi/:LP_MA/:TN_MA', onlyAdmin, trangBi.update);
r.delete('/trang-bi/:LP_MA/:TN_MA', onlyAdmin, trangBi.remove);


const uploadRoutes = require('./upload');
r.use('/upload', staffOrAdmin, uploadRoutes);

const imgCtl = require('../controllers/loai_phong_image');
r.get('/loai-phong/:id/images', staffOrAdmin, imgCtl.listByLoaiPhong);
r.post('/loai-phong/:id/images', onlyAdmin, imgCtl.addMany);
r.put('/loai-phong/images/:imgId/main', onlyAdmin, imgCtl.setMain);
r.put('/loai-phong/images/order', onlyAdmin, imgCtl.updateOrder);
r.delete('/loai-phong/images/:imgId', onlyAdmin, imgCtl.remove);

module.exports = r;