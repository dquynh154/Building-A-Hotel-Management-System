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
function isValidCCCD(s) {
    return /^[0-9]{12}$/.test(String(s).trim());
}

const khachHang = crud('kHACH_HANG', {
    pk: 'KH_MA',
    // Chỉ lấy các field an toàn (không lộ KH_MATKHAU)
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
        KH_CCCD: true,
        KH_DIACHI: true,
    },
    // Hash mật khẩu khi tạo
    beforeCreate: async (data) => {
        if (!data.KH_HOTEN) {
            const err = new Error('Thiếu họ tên'); err.status = 400; throw err;
        }
        if ( !data.KH_SDT) {
            const err = new Error('Thiếu số điện thoại'); err.status = 400; throw err;
        }
        if (!data.KH_CCCD) {
            const err = new Error('Thiếu căn cước công dân'); err.status = 400; throw err;
        }
        if (data.KH_EMAIL != null && data.KH_EMAIL !== '' && !emailRegex.test(String(data.KH_EMAIL))) {
            const e = new Error('Email không hợp lệ'); e.status = 400; throw e;
        }

        // sđt: normalize + validate
        if (data.KH_SDT != null && data.KH_SDT !== '') {
            if (!isValidPhoneVN(data.KH_SDT)) { const e = new Error('Số điện thoại không hợp lệ'); e.status = 400; throw e; }
            data.KH_SDT = toLeadingZeroVN(data.KH_SDT);
        }
        // Validate CCCD (12 số)
        if (data.KH_CCCD != null && data.KH_CCCD !== '') {
            if (!isValidCCCD(data.KH_CCCD)) {
                const e = new Error('CCCD không hợp lệ (phải gồm 12 chữ số)');
                e.status = 400;
                throw e;
            }

            // ép chuỗi, bỏ khoảng trắng
            data.KH_CCCD = String(data.KH_CCCD).trim();
        }

        // Nếu có tạo tài khoản thì phải có mật khẩu → hash
        if (data.KH_TAIKHOAN) {
            if (!data.KH_MATKHAU) { const err = new Error('Thiếu mật khẩu'); err.status = 400; throw err; }
            data.KH_MATKHAU = await hash(data.KH_MATKHAU);
        } else {
            // Không tạo tài khoản → đảm bảo KH_MATKHAU null
            delete data.KH_MATKHAU;
        }
        if (data.KH_NGAYSINH) data.KH_NGAYSINH = new Date(data.KH_NGAYSINH);
        return data;
    },
    // Hash mật khẩu khi update nếu có gửi KH_MATKHAU
    beforeUpdate: async (data) => {
        if (data.KH_MATKHAU) {
            data.KH_MATKHAU = await hash(data.KH_MATKHAU);
        }
        if (data.KH_EMAIL != null && data.KH_EMAIL !== '' && !emailRegex.test(String(data.KH_EMAIL))) {
            const e = new Error('Email không hợp lệ'); e.status = 400; throw e;
        }

        if (data.KH_SDT != null && data.KH_SDT !== '') {
            if (!isValidPhoneVN(data.KH_SDT)) { const e = new Error('Số điện thoại không hợp lệ'); e.status = 400; throw e; }
            data.KH_SDT = toLeadingZeroVN(data.KH_SDT);
        }
        // Validate CCCD (12 số)
        if (data.KH_CCCD != null && data.KH_CCCD !== '') {
            if (!isValidCCCD(data.KH_CCCD)) {
                const e = new Error('CCCD không hợp lệ (phải gồm 12 chữ số)');
                e.status = 400;
                throw e;
            }

            // ép chuỗi, bỏ khoảng trắng
            data.KH_CCCD = String(data.KH_CCCD).trim();
        }

        if (data.KH_NGAYSINH) data.KH_NGAYSINH = new Date(data.KH_NGAYSINH);
        return data;
    },
    searchFields: ['KH_HOTEN', 'KH_TAIKHOAN', 'KH_EMAIL', 'KH_SDT'],
    eqFields: [],
});


module.exports = khachHang;