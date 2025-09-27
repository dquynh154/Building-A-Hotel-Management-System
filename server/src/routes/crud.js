const r = require('express').Router();
const { crud } = require('../controllers/crud');
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const { hash } = require('../utils/hash'); 
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
    eqFields: [],
});
r.get('/tang', onlyAdmin, tang.list);
r.get('/tang/:id', onlyAdmin, tang.get);
r.post('/tang', onlyAdmin , tang.create);
r.put('/tang/:id', onlyAdmin, tang.update);
r.delete('/tang/:id', onlyAdmin, tang.remove);

const loaiPhong = crud('lOAI_PHONG', {
    pk: 'LP_MA',
    searchFields: ['LP_TEN'],
    eqFields: [],
});
r.get('/loai-phong', onlyAdmin, loaiPhong.list);
r.get('/loai-phong/:id', onlyAdmin, loaiPhong.get);
r.post('/loai-phong', onlyAdmin, loaiPhong.create);
r.put('/loai-phong/:id', onlyAdmin, loaiPhong.update);
r.delete('/loai-phong/:id', onlyAdmin, loaiPhong.remove);

const tienNghi = crud('tIEN_NGHI', { pk: 'TN_MA' });
r.get('/tien-nghi', onlyAdmin, tienNghi.list);
r.get('/tien-nghi/:id', onlyAdmin, tienNghi.get);
r.post('/tien-nghi', onlyAdmin, tienNghi.create);
r.put('/tien-nghi/:id', onlyAdmin, tienNghi.update);
r.delete('/tien-nghi/:id', onlyAdmin, tienNghi.remove);


const phong = crud('pHONG', {
    pk: 'PHONG_MA',
    include: { LOAI_PHONG: true, TANG: true },
    searchFields: ['PHONG_TEN'],
    eqFields: ['PHONG_TRANGTHAI', 'LP_MA', 'TANG_MA'],
});
r.get('/phong', onlyAdmin, phong.list);
r.get('/phong/:id', onlyAdmin, phong.get);
r.post('/phong', onlyAdmin, phong.create);
r.put('/phong/:id', onlyAdmin, phong.update);
r.delete('/phong/:id', onlyAdmin, phong.remove);

const loaidv = crud('lOAI_DICH_VU', { pk: 'LDV_MA' });
r.get('/loai-dich-vu', onlyAdmin, loaidv.list);
r.get('/loai-dich-vu/:id', onlyAdmin, loaidv.get);
r.post('/loai-dich-vu', onlyAdmin, loaidv.create);
r.put('/loai-dich-vu/:id', onlyAdmin, loaidv.update);
r.delete('/loai-dich-vu/:id', onlyAdmin, loaidv.remove);

const dichvu = crud('dICH_VU', { pk: 'DV_MA' });
r.get('/dich-vu', onlyAdmin, dichvu.list);
r.get('/dich-vu/:id', onlyAdmin, dichvu.get);
r.post('/dich-vu', onlyAdmin, dichvu.create);
r.put('/dich-vu/:id', onlyAdmin, dichvu.update);
r.delete('/dich-vu/:id', onlyAdmin, dichvu.remove);

const khachhang = crud('kHACH_HANG', { pk: 'KH_MA' });
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

const hinhthucthue = crud('hINH_THUC_THUE', { pk: 'HT_MA' });
r.get('/hinh-thuc-thue', onlyAdmin, hinhthucthue.list);
r.get('/hinh-thuc-thue/:id', onlyAdmin, hinhthucthue.get);
r.post('/hinh-thuc-thue', onlyAdmin, hinhthucthue.create);
r.put('/hinh-thuc-thue/:id', onlyAdmin, hinhthucthue.update);
r.delete('/hinh-thuc-thue/:id', onlyAdmin, hinhthucthue.remove);

// routes/crud.js
const khuyenMai = require('../controllers/khuyenmai');
r.get('/khuyen-mai', onlyAdmin, khuyenMai.list);
r.get('/khuyen-mai/:id', onlyAdmin, khuyenMai.get);
r.post('/khuyen-mai', onlyAdmin, khuyenMai.create);
r.put('/khuyen-mai/:id', onlyAdmin, khuyenMai.update);
r.delete('/khuyen-mai/:id', onlyAdmin, khuyenMai.remove);

const thoiDiem = require('../controllers/thoidem');
r.get('/thoi-diem', onlyAdmin, thoiDiem.list);
r.get('/thoi-diem/:id', onlyAdmin, thoiDiem.get);
r.post('/thoi-diem', onlyAdmin, thoiDiem.create);
r.put('/thoi-diem/:id', onlyAdmin, thoiDiem.update);
r.delete('/thoi-diem/:id', onlyAdmin, thoiDiem.remove);

const ctl = require('../controllers/dongia.controller');
r.get('/don-gia', onlyAdmin, ctl.listOrGet);
r.post('/don-gia', onlyAdmin, ctl.create);
r.put('/don-gia/:LP_MA/:HT_MA/:TD_MA', onlyAdmin, ctl.update);
r.delete('/don-gia/:LP_MA/:HT_MA/:TD_MA', onlyAdmin, ctl.remove);

// Helpers
r.get('/don-gia/resolve', staffOrAdmin, ctl.resolve);
r.get('/don-gia/calendar', staffOrAdmin, ctl.calendar);
r.post('/don-gia/generate-weekends', onlyAdmin, ctl.generateWeekends);
module.exports = r;