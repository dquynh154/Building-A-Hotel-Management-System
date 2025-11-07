const r = require('express').Router();
const c = require('../controllers/auth_staff');
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');

// Đăng nhập nhân viên
r.post('/login', c.login);

// Đổi mật khẩu (nhân viên đã đăng nhập)
r.post('/change-password', auth, permit('ADMIN', 'RECEPTIONIST'), c.changePassword);
r.get('/me', auth, permit('ADMIN', 'RECEPTIONIST'), c.me);
r.post('/logout', auth, permit('ADMIN', 'RECEPTIONIST'), (req, res) => {
    // Thực tế chỉ log hoặc clear session server-side nếu có
    return res.json({ message: 'Đã đăng xuất thành công' });
});

module.exports = r;
