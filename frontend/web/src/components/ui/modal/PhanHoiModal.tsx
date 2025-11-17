'use client';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import type { DanhGiaRow } from '@/components/tables/DanhGiaTable';

export default function PhanHoiModal({
    open, review, onClose, onSaved,
}: {
    open: boolean;
    review: DanhGiaRow | null;
    onClose: () => void;
    onSaved?: () => void;
}) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (open && review) setText(review.PHAN_HOI?.PH_NOIDUNG || '');
    }, [open, review]);

    const imgs = useMemo(() => (review?.DINH_KEMS || []).filter(k => k.DKDG_LOAI === 'IMAGE'), [review]);

    const save = async () => {
        if (!review) return;
        setBusy(true);
        try {
            if (review.PHAN_HOI?.PH_MA) {
                await api.put(`/phan-hoi/${review.PHAN_HOI.PH_MA}`, { noi_dung: text });
            } else {
                await api.post('/phan-hoi', { dg_ma: review.DG_MA, noi_dung: text });
            }
            onSaved?.();
            onClose();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Lưu phản hồi thất bại');
        } finally { setBusy(false); }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-3xl p-5 sm:p-6">
            {!review ? null : (
                <div className="space-y-4 text-slate-900">
                    <h3 className="text-base font-medium">Đánh giá #{review.DG_MA} — HĐ #{review.HDONG_MA}</h3>

                    <div className="rounded-md border p-3">
                        <div className="mb-1 text-sm text-gray-500">
                            {new Date(review.DG_TAO_LUC).toLocaleString('vi-VN')} • {review.KHACH_HANG?.KH_HOTEN || 'Khách'}
                        </div>
                        <div className="text-yellow-500">{'★'.repeat(review.DG_SAO)}</div>
                        <div className="mt-1 font-semibold">{review.DG_TIEU_DE}</div>
                        <div className="mt-1 text-sm whitespace-pre-line">{review.DG_NOI_DUNG || ''}</div>

                        {imgs.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {imgs.map((img) => (
                                    <img key={img.DKDG_MA} src={img.DKDG_URL} className="h-20 w-28 rounded object-cover border" alt="" />
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="mb-1 block text-sm">Phản hồi của khách sạn</label>
                        <textarea
                            rows={5}
                            className="w-full rounded-lg border p-2 text-sm"
                            placeholder="Nhập nội dung phản hồi…"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={onClose}>Đóng</Button>
                        <Button variant="primary" size="sm" disabled={busy || !text.trim()} onClick={save}>
                            {busy ? 'Đang lưu…' : 'Lưu phản hồi'}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
