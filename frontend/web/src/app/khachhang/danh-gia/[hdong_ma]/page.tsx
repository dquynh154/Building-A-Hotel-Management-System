'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ReviewDetailPage() {
    const params = useSearchParams();
    const id = Number(params.get('hdong_ma'));
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
        fetch(`${BASE}/public/khachhang/review-detail?hdong_ma=${id}`)
            .then(res => res.json())
            .then(setData)
            .catch(console.error);
    }, [id]);

    if (!data) return <div className="p-6">Đang tải...</div>;
    return (
        <div className="p-6 space-y-4">
            <h1 className="text-xl font-bold text-slate-800">Đánh giá của bạn</h1>
            <div>
                <h2 className="font-semibold text-slate-700">Tổng thể</h2>
                <p>{data.overall?.DG_TIEU_DE}</p>
                <p>{data.overall?.DG_NOI_DUNG}</p>
            </div>
            {data.rooms?.length > 0 && (
                <div>
                    <h2 className="font-semibold text-slate-700">Các phòng</h2>
                    {data.rooms.map((r: any) => (
                        <div key={r.CTDP_ID} className="border p-3 rounded mt-2">
                            <b>{r.LP_TEN}</b> – {r.DG_SAO}★<br />
                            {r.DG_NOI_DUNG}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
