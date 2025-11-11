'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

type Overall = {
    DG_MA: number;
    DG_SAO: number;
    DG_TIEU_DE?: string | null;
    DG_NOI_DUNG?: string | null;
    DG_TAO_LUC?: string | null;
};

type RoomReview = {
    CTDP_ID: number;
    DG_SAO: number;
    DG_TIEU_DE?: string | null;
    DG_NOI_DUNG?: string | null;
    DG_TAO_LUC?: string | null;
    LP_MA?: number | null;
    LP_TEN?: string | null;
};

type ApiRes = { overall: Overall | null; rooms: RoomReview[] };

function Stars({ value = 0 }: { value?: number }) {
    const v = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    return (
        <div className="inline-flex items-center gap-0.5 text-amber-600">
            {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={i < v ? 'opacity-100' : 'opacity-30'}>
                    ★
                </span>
            ))}
        </div>
    );
}

function fmtDate(s?: string | null) {
    if (!s) return '';
    const d = new Date(s);
    return isNaN(+d) ? '' : d.toLocaleString('vi-VN', { dateStyle: 'medium' });
}

export default function ReviewDetailPage() {
    const route = useParams();
    const search = useSearchParams();

    // Ưu tiên param từ segment /danh-gia/[hdong_ma], fallback query
    const seg = route?.hdong_ma as string | string[] | undefined;
    const idFromPath = Array.isArray(seg) ? Number(seg[0]) : Number(seg);
    const idFromQuery = Number(search.get('hdong_ma'));
    const hdong_ma = useMemo(
        () => (Number.isFinite(idFromPath) && idFromPath > 0 ? idFromPath : (Number.isFinite(idFromQuery) ? idFromQuery : 0)),
        [idFromPath, idFromQuery],
    );

    const [data, setData] = useState<ApiRes | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!hdong_ma) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        fetch(`${API_BASE}/public/khachhang/review-detail?hdong_ma=${hdong_ma}`, {
            credentials: 'include',
        })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((j: any) => {
                setData({
                    overall: j?.overall ?? null,
                    rooms: Array.isArray(j?.rooms) ? j.rooms : [],
                });
            })
            .catch(() => setError('Không tải được dữ liệu đánh giá.'))
            .finally(() => setLoading(false));
    }, [hdong_ma]);

    if (!hdong_ma) {
        return (
            <div className="mx-auto max-w-6xl px-4 py-8">
                <div className="rounded-lg border bg-white p-6 text-slate-700">
                    Thiếu mã hợp đồng. Vui lòng quay lại trang quản lý đơn để mở đúng liên kết.
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl px-4 py-8 text-slate-800">
            <header className="mb-6">
                <h1 className="text-2xl font-bold">Đánh giá của bạn</h1>
                <div className="mt-1 text-sm text-slate-500">Hợp đồng #{hdong_ma}</div>
            </header>

            {loading && (
                <div className="space-y-3">
                    <div className="h-24 animate-pulse rounded-lg bg-amber-50" />
                    <div className="h-36 animate-pulse rounded-lg bg-amber-50" />
                </div>
            )}

            {!loading && error && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
                    {error}
                </div>
            )}

            {!loading && !error && data && (
                <div className="space-y-8">
                    {/* Tổng thể */}
                    <section className="rounded-xl border border-amber-100 bg-white p-6">
                        <h2 className="mb-2 text-lg font-semibold text-slate-800">Tổng thể</h2>

                        {!data.overall ? (
                            <div className="text-slate-600">Chưa có đánh giá tổng thể cho hợp đồng này.</div>
                        ) : (
                            <div>
                                <Stars value={data.overall.DG_SAO} />
                                {data.overall.DG_TIEU_DE && (
                                    <div className="mt-2 text-base font-medium">{data.overall.DG_TIEU_DE}</div>
                                )}
                                {data.overall.DG_NOI_DUNG && (
                                    <p
                                        className="mt-1 text-slate-700 leading-relaxed overflow-hidden [display:-webkit-box] [-webkit-line-clamp:6] [-webkit-box-orient:vertical]"
                                        title={data.overall.DG_NOI_DUNG || undefined}
                                    >
                                        {data.overall.DG_NOI_DUNG}
                                    </p>
                                )}
                                <div className="mt-2 text-xs text-slate-500">{fmtDate(data.overall.DG_TAO_LUC)}</div>
                            </div>
                        )}
                    </section>

                    {/* Theo phòng */}
                    <section className="rounded-xl border border-amber-100 bg-white p-6">
                        <h2 className="mb-4 text-lg font-semibold text-slate-800">Các phòng</h2>

                        {(!data.rooms || data.rooms.length === 0) ? (
                            <div className="text-slate-600">Chưa có đánh giá theo từng phòng.</div>
                        ) : (
                            <div className="space-y-4">
                                {data.rooms.map((rv) => (
                                    <div key={rv.CTDP_ID} className="rounded-lg border border-amber-100 bg-amber-50/30 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="font-semibold">
                                                {rv.LP_TEN || 'Loại phòng'} {rv.LP_MA ? `(LP ${rv.LP_MA})` : ''}
                                            </div>
                                            <Stars value={rv.DG_SAO} />
                                        </div>
                                        {rv.DG_TIEU_DE && <div className="mt-1 font-medium">{rv.DG_TIEU_DE}</div>}
                                        {rv.DG_NOI_DUNG && (
                                            <p
                                                className="mt-1 text-slate-700 leading-relaxed overflow-hidden [display:-webkit-box] [-webkit-line-clamp:6] [-webkit-box-orient:vertical]"
                                                title={rv.DG_NOI_DUNG || undefined}
                                            >
                                                {rv.DG_NOI_DUNG}
                                            </p>
                                        )}
                                        <div className="mt-2 text-xs text-slate-500">{fmtDate(rv.DG_TAO_LUC)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Nếu hoàn toàn chưa có gì */}
                    {!data.overall && (!data.rooms || data.rooms.length === 0) && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
                            Bạn chưa gửi đánh giá nào cho hợp đồng này.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
