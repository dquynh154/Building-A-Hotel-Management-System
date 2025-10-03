const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const ctl = require('../controllers/hoadon_hopdong');

const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');

r.use(auth);

// xem các liên kết (HĐ) của 1 hóa đơn
r.get('/invoice-links/:invoiceId', staffOrAdmin, ctl.list);

// thêm 1 booking vào hóa đơn
r.post('/invoice-links', staffOrAdmin, ctl.add);

// gỡ 1 booking khỏi hóa đơn
r.delete('/invoice-links/:invoiceId/:bookingId', staffOrAdmin, ctl.remove);

// recalc thủ công (có thể truyền fee mới)
r.post('/invoice-links/:invoiceId/recalc', staffOrAdmin, ctl.recalc);

module.exports = r;
