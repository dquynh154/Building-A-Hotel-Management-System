'use client';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import Input from '@/components/form/input/InputField';
import api from '@/lib/api';

export type KhachHangPayload = {
    KH_HOTEN: string;
    KH_SDT?: string;
    KH_EMAIL?: string;
    KH_CCCD?: string;
    KH_GIOITINH?: 'M' | 'F' | 'O' | '';
    KH_NGAYSINH?: string;     // yyyy-mm-dd
    KH_DIACHI?: string;
    KH_GHICHU?: string;
};

export default function KhachHangCreateModal({
    open,
    onClose,
    onCreated,
    preset,
}: {
    open: boolean;
    onClose: () => void;
    // (id, label, fullCreatedRecord)
    onCreated: (id: number, label: string, rec: any) => void;
    // giá trị gợi ý sẵn (vd: auto đổ số điện thoại vừa nhập)
    preset?: Partial<KhachHangPayload>;
}) {
    const [f, setF] = useState<KhachHangPayload>({
        KH_HOTEN: '',
        KH_SDT: '',
        KH_EMAIL: '',
        KH_CCCD: '',
        KH_GIOITINH: '',
        KH_NGAYSINH: '',
        KH_DIACHI: '',
        KH_GHICHU: '',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // đổ lại preset mỗi lần mở
    useMemo(() => {
        if (!open) return;
        setErr(null);
        setSaving(false);
        setF((prev) => ({
            ...prev,
            ...(preset || {}),
            KH_HOTEN: preset?.KH_HOTEN ?? prev.KH_HOTEN ?? '',
            KH_SDT: preset?.KH_SDT ?? prev.KH_SDT ?? '',
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const set = <K extends keyof KhachHangPayload>(k: K, v: KhachHangPayload[K]) =>
        setF((s) => ({ ...s, [k]: v }));

    // validate đơn giản
    const phoneOk = !f.KH_SDT || /^[0-9\-+() ]{8,20}$/.test(f.KH_SDT);
    const emailOk = !f.KH_EMAIL || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.KH_EMAIL);
    const canSave = !!f.KH_HOTEN.trim() && phoneOk && emailOk && !saving;

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        setErr(null);
        try {
            const payload: any = {
                KH_HOTEN: f.KH_HOTEN.trim(),
                ...(f.KH_SDT?.trim() ? { KH_SDT: f.KH_SDT.trim() } : {}),
                ...(f.KH_EMAIL?.trim() ? { KH_EMAIL: f.KH_EMAIL.trim() } : {}),
                ...(f.KH_CCCD?.trim() ? { KH_CCCD: f.KH_CCCD.trim() } : {}),
                ...(f.KH_GIOITINH ? { KH_GIOITINH: f.KH_GIOITINH } : {}),
                ...(f.KH_NGAYSINH ? { KH_NGAYSINH: f.KH_NGAYSINH } : {}),
                ...(f.KH_DIACHI?.trim() ? { KH_DIACHI: f.KH_DIACHI.trim() } : {}),
                ...(f.KH_GHICHU?.trim() ? { KH_GHICHU: f.KH_GHICHU.trim() } : {}),
            };

            const r = await api.post('/khach-hang', payload);
            const id = r.data?.KH_MA;
            const label = `${r.data?.KH_HOTEN}${r.data?.KH_SDT ? ` (${r.data.KH_SDT})` : ''}`;
            onCreated(id, label, r.data);
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Không tạo được khách hàng');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-3xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Thêm khách hàng</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm">Họ tên *</label>
                    <Input value={f.KH_HOTEN} onChange={(e) => set('KH_HOTEN', e.target.value)} />
                </div>

                <div>
                    <label className="mb-1 block text-sm">SĐT</label>
                    <Input value={f.KH_SDT || ''} onChange={(e) => set('KH_SDT', e.target.value)} />
                    {!phoneOk && <p className="mt-1 text-xs text-red-600">Số điện thoại không hợp lệ</p>}
                </div>

                <div>
                    <label className="mb-1 block text-sm">Email</label>
                    <Input value={f.KH_EMAIL || ''} onChange={(e) => set('KH_EMAIL', e.target.value)} />
                    {!emailOk && <p className="mt-1 text-xs text-red-600">Email không hợp lệ</p>}
                </div>

                <div>
                    <label className="mb-1 block text-sm">CMND/CCCD</label>
                    <Input value={f.KH_CCCD || ''} onChange={(e) => set('KH_CCCD', e.target.value)} />
                </div>

                <div>
                    <label className="mb-1 block text-sm">Giới tính</label>
                    <select
                        className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        value={f.KH_GIOITINH || ''}
                        onChange={(e) => set('KH_GIOITINH', e.target.value as any)}
                    >
                        <option value="">— Chọn —</option>
                        <option value="M">Nam</option>
                        <option value="F">Nữ</option>
                        <option value="O">Khác</option>
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-sm">Ngày sinh</label>
                    <input
                        type="date"
                        className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        value={f.KH_NGAYSINH || ''}
                        onChange={(e) => set('KH_NGAYSINH', e.target.value)}
                    />
                </div>

                <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm">Địa chỉ</label>
                    <Input value={f.KH_DIACHI || ''} onChange={(e) => set('KH_DIACHI', e.target.value)} />
                </div>

                <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm">Ghi chú</label>
                    <textarea
                        className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        rows={3}
                        value={f.KH_GHICHU || ''}
                        onChange={(e) => set('KH_GHICHU', e.target.value)}
                    />
                </div>
            </div>

            {err && (
                <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/30">
                    {err}
                </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                    Đóng
                </Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={save}>
                    {saving ? 'Đang lưu…' : 'Lưu khách hàng'}
                </Button>
            </div>
        </Modal>
    );
}
