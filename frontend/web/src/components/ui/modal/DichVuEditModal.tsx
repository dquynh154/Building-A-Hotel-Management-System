'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';

export type DichVuRow = {
    DV_MA: number;
    LDV_MA: number;
    DV_TEN: string;
    DV_DONGIA: string; // decimal string
    LOAI_DICH_VU?: { LDV_MA: number; LDV_TEN: string } | null;
};

type LDV = { LDV_MA: number; LDV_TEN: string };

export default function DichVuEditModal({
    open, id, onClose, onUpdated,
}: { open: boolean; id: number | null; onClose: () => void; onUpdated?: () => void; }) {
    const [ten, setTen] = useState('');
    const [ldv, setLdv] = useState<number | ''>('');
    const [donGia, setDonGia] = useState<number | ''>('');
    const [ldvOptions, setLdvOptions] = useState<LDV[]>([]);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !id) return;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const [dvRes, ldvRes] = await Promise.all([
                    api.get<DichVuRow>(`/dich-vu/${id}`),
                    api.get<LDV[]>('/loai-dich-vu', { params: { take: 200 } }),
                ]);
                const dv = dvRes.data;
                setTen(dv.DV_TEN || '');
                setLdv(dv.LDV_MA ?? '');
                setDonGia(toNumberOrEmpty(dv.DV_DONGIA));
                setLdvOptions(ldvRes.data || []);
            } catch (e: any) {
                setErr(e?.response?.data?.message || 'Không tải được dữ liệu');
            } finally { setLoading(false); }
        })();
    }, [open, id]);
    const toNumberOrEmpty = (x: unknown): number | '' => {
        if (x === null || x === undefined || x === '') return '';
        const n = Number(x);
        return Number.isFinite(n) ? n : '';
    };
    const canSave =
        ten.trim() && ldv !== '' && donGia !== '' && Number.isFinite(Number(donGia)) && !saving;

    const save = async () => {
        if (!id || !canSave) return;
        setSaving(true); setErr(null);
        try {
            await api.put(`/dich-vu/${id}`, {
                DV_TEN: ten.trim(),
                LDV_MA: Number(ldv),
                DV_DONGIA: donGia, // gửi string cho Decimal
            });
            onUpdated?.();
            onClose();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Lưu thất bại');
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-2xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Sửa dịch vụ</h3>

            {loading ? (
                <div className="p-2 text-sm text-slate-500">Đang tải…</div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm">Tên dịch vụ *</label>
                        <input
                            value={ten}
                            onChange={(e) => setTen(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
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
                        />
                    </div>
                </div>
            )}

            {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

            <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={save}>
                    {saving ? 'Đang lưu…' : 'Lưu'}
                </Button>
            </div>
        </Modal>
    );
}
