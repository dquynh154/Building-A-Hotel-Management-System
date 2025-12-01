const jwt = require('jsonwebtoken');
const { prisma } = require('../db/prisma');
const { hash, compare } = require('../utils/hash');
const { ok, created, bad, unauth } = require('../utils/responder');
const { guestRegister, guestLogin, changePassword } = require('../validators/authSchemas');

const sign = (guest) => {
    return jwt.sign(
        { sub: guest.KH_MA, role: 'GUEST', kind: 'GUEST' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES || '7d' }
    );
};

exports.register = async (req, res, next) => {
    try {
        const body = guestRegister.parse(req.body);

        const pwd = await hash(body.KH_MATKHAU);

        const guest = await prisma.kHACH_HANG.create({
            data: {
                KH_HOTEN: body.KH_HOTEN,
                KH_SDT: body.KH_SDT,
                KH_CCCD: body.KH_CCCD ?? null,
                KH_EMAIL: body.KH_EMAIL ?? null,
                KH_TAIKHOAN: body.KH_TAIKHOAN,
                KH_MATKHAU: pwd,
            },
            select: { KH_MA: true, KH_HOTEN: true, KH_TAIKHOAN: true }
        });

        return created(res, { token: sign(guest), guest });
    } catch (e) { next(e); }
};

exports.login = async (req, res, next) => {
    try {
        const { KH_TAIKHOAN, KH_MATKHAU } = guestLogin.parse(req.body);
        const guest = await prisma.kHACH_HANG.findUnique({
            where: { KH_TAIKHOAN },
        });
        if (!guest || !guest.KH_MATKHAU) return unauth(res, 'Sai tài khoản hoặc mật khẩu');

        const okPwd = await compare(KH_MATKHAU, guest.KH_MATKHAU);
        if (!okPwd) return unauth(res, 'Sai tài khoản hoặc mật khẩu');

        return ok(res, {
            token: sign(guest),
            guest: { KH_MA: guest.KH_MA, KH_HOTEN: guest.KH_HOTEN, KH_TAIKHOAN: guest.KH_TAIKHOAN }
        });
    } catch (e) { next(e); }
};

exports.me = async (req, res, next) => {
    try {
        if (req.user?.kind !== 'GUEST') return unauth(res);
        const me = await prisma.kHACH_HANG.findUnique({
            where: { KH_MA: req.user.sub },
            select: { KH_MA: true, KH_HOTEN: true, KH_TAIKHOAN: true, KH_EMAIL: true, KH_SDT: true }
        });
        return ok(res, me);
    } catch (e) { next(e); }
};

exports.changePassword = async (req, res, next) => {
    try {
        if (req.user?.kind !== 'GUEST') return unauth(res);
        const { oldPassword, newPassword } = changePassword.parse(req.body);
        const guest = await prisma.kHACH_HANG.findUnique({ where: { KH_MA: req.user.sub } });
        if (!guest?.KH_MATKHAU) return unauth(res);

        const okPwd = await compare(oldPassword, guest.KH_MATKHAU);
        if (!okPwd) return unauth(res, 'Mật khẩu cũ không đúng');

        const newHash = await hash(newPassword);
        await prisma.kHACH_HANG.update({
            where: { KH_MA: guest.KH_MA },
            data: { KH_MATKHAU: newHash }
        });
        return ok(res, { message: 'Đổi mật khẩu thành công' });
    } catch (e) { next(e); }
};


// // src/controllers/auth.js
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { prisma } = require('../db/prisma');
// const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
// const vnPhoneRegex = /^0(?:3|5|7|8|9)\d{8}$/;

// function normalizeVNLocalPhone(raw = '') {
//     // bỏ khoảng trắng/ký tự không phải số, quy về dạng 0xxxxxxxxx
//     let n = String(raw).replace(/\D+/g, '');
//     // nếu user paste '84xxxxxxxxx' thì đổi về '0xxxxxxxxx'
//     if (n.length === 11 && n.startsWith('84')) n = '0' + n.slice(2);
//     return n;
// }


// exports.register = async (req, res) => {
//     try {
//         const { username, password, firstName, lastName, phone } = req.body; // username = email-like

//         if (!firstName?.trim()) return res.status(400).json({ message: 'Thiếu Tên' });
//         if (!lastName?.trim()) return res.status(400).json({ message: 'Thiếu Họ' });
//         if (!username || !password) return res.status(400).json({ message: 'Thiếu username/password' });
//         if (!phone) return res.status(400).json({ message: 'Thiếu số điện thoại' });

//         const uname = String(username).trim().toLowerCase();
//         if (!emailRegex.test(uname)) return res.status(400).json({ message: 'Username phải là email hợp lệ' });

//         let phoneLocal = null;
//         if (phone) {
//             phoneLocal = normalizeVNLocalPhone(phone);
//             if (!vnPhoneRegex.test(phoneLocal)) {
//                 return res.status(400).json({ message: 'Số điện thoại không hợp lệ (10 số, 03/05/07/08/09)' });
//             }
//         }
//         const fullName = `${lastName.trim()} ${firstName.trim()}`;

//         // Check unique: username (+ phone nếu có)
//         const dup = await prisma.user.findFirst({
//             where: { OR: [{ username: uname }, phoneLocal ? { phone: phoneLocal } : undefined].filter(Boolean) },
//             select: { username: true, phone: true }
//         });
//         if (dup) {
//             return res.status(409).json({
//                 message: dup.username === uname ? 'Username đã tồn tại' : 'Số điện thoại đã tồn tại'
//             });
//         }

//         const hash = await bcrypt.hash(password, 10);
//         const user = await prisma.user.create({
//             data: {
//                 role: 'GUEST',
//                 username: uname,          // lưu email vào cột USERNAME
//                 phone: phoneLocal,        // có thể null nếu bạn cho phép
//                 fullName,
//                 password: hash,
//                 email: null               // không dùng email cột này
//             },
//             select: { id: true, role: true, username: true, fullName: true, phone: true, email: true }
//         });

//         res.status(201).json(user);
//     } catch (e) {
//         if (e.code === 'P2002') {
//             const t = Array.isArray(e.meta?.target) ? e.meta.target.join(',') : String(e.meta?.target || '');
//             return res.status(409).json({ message: t.includes('username') ? 'Username đã tồn tại' : 'Số điện thoại đã tồn tại' });
//         }
//         console.error(e);
//         res.status(500).json({ message: 'Register error' });
//     }
// };


// exports.login = async (req, res) => {
//     try {
//         const { username, identifier, password } = req.body;
//         const uname = (username ?? identifier ?? '').trim().toLowerCase(); // FE có thể gửi "identifier"
//         if (!uname || !password) return res.status(400).json({ message: 'Thiếu username/password' });

//         const user = await prisma.user.findUnique({ where: { username: uname } });
//         if (!user || !user.password) return res.status(401).json({ message: 'Sai thông tin đăng nhập' });

//         const ok = await bcrypt.compare(password, user.password);
//         if (!ok) return res.status(401).json({ message: 'Sai thông tin đăng nhập' });

//         const token = jwt.sign(
//             { id: user.id, role: user.role, username: user.username },
//             process.env.JWT_SECRET,
//             { expiresIn: '7d' }
//         );
//         res.json({ token, role: user.role });
//     } catch (e) {
//         console.error(e);
//         res.status(500).json({ message: 'Login error' });
//     }
// };

// // ME
// exports.me = async (req, res) => {
//     const me = await prisma.user.findUnique({
//         where: { id: req.user.id },
//         select: { id: true, role: true, username: true, fullName: true, phone: true, email: true }
//     });
//     if (!me) return res.status(404).json({ message: 'User not found' });
//     res.json(me);
// };

// exports.updateMe = async (req, res) => {
//     try {
//         const uid = req.user.id;
//         const { fullName, phone } = req.body;
//         if (!fullName && !phone) return res.status(400).json({ message: 'Không có gì để cập nhật' });

//         const data = {};
//         if (fullName) data.fullName = String(fullName).trim();

//         if (phone !== undefined && phone !== null && phone !== '') {
//             const local = normalizeVNLocalPhone(phone);
//             if (!vnPhoneRegex.test(local)) {
//                 return res.status(400).json({ message: 'Số điện thoại không hợp lệ (10 số, 03/05/07/08/09)' });
//             }
//             // unique phone (trừ chính mình)
//             const dup = await prisma.user.findFirst({
//                 where: { id: { not: uid }, phone: local },
//                 select: { id: true }
//             });
//             if (dup) return res.status(409).json({ message: 'Số điện thoại đã được sử dụng' });
//             data.phone = local;
//         }

//         const me = await prisma.user.update({
//             where: { id: uid },
//             data,
//             select: { id: true, username: true, role: true, fullName: true, phone: true, email: true }
//         });
//         res.json(me);
//     } catch (e) {
//         console.error(e);
//         res.status(500).json({ message: 'Update profile error' });
//     }
// };


// exports.changeMyPassword = async (req, res) => {
//     try {
//         const uid = req.user.id;
//         const { currentPassword, newPassword } = req.body;
//         if (!currentPassword || !newPassword) {
//             return res.status(400).json({ message: 'Thiếu mật khẩu' });
//         }
//         if (newPassword.length < 6) {
//             return res.status(400).json({ message: 'Mật khẩu mới quá ngắn' });
//         }

//         const user = await prisma.user.findUnique({ where: { id: uid }, select: { password: true } });
//         if (!user || !user.password) return res.status(400).json({ message: 'Tài khoản không hợp lệ' });

//         const ok = await bcrypt.compare(currentPassword, user.password);
//         if (!ok) return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng' });
//         if (currentPassword === newPassword) {
//             return res.status(400).json({ message: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
//         }

//         const hash = await bcrypt.hash(newPassword, 10);
//         await prisma.user.update({ where: { id: uid }, data: { password: hash } });
//         res.json({ message: 'Đổi mật khẩu thành công' });
//     } catch (e) {
//         console.error(e);
//         res.status(500).json({ message: 'Change password error' });
//     }
// };