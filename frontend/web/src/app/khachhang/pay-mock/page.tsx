'use client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export default function PayMockPage() {
    const q = useSearchParams();
    const hdon_ma = q.get('hdon_ma') || '';
    const email = q.get('email') || '';
    const amount = Number(q.get('amount') || 0);
    const ret = '/khachhang/dat-phong/ket-qua';
    const [busy, setBusy] = useState(false);

    const go = async (success: boolean) => {
        try {
            setBusy(true);
            await fetch(`${API_BASE}/public/pay/mock/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ hdon_ma: Number(hdon_ma), success, email }),
            });
            // quay về trang kết quả – trang đó sẽ poll /public/pay/status
            const url = `${ret}${ret.includes('?') ? '&' : '?'}hdon_ma=${encodeURIComponent(hdon_ma)}`;
            window.location.href = url;
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto max-w-md p-6 text-slate-800">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h1 className="text-xl font-bold mb-2">Xác nhận thanh toán</h1>
                <p className="text-sm text-gray-600 mb-4">
                    Hóa đơn #{hdon_ma} – Số tiền cọc: {amount.toLocaleString('vi-VN')} đ
                </p>
                <div className="flex gap-3">
                    <button
                        disabled={busy}
                        onClick={() => go(true)}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        Xác nhận
                    </button>
                    <button
                        disabled={busy}
                        onClick={() => go(false)}
                        className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        Hủy bỏ
                    </button>
                </div>
            </div>
        </div>
    );
}
