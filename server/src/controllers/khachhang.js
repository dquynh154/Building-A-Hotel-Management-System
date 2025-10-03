const { crud } = require('./crud');
const { hash } = require('../utils/hash'); 

const khachHang = crud('kHACH_HANG', {
    pk: 'KH_MA',
    // Chỉ lấy các field an toàn (không lộ NV_MATKHAU)
    select: {
        KH_MA: true,
        KH_HOTEN: true,
        KH_EMAIL: true,
        KH_SDT: true,
        KH_NGAYSINH: true,
        KH_GIOITINH: true,
        KH_TAIKHOAN: true,
        KH_NGAYTAO: true,
        KH_NGAYSUA: true,
    },
    // Hash mật khẩu khi tạo
    beforeCreate: async (data) => {
        if (!data.KH_HOTEN || !data.KH_SDT || !data.KH_CCCD) {
            const err = new Error('Thiếu KH_HOTEN / KH_SDT / KH_CCCD'); err.status = 400; throw err;
        }
        // Nếu có tạo tài khoản thì phải có mật khẩu → hash
        if (data.KH_TAIKHOAN) {
            if (!data.KH_MATKHAU) { const err = new Error('Thiếu KH_MATKHAU'); err.status = 400; throw err; }
            data.KH_MATKHAU = await hash(data.KH_MATKHAU);
        } else {
            // Không tạo tài khoản → đảm bảo KH_MATKHAU null
            delete data.KH_MATKHAU;
        }
        if (data.KH_NGAYSINH) data.KH_NGAYSINH = new Date(data.KH_NGAYSINH);
        return data;
    },
    // Hash mật khẩu khi update nếu có gửi NV_MATKHAU
    beforeUpdate: async (data) => {
        if (data.KH_MATKHAU) {
            data.KH_MATKHAU = await hash(data.KH_MATKHAU);
        }
        if (data.KH_NGAYSINH) data.KH_NGAYSINH = new Date(data.KH_NGAYSINH);
        return data;
    },
    searchFields: ['KH_HOTEN', 'KH_TAIKHOAN', 'KH_EMAIL', 'KH_SDT'],
    eqFields: [],
});


module.exports = khachHang;