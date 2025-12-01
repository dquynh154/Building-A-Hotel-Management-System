// module.exports = (err, req, res, next) => {
//     // Prisma unique constraint
//     if (err?.code === 'P2002') {
//         return res.status(409).json({ message: `Duplicate: ${err.meta?.target?.join(', ')}` });
//     }
//     console.error(err);
//     res.status(500).json({ message: 'Server error' });
// };


module.exports = (err, req, res, next) => {
    // Log server (đủ để debug)
    console.error('[ERROR]', err);

    // 1) Lỗi do bạn chủ động ném: cho phép set status/message tuỳ ý
    if (err && err.status) {
        return res.status(err.status).json({ message: err.message || 'Error' });
    }

    // 2) Một số lỗi Prisma hay gặp
    if (err?.code === 'P2002') {
        const fields = err.meta?.target || [];
        if (fields.includes('HT_TEN')) {
            return res.status(409).json({ message: 'Hình thức đã có! Vui lòng nhập tên khác.' });
        }

        if (fields.includes('PHONG_TEN')) {
            return res.status(409).json({ message: 'Phòng đã có! Vui lòng nhập tên khác.' });
        }

        if (fields.includes('KH_TAIKHOAN')) {
            return res.status(409).json({ message: 'Tài khoản này đã tồn tại.' });
        }
        if (fields.includes('KH_SDT')) {
            return res.status(409).json({ message: 'Số điện thoại này đã có người sử dụng.' });
        }
        if (fields.includes('KH_CCCD')) {
            return res.status(409).json({ message: 'Căn cước công dân đã được sử dụng.' });
        }
        if (fields.includes('KH_EMAIL')) {
            return res.status(409).json({ message: 'Email đã trùng! VUi lòng nhập email khác.' });
        }

        if (fields.includes('NV_TAIKHOAN')) {
            return res.status(409).json({ message: 'Tài khoản này đã tồn tại.' });
        }
        if (fields.includes('NV_SDT')) {
            return res.status(409).json({ message: 'Số điện thoại này đã có người sử dụng.' });
        }
        if (fields.includes('NV_EMAIL')) {
            return res.status(409).json({ message: 'Email đã trùng! VUi lòng nhập email khác.' });
        }

        if (fields.includes('KM_MA')) {
            return res.status(409).json({ message: 'Mã khuyến mãi đã có! Vui lòng nhập tên khác.' });
        }
        return res.status(409).json({ message: `Duplicate: ${err.meta?.target?.join(', ')}` });
    }
    if (err?.code === 'P2025') {
        // Record not found
        return res.status(404).json({ message: 'Record not found' });
    }

    // 3) (tuỳ chọn) Zod validation
    if (err?.name === 'ZodError') {
        const first = err.issues?.[0];

        return res.status(400).json({
            error: first?.message || "Dữ liệu không hợp lệ"
        });
    }

    if (err?.code === 'P2003') {
        // Foreign key constraint failed
        return res.status(409).json({ message: 'Không thể xoá vì phòng đang/đã được tham chiếu (đặt phòng, dịch vụ, lịch sử dọn...)' });
    }
    if (err?.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    // 4) Mặc định
    return res.status(500).json({ message: err?.message || 'Server error' });
};
