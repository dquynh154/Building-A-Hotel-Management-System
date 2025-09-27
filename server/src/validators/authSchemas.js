const { z } = require('zod');

// Guest: đăng ký & đăng nhập
exports.guestRegister = z.object({
    KH_HOTEN: z.string().min(1),
    KH_SDT: z.string().min(8),
    KH_CCCD: z.string().min(6),
    KH_EMAIL: z.string().email().optional().nullable(),
    KH_TAIKHOAN: z.string().min(4),
    KH_MATKHAU: z.string().min(6),
});

exports.guestLogin = z.object({
    KH_TAIKHOAN: z.string().min(1),
    KH_MATKHAU: z.string().min(1),
});

// Staff: đăng nhập
exports.staffLogin = z.object({
    NV_TAIKHOAN: z.string().min(1),
    NV_MATKHAU: z.string().min(1),
});

// đổi mật khẩu (dùng cho cả guest & staff)
exports.changePassword = z.object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(6),
});
