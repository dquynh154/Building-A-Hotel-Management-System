'use client';
import { useState, useRef } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';

export default function LoaiPhongCreateModal({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    onCreated?: () => void; // gọi để reload list
}) {
    const [ten, setTen] = useState('');
    const [soNguoi, setSoNguoi] = useState<number | ''>('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const nameRef = useRef<HTMLInputElement>(null);

    // VALIDATION (≥1). Nếu bạn đã cho phép null ở DB thì đổi điều kiện theo nhu cầu.
    const isTenValid = ten.trim().length > 0;
    const isSoNguoiValid =
        soNguoi !== '' && Number.isInteger(Number(soNguoi)) && Number(soNguoi) >= 1;

    const canSave = isTenValid && isSoNguoiValid && !saving;

    const create = async () => {
        setSaving(true); setErr(null);
        try {
            await api.post('/loai-phong', {
                LP_TEN: ten.trim(),
                LP_SONGUOI: Number(soNguoi),
            });
            onCreated?.();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Lưu thất bại');
            throw e;
        } finally { setSaving(false); }
    };

    const onSave = async () => {
        if (!canSave) return;
        await create();
        onClose(); // đóng modal
    };

    const onSaveAndNew = async () => {
        if (!canSave) return;
        await create();
        // reset để nhập tiếp
        setTen(''); setSoNguoi('');
        setTimeout(() => nameRef.current?.focus(), 0);
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-3xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Thêm loại phòng mới</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm">Tên loại phòng *</label>
                    <input
                        ref={nameRef}
                        value={ten}
                        onChange={(e) => setTen(e.target.value)}
                        placeholder="VD: Phòng đơn VIP"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm">Sức chứa *</label>
                    <input
                        type="number" min={1} step={1}
                        value={soNguoi}
                        onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); }}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === '') { setSoNguoi(''); return; }
                            const n = Math.floor(Number(v));
                            setSoNguoi(n < 1 ? 1 : n);
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                    {soNguoi !== '' && !isSoNguoiValid && (
                        <p className="mt-1 text-xs text-red-500">Phải là số nguyên ≥ 1</p>
                    )}
                </div>
            </div>

            {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

            <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={onSave}>
                    {saving ? 'Đang lưu...' : 'Lưu'}
                </Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={onSaveAndNew}>
                    {saving ? '...' : 'Lưu & Thêm mới'}
                </Button>
            </div>
        </Modal>
    );
}
