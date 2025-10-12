'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';

type LDV = { LDV_MA: number; LDV_TEN: string };

export default function DichVuCreateModal({
    open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated?: () => void; }) {
    // dùng string cho decimal để không trôi số
    const [ten, setTen] = useState('');
    const [ldv, setLdv] = useState<number | ''>('');
    const [donGia, setDonGia] = useState<number | ''>('');
    const [ldvOptions, setLdvOptions] = useState<LDV[]>([]);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setTen(''); setLdv(''); setDonGia(''); setErr(null);
        api.get<LDV[]>('/loai-dich-vu', { params: { take: 200 } })
            .then(res => setLdvOptions(res.data || []))
            .catch(() => setLdvOptions([]));
    }, [open]);

    const canSave =
        ten.trim() && ldv !== '' && donGia !== '' && Number.isFinite(Number(donGia)) && !saving;

    const save = async (keepOpen: boolean) => {
        if (!canSave) return;
        setSaving(true); setErr(null);
        try {
            await api.post('/dich-vu', {
                DV_TEN: ten.trim(),
                LDV_MA: Number(ldv),
                DV_DONGIA: donGia, // gửi string cho Decimal
            });
            onCreated?.();
            if (keepOpen) {
                setTen(''); setLdv(''); setDonGia('');
            } else {
                onClose();
            }
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Lưu thất bại');
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-2xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Thêm dịch vụ</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm">Tên dịch vụ *</label>
                    <input
                        value={ten}
                        onChange={(e) => setTen(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        placeholder="VD: Giặt ủi"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-sm">Loại dịch vụ *</label>
                    <select
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        value={ldv}
                        onChange={(e) => setLdv(e.target.value ? Number(e.target.value) : '')}
                    >
                        <option value="">— Chọn loại —</option>
                        {ldvOptions.map(x => (
                            <option key={x.LDV_MA} value={x.LDV_MA}>{x.LDV_TEN}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-sm">Đơn giá (Decimal) *</label>
                    <input
                        type="number"
                        min={0}
                        step={1000}
                        value={donGia}
                        onChange={(e) => setDonGia(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        placeholder="VD: 50000"
                    />
                </div>
            </div>

            {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

            <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={() => save(false)}>
                    {saving ? 'Đang lưu…' : 'Lưu'}
                </Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={() => save(true)}>
                    {saving ? '…' : 'Lưu & Thêm mới'}
                </Button>
            </div>
        </Modal>
    );
}
