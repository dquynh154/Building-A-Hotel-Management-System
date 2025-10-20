const { crud } = require('./crud');
const { hash } = require('../utils/hash'); 

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizePhone = (s) => String(s || '').replace(/\D/g, '');
const isValidPhoneVN = (s) => {
    const d = normalizePhone(s);
    if (!d) return true;              // cho phép null
    if (/^0\d{9,10}$/.test(d)) return true;
    if (/^84\d{9,10}$/.test(d)) return true;
    return false;
};
const toLeadingZeroVN = (s) => {
    const d = normalizePhone(s);
    if (!d) return null;
    if (d.startsWith('84')) return '0' + d.slice(2);
    return d;
};

const ROLES = ['Admin', 'Lễ Tân'];
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
        if (!data.NV_CHUCVU || !ROLES.includes(String(data.NV_CHUCVU))) {
            const e = new Error('Chức vụ không hợp lệ (chỉ Admin hoặc Lễ Tân)'); e.status = 400; throw e;
        }

        // email
        if (data.NV_EMAIL != null && data.NV_EMAIL !== '' && !emailRegex.test(String(data.NV_EMAIL))) {
            const e = new Error('Email không hợp lệ'); e.status = 400; throw e;
        }

        // sđt: normalize + validate
        if (data.NV_SDT != null && data.NV_SDT !== '') {
            if (!isValidPhoneVN(data.NV_SDT)) { const e = new Error('Số điện thoại không hợp lệ'); e.status = 400; throw e; }
            data.NV_SDT = toLeadingZeroVN(data.NV_SDT);
        }

        data.NV_MATKHAU = await hash(data.NV_MATKHAU);
        if (data.NV_NGAYSINH) data.NV_NGAYSINH = new Date(data.NV_NGAYSINH);
        return data;
    },
    // Hash mật khẩu khi update nếu có gửi NV_MATKHAU
    beforeUpdate: async (data) => {
        if (data.NV_MATKHAU) data.NV_MATKHAU = await hash(data.NV_MATKHAU);
        if (data.NV_NGAYSINH) data.NV_NGAYSINH = new Date(data.NV_NGAYSINH);
        if (data.NV_CHUCVU != null && !ROLES.includes(String(data.NV_CHUCVU))) {
            const e = new Error('NV_CHUCVU không hợp lệ (chỉ Admin hoặc Lễ Tân)'); e.status = 400; throw e;
        }

        if (data.NV_EMAIL != null && data.NV_EMAIL !== '' && !emailRegex.test(String(data.NV_EMAIL))) {
            const e = new Error('Email không hợp lệ'); e.status = 400; throw e;
        }

        if (data.NV_SDT != null && data.NV_SDT !== '') {
            if (!isValidPhoneVN(data.NV_SDT)) { const e = new Error('Số điện thoại không hợp lệ'); e.status = 400; throw e; }
            data.NV_SDT = toLeadingZeroVN(data.NV_SDT);
        }
        return data;
    },
    searchFields: ['NV_HOTEN', 'NV_TAIKHOAN', 'NV_EMAIL', 'NV_SDT'],
    eqFields: ['NV_TRANGTHAI', 'NV_CHUCVU'],
});


module.exports = nhanVien;