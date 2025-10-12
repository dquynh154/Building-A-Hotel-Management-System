'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import DatePicker from '@/components/form/date-picker';
import { EyeCloseIcon, EyeIcon } from '@/icons';
import Input from '@/components/form/input/InputField';

export default function NhanVienCreateModal({
    open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated?: () => void; }) {
    const [hoten, setHoten] = useState('');
    const [taikhoan, setTaikhoan] = useState('');
    const [matkhau, setMatkhau] = useState('');
    const [email, setEmail] = useState('');
    const [sdt, setSdt] = useState('');
    const [ngaySinh, setNgaySinh] = useState(''); // yyyy-MM-dd
    const [gioiTinh, setGioiTinh] = useState(''); // NAM | NU | KHAC
    const [chucVu, setChucVu] = useState('');
    const [trangThai, setTrangThai] = useState<'true' | 'false'>('true');
    const ROLE_OPTIONS = ['Admin', 'Lễ Tân'] as const;
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    // helpers
    const normalizePhone = (s: string) => s.replace(/\D/g, ''); // giữ lại số
    const isValidEmail = (s: string) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    const isValidPhoneVN = (s: string) => {
        if (!s) return true; // cho phép bỏ trống
        const digits = normalizePhone(s);
        // VN: 9–11 số (mobile thường 10), chấp nhận bắt đầu 0 hoặc 84/+84
        if (/^0\d{9,10}$/.test(digits)) return true;
        if (/^84\d{9,10}$/.test(digits)) return true;
        return false;
    };

    const [emailErr, setEmailErr] = useState<string | null>(null);
    const [phoneErr, setPhoneErr] = useState<string | null>(null);

    useEffect(() => { if (open) { reset(); } }, [open]);
    const reset = () => {
        setHoten(''); setTaikhoan(''); setMatkhau(''); setEmail(''); setSdt('');
        setNgaySinh(''); setGioiTinh(''); setChucVu(''); setTrangThai('true'); setErr(null);
    };

    const canSave = !!hoten.trim() && !!taikhoan.trim() && !!matkhau.trim() && isValidEmail(email) &&
        isValidPhoneVN(sdt) &&
        !saving;

    const submit = async (keepOpen: boolean) => {
        if (!canSave) return;
        setSaving(true); setErr(null);
        try {
            await api.post('/nhan-vien', {
                NV_HOTEN: hoten.trim(),
                NV_TAIKHOAN: taikhoan.trim(),
                NV_MATKHAU: matkhau, // BE sẽ hash
                NV_EMAIL: email.trim() || null,
                NV_SDT: (() => {
                    const d = normalizePhone(sdt);
                    if (!d) return null;
                    if (d.startsWith('84')) return '0' + d.slice(2);
                    return d;
                })(),
                NV_NGAYSINH: ngaySinh || null,
                NV_GIOITINH: gioiTinh || null,
                NV_CHUCVU: chucVu.trim() || null,
                NV_TRANGTHAI: trangThai,
            });
            onCreated?.();
            if (keepOpen) reset(); else onClose();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Lưu thất bại');
        } finally { setSaving(false); }
    };
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);



    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-4xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Thêm nhân viên</h3>
            {/* {/* <div className="p-4 w-[92vw] max-w-[720px]"> */}
            {err && <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/30">{err}</div>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm">Họ tên *</label>
                    {/* <input className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800" value={hoten} onChange={(e) => setHoten(e.target.value)} /> */}
                    <Input 
                        type="text"
                        placeholder="Nhập họ và tên"
                        name={hoten}
                        onChange={(e) => setHoten(e.target.value)}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm">Chức vụ *</label>
                    <select
                        className="w-full rounded-lg border px-3 py-3 text-sm dark:bg-slate-800"
                        value={chucVu}
                        onChange={(e) => setChucVu(e.target.value)}
                    >
                        <option value="">— Chọn —</option>
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-sm">Tài khoản *</label>
                    {/* <input className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800" value={taikhoan} onChange={(e) => setTaikhoan(e.target.value)} /> */}
                    <Input
                        type="text"
                        placeholder="Nhập tên tài khoản"
                        name={taikhoan}
                        onChange={(e) => setTaikhoan(e.target.value)}
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm">Mật khẩu *</label>
                    <div className="relative">
                        {/* <input type="password" className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800" value={matkhau} onChange={(e) => setMatkhau(e.target.value)} /> */}
                        <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Nhập mật khẩu của bạn"
                            name={matkhau}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <span
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                        >
                            {showPassword ? (
                                <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                            ) : (
                                <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                            )}
                        </span>
                    </div>
                </div>
                <div>
                    <label className="mb-1 block text-sm">Email</label>
                    <Input
                        type="email"
                        name="NV_EMAIL"                         
                        placeholder="vd: ten@domain.com"
                        value={email}                           
                        onChange={(e) => {
                            setEmail(e.target.value);
                            if (emailErr) setEmailErr(null);     
                        }}
                        onBlur={(e) => {                       
                            const v = e.target.value;
                            setEmailErr(!v || isValidEmail(v) ? null : 'Email không hợp lệ');
                        }}
                        error={!!emailErr}
                    />
                    {emailErr && <p className="mt-1 text-xs text-red-500">{emailErr}</p>}
                    
                </div>
                <div>
                    <label className="mb-1 block text-sm">Số điện thoại *</label>
                    <Input
                        type="tel"
                        name="NV_SDT"                        
                        placeholder="vd: 0912345678 hoặc +84912345678"
                        value={sdt}                           
                        onChange={(e) => { setSdt(e.target.value); if (phoneErr) setPhoneErr(null); }}
                        onBlur={() => setPhoneErr(isValidPhoneVN(sdt) ? null : 'Số điện thoại không hợp lệ')}
                        error={!!phoneErr}
                    />
                    {phoneErr && <p className="mt-1 text-xs text-red-500">{phoneErr}</p>}
                </div>
                <div>
                    <DatePicker
                        id="nv-ngaysinh-create"
                        label="Ngày sinh"
                        placeholder="Chọn ngày"
                        defaultDate={ngaySinh || undefined} // yyyy-mm-dd hoặc undefined
                        onChange={(_, dateStr) => setNgaySinh(dateStr)} // flatpickr trả về đúng format "Y-m-d"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm">Giới tính</label>
                    <select className="w-full rounded-lg border px-3 py-3 text-sm dark:bg-slate-800" value={gioiTinh} onChange={(e) => setGioiTinh(e.target.value)}>
                        <option value="">— Chọn —</option>
                        <option value="NAM">Nam</option>
                        <option value="NU">Nữ</option>
                        <option value="KHAC">Khác</option>
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-sm">Trạng thái</label>
                    <select className="w-full rounded-lg border px-3 py-3 text-sm dark:bg-slate-800" value={trangThai} onChange={(e) => setTrangThai(e.target.value as 'true' | 'false')}>
                        <option value="true">Hoạt động</option>
                        <option value="false">Ngừng</option>
                    </select>
                </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={() => submit(false)}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={() => submit(true)}>{saving ? '…' : 'Lưu & Thêm mới'}</Button>
            </div>
            {/* </div> */}
        </Modal>
    );
}
