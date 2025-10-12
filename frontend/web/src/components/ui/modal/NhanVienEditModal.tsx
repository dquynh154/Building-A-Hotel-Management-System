'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import type { NhanVienRow } from '@/components/tables/NhanVienTable';
import DatePicker from '@/components/form/date-picker';
export default function NhanVienEditModal({
    open, id, onClose, onUpdated,
}: { open: boolean; id: number | null; onClose: () => void; onUpdated?: () => void; }) {
    const [hoten, setHoten] = useState('');
    const [taikhoan, setTaikhoan] = useState('');
    const [matkhau, setMatkhau] = useState(''); // optional
    const [email, setEmail] = useState('');
    const [sdt, setSdt] = useState('');
    const [ngaySinh, setNgaySinh] = useState('');
    const [gioiTinh, setGioiTinh] = useState('');
    const [chucVu, setChucVu] = useState('');
    const [trangThai, setTrangThai] = useState<'true' | 'false'>('true');
    const ROLE_OPTIONS = ['Admin', 'Lễ Tân'] as const;
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const normalizePhone = (s: string) => s.replace(/\D/g, '');
    const isValidEmail = (s: string) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    const isValidPhoneVN = (s: string) => {
        if (!s) return true;
        const digits = normalizePhone(s);
        if (/^0\d{9,10}$/.test(digits)) return true;
        if (/^84\d{9,10}$/.test(digits)) return true;
        return false;
    };

    const [emailErr, setEmailErr] = useState<string | null>(null);
    const [phoneErr, setPhoneErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !id) return;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const res = await api.get<NhanVienRow>(`/nhan-vien/${id}`);
                const nv = res.data as any;
                setHoten(nv.NV_HOTEN || '');
                setTaikhoan(nv.NV_TAIKHOAN || '');
                setEmail(nv.NV_EMAIL || '');
                setSdt(nv.NV_SDT || '');
                setNgaySinh(nv.NV_NGAYSINH ? nv.NV_NGAYSINH.substring(0, 10) : '');
                setGioiTinh(nv.NV_GIOITINH || '');
                setChucVu(nv.NV_CHUCVU || '');
                setTrangThai(nv.NV_TRANGTHAI ?? 'true' ); 
                setMatkhau('');
            } catch (e: any) {
                setErr(e?.response?.data?.message || 'Không tải được dữ liệu');
            } finally { setLoading(false); }
        })();
    }, [open, id]);

    const canSave = !!hoten.trim() && !!taikhoan.trim() && isValidEmail(email) && isValidPhoneVN(sdt) && !saving;

    const submit = async () => {
        if (!id || !canSave) return;
        setSaving(true); setErr(null);
        try {
            const payload: any = {
                NV_HOTEN: hoten.trim(),
                NV_TAIKHOAN: taikhoan.trim(),
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
            };
            if (matkhau.trim()) payload.NV_MATKHAU = matkhau; // BE sẽ hash nếu có
            await api.put(`/nhan-vien/${id}`, payload);
            onUpdated?.();
            onClose();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Lưu thất bại');
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-4xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Sửa nhân viên</h3>
            {/* <div className="p-4 w-[92vw] max-w-[720px]"> */}
                {loading ? (
                    <div className="p-2 text-sm text-slate-500">Đang tải…</div>
                ) : (
                    <>
                        {err && <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/30">{err}</div>}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm">Họ tên *</label>
                                <input className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800" value={hoten} onChange={(e) => setHoten(e.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm">Chức vụ *</label>
                                <select
                                    className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800"
                                    value={chucVu}
                                    onChange={(e) => setChucVu(e.target.value)}
                                >
                                    <option value="">— Chọn —</option>
                                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm">Tài khoản *</label>
                                <input className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800" value={taikhoan} onChange={(e) => setTaikhoan(e.target.value)} />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm">Đổi mật khẩu (tuỳ chọn)</label>
                                <input type="password" className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800" value={matkhau} onChange={(e) => setMatkhau(e.target.value)} placeholder="Nhập để đổi" />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm">Email</label>
                                <input
                                    type="email"
                                    className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800"
                                    value={email}
                                    onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(null); }}
                                    onBlur={() => setEmailErr(isValidEmail(email) ? null : 'Email không hợp lệ')}
                                />
                                {emailErr && <p className="mt-1 text-xs text-red-500">{emailErr}</p>}
                            </div>
                            <div>
                                <label className="mb-1 block text-sm">Số điện thoại *</label>
                                <input
                                    inputMode="tel"
                                    className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800"
                                    value={sdt}
                                    onChange={(e) => { setSdt(e.target.value); if (phoneErr) setPhoneErr(null); }}
                                    onBlur={() => setPhoneErr(isValidPhoneVN(sdt) ? null : 'Số điện thoại không hợp lệ')}
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
                                <select className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800" value={gioiTinh} onChange={(e) => setGioiTinh(e.target.value)}>
                                    <option value="">— Chọn —</option>
                                    <option value="NAM">Nam</option>
                                    <option value="NU">Nữ</option>
                                    <option value="KHAC">Khác</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-sm">Trạng thái</label>
                                <select className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800" value={trangThai} onChange={(e) => setTrangThai(e.target.value as any)}>
                                    <option value="true">Hoạt động</option>
                                    <option value="false">Ngừng</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-4 flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
                            <Button variant="primary" size="sm" disabled={!canSave} onClick={submit}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>
                        </div>
                    </>
                )}
            {/* </div> */}
        </Modal>
    );
}
