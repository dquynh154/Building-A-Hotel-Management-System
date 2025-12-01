const { z } = require('zod');

// Guest: đăng ký & đăng nhập
exports.guestRegister = z.object({
    KH_HOTEN: z.string().min(1, "Vui lòng nhập họ tên."),
    KH_SDT: z.string()
        .regex(/^\d{10}$/, "Số điện thoại không hợp lệ, phải đúng 10 chữ số"),
    KH_CCCD: z.string().min(12).max(12).optional().nullable(),
    KH_EMAIL: z.string().email("Email không hợp lệ.").optional().nullable(),
    KH_TAIKHOAN: z.string()
        .regex(/^[a-zA-Z0-9_]{4,32}$/, "Tên đăng nhập chỉ gồm chữ, số, dấu gạch dưới (4–32 ký tự)."),
    KH_MATKHAU: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự."),
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
