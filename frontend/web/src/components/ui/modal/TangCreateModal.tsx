import { useState } from "react";
import { Modal } from ".";
import Button from "../button/Button";
import api from "@/lib/api";

export default function TangQuickCreateModal({
    open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated?: () => void; }) {
    const [ten, setTen] = useState('');
    const [so, setSo] = useState<number | ''>('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const canSave = !!ten.trim() && !saving;
    const save = async () => {
        if (!canSave) return;
        setSaving(true); setErr(null);
        try {
            await api.post('/tang', {
                TANG_TEN: ten.trim(),
                // ...(so !== '' ? { TANG_SO: Number(so) } : {}),
            });
            onCreated?.();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Lưu tầng thất bại');
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-md p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Thêm tầng</h3>
            <div className="space-y-3">
                <div>
                    <label className="mb-1 block text-sm">Tên tầng *</label>
                    <input
                        value={ten}
                        onChange={(e) => setTen(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        placeholder="VD: Tầng 1 / Khu A"
                    />
                </div>
                
                {err && <p className="text-sm text-red-500">{err}</p>}
                <div className="mt-2 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
                    <Button variant="primary" size="sm" disabled={!canSave} onClick={save}>
                        {saving ? 'Đang lưu…' : 'Lưu'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}