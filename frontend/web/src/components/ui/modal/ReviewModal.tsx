'use client';
import React, { useState, useRef } from 'react';
import { Modal } from '@/components/ui/modal';

interface RoomInfo {
    CTDP_ID: number;
    LP_TEN: string;
    SO_LUONG: number;
}

interface ReviewModalProps {
    open: boolean;
    onClose: () => void;
    hdong_ma: number | null;
    kh_ma: number | undefined;
    rooms?: RoomInfo[];
}

// ------------------------ ImageUploader Component ------------------------
function ImageUploader({
    files,
    onChange,
}: {
    files: File[];
    onChange: (files: File[]) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClick = () => inputRef.current?.click();
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files || []);
        const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

        const uploadedFiles: File[] = [];
        for (const f of selected) {
            const formData = new FormData();
            formData.append('file', f);
            const res = await fetch(`${BASE}/public/upload-review`, {
                method: 'POST',
                body: formData,
            });
            const json = await res.json();
            if (json.ok && json.url) {
                // 🔥 “Đánh dấu” lại file để chứa URL thật
                (f as any).uploadedUrl = json.url;
                uploadedFiles.push(f);
            }
        }
        onChange(uploadedFiles);
    };


    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
            />

            <button
                type="button"
                onClick={handleClick}
                className="flex flex-col items-center justify-center border-2 border-rose-400 text-rose-600 hover:bg-rose-50 rounded-lg px-4 py-3 transition"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-6 h-6 mb-1"
                >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2-2h6l2 2h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                </svg>

                <span className="text-sm font-medium">Thêm hình ảnh</span>
            </button>

            {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                    {files.map((f, i) => (
                        <div key={i} className="relative">
                            <img
                                src={URL.createObjectURL(f)}
                                className="w-20 h-20 rounded object-cover border"
                                alt=""
                            />
                            <button
                                type="button"
                                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                                className="absolute -top-2 -right-2 bg-rose-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ------------------------ Main Modal Component ------------------------
export default function ReviewModal({
    open,
    onClose,
    hdong_ma,
    kh_ma,
    rooms = [],
}: ReviewModalProps) {
    const [overallRating, setOverallRating] = useState(5);
    const [overallText, setOverallText] = useState('');
    const [overallImages, setOverallImages] = useState<File[]>([]);
    const [roomReviews, setRoomReviews] = useState<
        Record<number, { rating: number; text: string; files: File[] }>
    >({});
    const [busy, setBusy] = useState(false);

    // Helper: chuyển file sang base64
    const toBase64 = (file: File): Promise<string> =>
        new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.onerror = rej;
            reader.readAsDataURL(file);
        });

    const handleRoomChange = (id: number, key: 'rating' | 'text' | 'files', value: any) => {
        setRoomReviews(prev => ({
            ...prev,
            [id]: { ...prev[id], [key]: value },
        }));
    };

    const send = async () => {
        try {
            setBusy(true);
            const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

            // Gửi đánh giá tổng thể
            if (overallText.trim()) {
                const dinh_kem = await Promise.all(
                    overallImages.map(async f => ({
                        loai: 'IMAGE',
                        url: (f as any).uploadedUrl || ''
                    }))
                );

                await fetch(`${BASE}/public/khachhang/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        kh_ma,
                        hdong_ma,
                        sao: overallRating,
                        tieu_de: 'Đánh giá tổng thể',
                        noi_dung: overallText,
                        dinh_kem,
                    }),
                });
            }

            // Gửi đánh giá từng loại phòng
            for (const r of rooms) {
                const rv = roomReviews[r.CTDP_ID];
                if (!rv || !rv.text?.trim()) continue;

                const dinh_kem = rv.files?.length
                    ? await Promise.all(
                        rv.files.map(async f => ({
                            loai: 'IMAGE',
                            url: (f as any).uploadedUrl || ''
                        }))
                    )
                    : [];

                await fetch(`${BASE}/public/khachhang/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        kh_ma,
                        hdong_ma,
                        ctdp_id: r.CTDP_ID,
                        sao: rv.rating || 5,
                        tieu_de: `Đánh giá phòng ${r.LP_TEN}`,
                        noi_dung: rv.text,
                        dinh_kem,
                    }),
                });
            }

            alert('Cảm ơn bạn đã gửi đánh giá!');
            onClose();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-lg p-6">
            <div className="text-slate-900 space-y-5">
                <h2 className="text-lg font-semibold">Đánh giá hợp đồng #{hdong_ma}</h2>

                {/* ----- Đánh giá tổng thể ----- */}
                <div>
                    <h3 className="font-medium mb-2">Đánh giá tổng thể</h3>
                    <div className="flex items-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <button
                                key={i}
                                onClick={() => setOverallRating(i)}
                                className={`text-2xl ${i <= overallRating ? 'text-yellow-400' : 'text-gray-300'}`}
                            >
                                ★
                            </button>
                        ))}
                    </div>
                    <textarea
                        rows={3}
                        className="w-full rounded border p-2 text-sm"
                        placeholder="Nhập cảm nhận chung của bạn..."
                        value={overallText}
                        onChange={e => setOverallText(e.target.value)}
                    />
                    <div className="mt-3">
                        <ImageUploader files={overallImages} onChange={setOverallImages} />
                    </div>
                </div>

                {/* ----- Đánh giá từng loại phòng ----- */}
                {rooms.length > 0 && (
                    <div>
                        <h3 className="font-medium mb-2">Đánh giá từng loại phòng (tùy chọn)</h3>
                        {rooms.map(room => {
                            const rv = roomReviews[room.CTDP_ID] || { rating: 5, text: '', files: [] };
                            return (
                                <div key={room.CTDP_ID} className="border rounded-lg p-3 mb-3">
                                    <div className="font-medium mb-1">
                                        {room.LP_TEN} × {room.SO_LUONG}
                                    </div>

                                    <div className="flex items-center gap-1 mb-2">
                                        {[1, 2, 3, 4, 5].map(i => (
                                            <button
                                                key={i}
                                                onClick={() => handleRoomChange(room.CTDP_ID, 'rating', i)}
                                                className={`text-2xl ${i <= rv.rating ? 'text-yellow-400' : 'text-gray-300'
                                                    }`}
                                            >
                                                ★
                                            </button>
                                        ))}
                                    </div>

                                    <textarea
                                        rows={3}
                                        className="w-full rounded border p-2 text-sm"
                                        placeholder={`Cảm nhận riêng về ${room.LP_TEN}...`}
                                        value={rv.text}
                                        onChange={e => handleRoomChange(room.CTDP_ID, 'text', e.target.value)}
                                    />

                                    <div className="mt-3">
                                        <ImageUploader
                                            files={rv.files || []}
                                            onChange={newFiles =>
                                                handleRoomChange(room.CTDP_ID, 'files', newFiles)
                                            }
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ----- Footer ----- */}
                <div className="flex justify-end gap-2 pt-3">
                    <button onClick={onClose} className="border px-3 py-1.5 rounded text-sm">
                        Hủy
                    </button>
                    <button
                        disabled={busy}
                        onClick={send}
                        className="bg-rose-600 text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-rose-700"
                    >
                        Gửi đánh giá
                    </button>
                </div>
            </div>
        </Modal>
    );
}
