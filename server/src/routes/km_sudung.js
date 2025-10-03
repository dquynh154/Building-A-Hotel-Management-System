const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const ctl = require('../controllers/km_sudung');

const onlyAdmin = permit('ADMIN');
const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');

r.use(auth);

// Áp dụng mã (Admin hoặc Lễ tân đều có thể)
r.post('/khuyen-mai-su-dung', staffOrAdmin, ctl.create);

// Huỷ áp dụng (chỉ Admin)
r.delete('/khuyen-mai-su-dung/:HDONG_MA', onlyAdmin, ctl.remove);

// Xem danh sách/lọc
r.get('/khuyen-mai-su-dung', staffOrAdmin, ctl.list);

module.exports = r;
