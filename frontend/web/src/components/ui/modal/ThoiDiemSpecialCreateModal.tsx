'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import DatePicker from '@/components/form/date-picker';

export default function ThoiDiemCreateModal({
    open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated?: (newId: number) => void }) {
    const [ten, setTen] = useState('');
    const [start, setStart] = useState(''); // yyyy-MM-dd
    const [end, setEnd] = useState('');     // yyyy-MM-dd
    const [desc, setDesc] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const save = async () => {
        if (!ten.trim()) { setErr('Vui lòng nhập tên thời điểm'); return; }
        if (!start || !end) { setErr('Vui lòng chọn đủ Ngày bắt đầu & Ngày kết thúc'); return; }
        if (new Date(start) > new Date(end)) { setErr('Ngày bắt đầu phải ≤ ngày kết thúc'); return; }

        setSaving(true); setErr(null);
        try {
            const startIso = `${start}T00:00:00.000Z`;
            const endIso = `${end}T00:00:00.000Z`;

            const res = await api.post('/thoi-diem', {
                TD_TEN: ten.trim(),    
                type: 'SPECIAL',
                special: {
                    TD_NGAY_BAT_DAU: startIso,
                    TD_NGAY_KET_THUC: endIso,
                    TD_MOTA_CHIENDICH: desc.trim() || null,
                },
            });

            onCreated?.(res.data?.TD_MA);
            setStart(''); setEnd(''); setDesc('');
            onClose();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Tạo thất bại');
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-md p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Thêm thời điểm đặc biệt</h3>

            <div className="space-y-3">
                <div>
                    <label className="mb-1 block text-sm">Tên thời điểm *</label>
                    <input
                        value={ten}
                        onChange={e => setTen(e.target.value)}
                        placeholder="VD: Chiến dịch Tết 2026"
                        className="w-full rounded border px-3 py-2 text-sm"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <DatePicker
                        id="td-start"                 // ID phải duy nhất trong trang
                        label="Ngày bắt đầu *"
                        mode="single"
                        defaultDate={start || undefined}  // cho phép hiển thị lại giá trị khi mở lại modal
                        placeholder="Chọn ngày bắt đầu"
                        onChange={(_, dateStr) => {
                            // dateStr dạng 'YYYY-MM-DD' theo dateFormat của component
                            setStart(dateStr || '');
                        }}
                    />

                    <DatePicker
                        id="td-end"
                        label="Ngày kết thúc *"
                        mode="single"
                        defaultDate={end || undefined}
                        placeholder="Chọn ngày kết thúc"
                        onChange={(_, dateStr) => {
                            setEnd(dateStr || '');
                        }}
                    />
                </div>


                <div>
                    <label className="mb-1 block text-sm">Mô tả chiến dịch (tuỳ chọn)</label>
                    <input value={desc} onChange={e => setDesc(e.target.value)}
                        placeholder="VD: Chiến dịch Tết"
                        className="w-full rounded border px-3 py-2 text-sm" />
                </div>
                {err && <p className="text-sm text-red-500">{err}</p>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Huỷ</Button>
                <Button variant="primary" size="sm" onClick={save} disabled={saving}>
                    {saving ? 'Đang lưu…' : 'Lưu'}
                </Button>
            </div>
        </Modal>
    );
}
