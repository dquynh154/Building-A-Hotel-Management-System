const r = require('express').Router();
const c = require('../controllers/auth_staff');
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');

// Đăng nhập nhân viên
r.post('/login', c.login);

// Đổi mật khẩu (nhân viên đã đăng nhập)
r.post('/change-password', auth, permit('ADMIN', 'RECEPTIONIST'), c.changePassword);

module.exports = r;
