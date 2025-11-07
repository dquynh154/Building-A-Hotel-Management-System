const jwt = require('jsonwebtoken');
const { prisma } = require('../db/prisma');
const { compare, hash } = require('../utils/hash');
const { ok, unauth } = require('../utils/responder');
const { staffLogin, changePassword } = require('../validators/authSchemas');

const ROLE = {
    ADMIN: 'ADMIN',
    RECEPTIONIST: 'RECEPTIONIST',
};

function mapNVChucVuToRole(nv) {
    const raw = (nv.NV_CHUCVU || '').trim().toLowerCase();
    if (['quản trị', 'quan tri', 'quan tri vien', 'quản trị viên', 'admin'].includes(raw)) {
        return ROLE.ADMIN;
    }
    if (['lễ tân', 'le tan', 'receptionist'].includes(raw)) {
        return ROLE.RECEPTIONIST;
    }
    // Mặc định an toàn: hạ quyền về lễ tân (tuỳ bạn muốn chặn hay mặc định)
    return ROLE.RECEPTIONIST;
}

const sign = (nv) => {
    const role = mapNVChucVuToRole(nv);
    return jwt.sign(
        { sub: nv.NV_MA, role, kind: 'STAFF' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES || '7d' }
    );
};

exports.login = async (req, res, next) => {
    try {
        const { NV_TAIKHOAN, NV_MATKHAU } = staffLogin.parse(req.body);
        const nv = await prisma.nHAN_VIEN.findUnique({ where: { NV_TAIKHOAN } });
        if (!nv) return unauth(res, 'Sai tài khoản hoặc mật khẩu');

        const okPwd = await compare(NV_MATKHAU, nv.NV_MATKHAU);
        if (!okPwd) return unauth(res, 'Sai tài khoản hoặc mật khẩu');

        const token = sign(nv);
        return ok(res, {
            token,
            staff: { NV_MA: nv.NV_MA, NV_HOTEN: nv.NV_HOTEN, NV_CHUCVU: nv.NV_CHUCVU }
        });
    } catch (e) { next(e); }
};

exports.changePassword = async (req, res, next) => {
    try {
        if (req.user?.kind !== 'STAFF') return unauth(res);
        const { oldPassword, newPassword } = changePassword.parse(req.body);
        const nv = await prisma.nHAN_VIEN.findUnique({ where: { NV_MA: req.user.sub } });
        if (!nv) return unauth(res);

        const okPwd = await compare(oldPassword, nv.NV_MATKHAU);
        if (!okPwd) return unauth(res, 'Mật khẩu cũ không đúng');

        const newHash = await hash(newPassword);
        await prisma.nHAN_VIEN.update({ where: { NV_MA: nv.NV_MA }, data: { NV_MATKHAU: newHash } });
        return ok(res, { message: 'Đổi mật khẩu thành công' });
    } catch (e) { next(e); }
};
// exports.me = async (req, res, next) => {
//     try {
//         if (!req.user?.sub) return unauth(res);
//         const nv = await prisma.nHAN_VIEN.findUnique({
//             where: { NV_MA: req.user.sub },
//             select: { NV_MA: true, NV_HOTEN: true, NV_CHUCVU: true },
//         });
//         if (!nv) return unauth(res);
//         return ok(res, { staff: nv });
//     } catch (e) { next(e); }
// };


exports.me = async (req, res, next) => {
    try {
        const sub = req.user?.sub;
        if (sub == null) return unauth(res);

        // Prisma cần đúng kiểu; NV_MA là Int thì ép số
        const NV_MA = typeof sub === 'number' ? sub : Number(sub);
        if (!Number.isInteger(NV_MA)) return unauth(res);

        const nv = await prisma.nHAN_VIEN.findUnique({
            where: { NV_MA },
            select: { NV_MA: true, NV_HOTEN: true, NV_CHUCVU: true, NV_SDT: true, NV_GIOITINH:true, NV_NGAYSINH: true, NV_EMAIL:true }, // không trả info nhạy cảm
        });

        if (!nv) return unauth(res);
        return ok(res, { staff: nv }); // { staff: { NV_MA, NV_HOTEN, NV_CHUCVU } }
    } catch (e) {
        next(e);
    }
};
