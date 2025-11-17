'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import DatePicker from '@/components/form/date-picker';
import { EyeCloseIcon, EyeIcon } from '@/icons';
import Input from '@/components/form/input/InputField';

type GioiTinh = 'M' | 'F' | 'O' | ''; // Giữ nguyên convention cũ của KH: M/F/O

export default function KhachHangCreateModal({
    open, onClose, onCreated, preset,
}: {
    open: boolean;
    onClose: () => void;
    onCreated?: (id: number, label: string, rec: any) => void;
    // tuỳ chọn: gợi ý sẵn (ví dụ auto đổ SĐT vừa nhập)
    preset?: Partial<{
        KH_HOTEN: string;
        KH_SDT: string;
        KH_EMAIL: string;
        KH_CCCD: string;
        KH_GIOITINH: GioiTinh;
        KH_NGAYSINH: string; // yyyy-MM-dd
        KH_DIACHI: string;
    }>;
}) {
    // --- form state (giữ nguyên field theo schema KHACH_HANG) ---
    const [hoten, setHoten] = useState('');
    const [sdt, setSdt] = useState('');               // KH_SDT
    const [email, setEmail] = useState('');           // KH_EMAIL
    const [cccd, setCccd] = useState('');             // KH_CCCD
    const [gioiTinh, setGioiTinh] = useState<GioiTinh>(''); // KH_GIOITINH: M/F/O/''
    const [ngaySinh, setNgaySinh] = useState('');     // yyyy-MM-dd -> KH_NGAYSINH
    const [diaChi, setDiaChi] = useState('');         // KH_DIACHI

    // UX state
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [emailErr, setEmailErr] = useState<string | null>(null);
    const [phoneErr, setPhoneErr] = useState<string | null>(null);
    const [cccdErr, setCccdErr] = useState<string | null>(null);


    const normalizePhone = (s: string) => s.replace(/\D/g, '');
    const isValidEmail = (s: string) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    const isValidPhoneVN = (s: string) => {
        if (!s) return false; // KH yêu cầu SĐT bắt buộc
        const d = normalizePhone(s);
        return /^0\d{9,10}$/.test(d) || /^84\d{9,10}$/.test(d);
    };
    // VN CCCD/CMND: 9 số (CMND cũ) hoặc 12 số (CCCD mới)
    const isValidCCCD = (s: string) => !!s && (/^\d{12}$/.test(s));


    // --- reset khi mở modal, đổ preset nếu có ---
    useEffect(() => {
        if (!open) return;
        const p = preset || {};
        setErr(null);
        setSaving(false);
        setHoten(p.KH_HOTEN ?? '');
        setSdt(p.KH_SDT ?? '');
        setEmail(p.KH_EMAIL ?? '');
        setCccd(p.KH_CCCD ?? '');
        setGioiTinh((p.KH_GIOITINH as GioiTinh) ?? '');
        setNgaySinh(p.KH_NGAYSINH ?? '');
        setDiaChi(p.KH_DIACHI ?? '');
        setEmailErr(null); setPhoneErr(null); setCccdErr(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    const basicOk =
        !!hoten.trim() &&
        isValidPhoneVN(sdt) &&
        isValidCCCD(cccd);
    // Không validate ở frontend, để BE kiểm tra hết
    const canSave = !saving;

    const trim = (x?: string) => (x ?? '').trim();

    const buildPayload = () => {
        const payload: any = {
            KH_HOTEN: trim(hoten),
            ...(trim(sdt) ? { KH_SDT: trim(sdt) } : {}),
            ...(trim(email) ? { KH_EMAIL: trim(email) } : {}),
            ...(trim(cccd) ? { KH_CCCD: trim(cccd) } : {}),
            ...(gioiTinh ? { KH_GIOITINH: gioiTinh } : {}),
            ...(ngaySinh ? { KH_NGAYSINH: ngaySinh } : {}),
            ...(trim(diaChi) ? { KH_DIACHI: trim(diaChi) } : {}),

        };
        return payload;
    };

    const submit = async (keepOpen: boolean) => {
        if (!canSave) return;
        setSaving(true); setErr(null);
        try {
            const r = await api.post('/khach-hang', buildPayload());
            const rec = r.data;
            const id = rec?.KH_MA;
            const label = `${rec?.KH_HOTEN}${rec?.KH_SDT ? ` (${rec.KH_SDT})` : ''}`;
            onCreated?.(id, label, rec);
            if (keepOpen) {
                // reset về rỗng (hoặc giữ preset nếu muốn)
                setHoten(''); setSdt(''); setEmail(''); setCccd('');
                setGioiTinh(''); setNgaySinh(''); setDiaChi('');
                setEmailErr(null); setPhoneErr(null); setCccdErr(null);
            } else {
                onClose();
            }
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Lưu thất bại');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-4xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Thêm khách hàng</h3>

            {err && (
                <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/30">
                    {err}
                </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm">Họ tên *</label>
                    <Input
                        type="text"
                        placeholder="Nhập họ và tên"
                        value={hoten}
                        onChange={(e) => setHoten(e.target.value)}
                    />
                    {/* <p className="mt-1 text-xs text-slate-500">(Backend sẽ kiểm tra tính hợp lệ)</p> */}
                </div>

                <div>
                    <label className="mb-1 block text-sm">Số điện thoại *</label>
                    <Input
                        type="tel"
                        placeholder="vd: 0912345678 hoặc +84912345678"
                        value={sdt}
                        onChange={(e) => { setSdt(e.target.value); if (phoneErr) setPhoneErr(null); }}
                        onBlur={() => setPhoneErr(isValidPhoneVN(sdt) ? null : 'Số điện thoại không hợp lệ')}
                        error={!!phoneErr}
                    />
                    {phoneErr && <p className="mt-1 text-xs text-red-500">{phoneErr}</p>}
                </div>

                <div>
                    <label className="mb-1 block text-sm">Email</label>
                    <Input
                        type="email"
                        placeholder="vd: ten@domain.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(null); }}
                        onBlur={(e) => setEmailErr(isValidEmail(e.target.value) ? null : 'Email không hợp lệ')}
                        error={!!emailErr}
                    />
                    {emailErr && <p className="mt-1 text-xs text-red-500">{emailErr}</p>}
                </div>

                <div>
                    <label className="mb-1 block text-sm">CCCD *</label>
                    <Input
                        type="text"
                        placeholder="12 chữ số"
                        value={cccd}
                        onChange={(e) => { setCccd(e.target.value); if (cccdErr) setCccdErr(null); }}
                        onBlur={() => setCccdErr(isValidCCCD(cccd) ? null : 'Số CCCD không hợp lệ')}
                        error={!!cccdErr}
                    />
                    {cccdErr && <p className="mt-1 text-xs text-red-500">{cccdErr}</p>}
                </div>

                <div>
                    <DatePicker
                        id="kh-ngaysinh-create"
                        label="Ngày sinh"
                        allowPastDates={true}
                        placeholder="Chọn ngày"
                        defaultDate={ngaySinh || undefined} // yyyy-MM-dd
                        onChange={(_, dateStr) => setNgaySinh(dateStr)}
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm">Giới tính</label>
                    <select
                        className="w-full rounded-lg border px-3 py-3 text-sm dark:bg-slate-800"
                        value={gioiTinh}
                        onChange={(e) => setGioiTinh(e.target.value as GioiTinh)}
                    >
                        <option value="">— Chọn —</option>
                        <option value="M">Nam</option>
                        <option value="F">Nữ</option>
                        <option value="O">Khác</option>
                    </select>
                </div>

                <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm">Địa chỉ</label>
                    <Input
                        type="text"
                        placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
                        value={diaChi}
                        onChange={(e) => setDiaChi(e.target.value)}
                    />
                </div>
                
            </div>

            <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
                <Button
                    variant="primary"
                    size="sm"
                    disabled={!canSave}
                    onClick={() => submit(false)}
                >
                    {saving ? 'Đang lưu…' : 'Lưu'}
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    disabled={!canSave}
                    onClick={() => submit(true)}
                >
                    {saving ? '…' : 'Lưu & Thêm mới'}
                </Button>
            </div>
        </Modal>
    );
}
