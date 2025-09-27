const { crud } = require('./crud');
const { hash } = require('../utils/hash'); 

const nhanVien = crud('nHAN_VIEN', {
    pk: 'NV_MA',
    // Chỉ lấy các field an toàn (không lộ NV_MATKHAU)
    select: {
        NV_MA: true,
        NV_HOTEN: true,
        NV_EMAIL: true,
        NV_SDT: true,
        NV_NGAYSINH: true,
        NV_GIOITINH: true,
        NV_CHUCVU: true,
        NV_TAIKHOAN: true,
        NV_TRANGTHAI: true,
        NV_NGAYTAO: true,
        NV_NGAYSUA: true,
    },
    // Hash mật khẩu khi tạo
    beforeCreate: async (data) => {
        if (!data.NV_TAIKHOAN || !data.NV_MATKHAU || !data.NV_HOTEN) {
            const err = new Error('Thiếu NV_TAIKHOAN / NV_MATKHAU / NV_HOTEN');
            err.status = 400; throw err;
        }
        data.NV_MATKHAU = await hash(data.NV_MATKHAU);
        if (data.NV_NGAYSINH) data.NV_NGAYSINH = new Date(data.NV_NGAYSINH);
        return data;
    },
    // Hash mật khẩu khi update nếu có gửi NV_MATKHAU
    beforeUpdate: async (data) => {
        if (data.NV_MATKHAU) {
            data.NV_MATKHAU = await hash(data.NV_MATKHAU);
        }
        if (data.NV_NGAYSINH) data.NV_NGAYSINH = new Date(data.NV_NGAYSINH);
        return data;
    },
    searchFields: ['NV_HOTEN', 'NV_TAIKHOAN', 'NV_EMAIL', 'NV_SDT'],
    eqFields: ['NV_TRANGTHAI', 'NV_CHUCVU'],
});


module.exports = nhanVien;