'use client';

import { useEffect, useMemo, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import Image from "next/image";
import { useSearchParams } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

/* ================= Helpers ================= */
const absUrl = (u?: string | null) => {
    if (!u) return '';
    return u.startsWith('http') ? u : `${API_BASE}${u}`;
};
const fmtDate = (s?: string | null) => {
    if (!s) return '';
    const d = new Date(s);
    return isNaN(+d) ? '' : d.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
};
const isVideoUrl = (url: string) => /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);

/* ================= Types & normalize ================= */
type Raw = any;
type Media = { url: string; type: 'IMAGE' | 'VIDEO'; note?: string | null };
type Reply = {
    content: string;
    staffName?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    status?: string | null;
    staffAvatar?: string | null;
};

type Review = {
    id: number;
    stars: number;
    title?: string | null;
    content?: string | null;
    createdAt?: string | null;
    customer?: string | null;
    roomName?: string | null;
    medias: Media[];
    contractId?: number | null;
    reply?: Reply | null;
};

function normalize(x: Raw): Review {
    // --- đính kèm ---
    const list =
        (Array.isArray(x?.DINH_KEM_DANH_GIA) ? x.DINH_KEM_DANH_GIA :
            Array.isArray(x?.DINH_KEMS) ? x.DINH_KEMS :
                Array.isArray(x?.dinh_kem) ? x.dinh_kem : []) as any[];

    const medias: Media[] = list
        .map((k) => {
            const url = absUrl(k?.DKDG_URL ?? k?.url ?? '');
            if (!url) return null;
            const loai = (k?.DKDG_LOAI ?? k?.loai ?? '').toString().toUpperCase();
            return {
                url,
                type: (loai === 'VIDEO' || isVideoUrl(url)) ? 'VIDEO' : 'IMAGE',
                note: k?.DKDG_CHUTHICH ?? k?.ghi_chu ?? null
            };
        })
        .filter(Boolean) as Media[];

    // --- phản hồi (BE đã trả REPLY nếu đã PUBLISHED) ---
    const rawReply = x?.REPLY || x?.PHAN_HOI || null;
    let reply: Reply | null = null;
    if (rawReply) {
        const status = rawReply?.PH_TRANG_THAI ?? rawReply?.status ?? null;
        // chỉ hiển thị nếu published (hoặc BE đã lọc sẵn)
        if (!status || status === 'PUBLISHED') {
            const content = rawReply?.PH_NOIDUNG ?? rawReply?.content ?? '';
            if (content?.trim()) {
                reply = {
                    content,
                    staffName: rawReply?.NHAN_VIEN?.NV_HOTEN ?? rawReply?.staffName ?? null,
                    createdAt: rawReply?.PH_TAO_LUC ?? rawReply?.createdAt ?? null,
                    updatedAt: rawReply?.PH_SUA_LUC ?? rawReply?.updatedAt ?? null,
                    status,
                    staffAvatar: (() => {
                        const raw = rawReply?.staffAvatar ?? '';
                        return raw ? absUrl(raw) : null;
                    })(),
                };
            }
        }
    }

    return {
        id: Number(x?.DG_ID ?? x?.DG_MA ?? 0),
        stars: Number(x?.DG_SAO ?? 0),
        title: x?.DG_TIEU_DE ?? null,
        content: x?.DG_NOI_DUNG ?? null,
        createdAt: x?.DG_TAO_LUC ?? null,
        customer: x?.KH_TEN ?? x?.KHACH_HANG?.KH_HOTEN ?? 'Khách ẩn danh',
        roomName: x?.LP_TEN ?? null,
        contractId: x?.HDONG_MA ?? x?.hdong_ma ?? null,
        medias,
        reply, // <-- gắn phản hồi vào review
    };
}


/* ================= Stars ================= */
function Stars({ value = 0, className = '' }: { value?: number; className?: string }) {
    const v = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    return (
        <span className={`inline-flex items-center gap-0.5 text-amber-600 ${className}`}>
            {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={i < v ? 'opacity-100' : 'opacity-30'}>★</span>
            ))}
        </span>
    );
}

/* ================= Page ================= */
export default function PublicReviewsPage() {
    // Filters
    const [stars, setStars] = useState<number | 'all'>('all');
    const [hasText, setHasText] = useState(false);
    const [hasMedia, setHasMedia] = useState(false);
    const [q, setQ] = useState('');
    const [sort, setSort] = useState<'new' | 'old'>('new');

    // Data
    const [items, setItems] = useState<Review[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // Summary (điểm trung bình + đếm theo sao)
    const [avg, setAvg] = useState<number>(0);
    const [counts, setCounts] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    const [withText, setWithText] = useState(0);
    const [withMedia, setWithMedia] = useState(0);

    const take = 10;
    // Lấy hdong_ma từ query
    const search = useSearchParams();
    const focusHd = useMemo(() => Number(search.get('hdong_ma') || 0), [search]);

    // Pinned + hiệu ứng chớp
    const [pinned, setPinned] = useState<Review[]>([]);
    const [flash, setFlash] = useState(false);

    // Để lọc trùng khi render
    const pinnedIds = useMemo(() => new Set(pinned.map(r => r.id)), [pinned]);


    // Build query
    const query = useMemo(() => {
        const p = new URLSearchParams();
        p.set('status', 'PUBLISHED');
        p.set('page', String(page));
        p.set('take', String(take));
        if (stars !== 'all') p.set('stars', String(stars));
        if (hasText) p.set('hasText', '1');
        if (hasMedia) p.set('hasMedia', '1');
        if (q.trim()) p.set('q', q.trim());
        p.set('order', sort === 'new' ? 'desc' : 'asc');
        return p.toString();
    }, [page, take, stars, hasText, hasMedia, q, sort]);



    // Fetch summary (nếu BE chưa có endpoint này thì tự tính từ trang đầu)
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/public/danh-gia/summary?status=PUBLISHED`, { credentials: 'include' });
                if (!r.ok) throw new Error();
                const s = await r.json();
                setAvg(Number(s?.avg ?? 0));
                setCounts({
                    1: Number(s?.byStars?.[1] ?? 0),
                    2: Number(s?.byStars?.[2] ?? 0),
                    3: Number(s?.byStars?.[3] ?? 0),
                    4: Number(s?.byStars?.[4] ?? 0),
                    5: Number(s?.byStars?.[5] ?? 0),
                });
                setWithText(Number(s?.withText ?? 0));
                setWithMedia(Number(s?.withMedia ?? 0));
            } catch {
                // fallback: lấy trang đầu rồi tự tính (độ chính xác vừa đủ)
                (async () => {
                    try {
                        const r = await fetch(`${API_BASE}/public/danh-gia?status=PUBLISHED&page=1&take=${take}`, { credentials: 'include' });
                        const j = await r.json();
                        const list: Review[] = (Array.isArray(j?.items) ? j.items : j).map(normalize);
                        const cs: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                        let sum = 0, n = 0, t = 0, m = 0;
                        list.forEach((rv) => {
                            const s = Math.round(rv.stars || 0) as 1 | 2 | 3 | 4 | 5;
                            if (s >= 1 && s <= 5) cs[s] += 1;
                            sum += rv.stars || 0; n += 1;
                            if (rv.content?.trim()) t += 1;
                            if (rv.medias?.length) m += 1;
                        });
                        setAvg(n ? +(sum / n).toFixed(1) : 0);
                        setCounts(cs); setWithText(t); setWithMedia(m);
                    } catch { /* bỏ qua */ }
                })();
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        let alive = true;
        if (!focusHd) { setPinned([]); return; }

        (async () => {
            try {
                const r = await fetch(
                    `${API_BASE}/public/danh-gia?status=PUBLISHED&hdong_ma=${focusHd}&page=1&take=20`,
                    { credentials: 'include' }
                );
                const j = await r.json();
                const raw = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
                const list = raw.map(normalize);
                if (!alive) return;

                setPinned(list);
                setFlash(true);
                setTimeout(() => setFlash(false), 1100); // chớp 1 lần
            } catch {
                if (alive) setPinned([]);
            }
        })();

        return () => { alive = false; };
    }, [focusHd]);

    // Fetch list
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true); setErr(null);
                const r = await fetch(`${API_BASE}/public/danh-gia?${query}`, { credentials: 'include' });
                const j = await r.json();
                const raw = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
                const total: number | undefined = Array.isArray(j?.items) ? Number(j?.total ?? 0) : undefined;

                const list = raw.map(normalize);
                if (!alive) return;
                setItems(list);
                setHasMore(total !== undefined ? page * take < total : list.length === take);
            } catch {
                if (!alive) return;
                setErr('Không tải được danh sách đánh giá.');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [query, page, take]);

    // Load more
    async function loadMore() {
        const next = page + 1;
        const p = new URLSearchParams(query);
        p.set('page', String(next));
        try {
            setLoading(true);
            const r = await fetch(`${API_BASE}/public/danh-gia?${p.toString()}`, { credentials: 'include' });
            const j = await r.json();
            const raw = Array.isArray(j) ? j : (Array.isArray(j?.items) ? j.items : []);
            const total: number | undefined = Array.isArray(j?.items) ? Number(j?.total ?? 0) : undefined;
            const list = raw.map(normalize);
            setItems(prev => [...prev, ...list]);
            setPage(next);
            setHasMore(total !== undefined ? next * take < total : list.length === take);
        } finally { setLoading(false); }
    }

    // Lightbox
    const [lbOpen, setLbOpen] = useState(false);
    const [lbSlides, setLbSlides] = useState<{ src: string }[]>([]);
    const [lbIndex, setLbIndex] = useState(0);

    const startLightbox = (medias: Media[], index: number) => {
        const slides = medias.filter(m => m.type === 'IMAGE').map(m => ({ src: m.url }));
        const imgIndex = medias
            .slice(0, index + 1)
            .filter(m => m.type === 'IMAGE')
            .length - 1;
        setLbSlides(slides);
        setLbIndex(Math.max(0, imgIndex));
        if (slides.length) setLbOpen(true);
    };

    // Reset trang khi đổi filter
    const resetAndApply = () => setPage(1);

    return (
        <div className="mx-auto max-w-7xl px-4 py-10 text-slate-800">
            {/* Header + Summary */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="text-4xl font-bold text-amber-600">{avg.toFixed(1)}</div>
                        <div className="text-slate-700">
                            <div className="text-sm">trên 5</div>
                            <Stars value={avg} className="text-xl" />
                        </div>
                    </div>

                    {/* Chips lọc sao */}
                    <div className="flex flex-wrap items-center gap-2">
                        {(['all', 5, 4, 3, 2, 1] as const).map((s) => (
                            <button
                                key={String(s)}
                                onClick={() => { setStars(s); resetAndApply(); }}
                                className={
                                    `rounded-md border px-3 py-1.5 text-sm ` +
                                    (stars === s ? 'border-amber-600 bg-white font-semibold' : 'border-amber-200 bg-white/70')
                                }
                            >
                                {s === 'all' ? 'Tất Cả' : `${s} Sao (${counts[s] ?? 0})`}
                            </button>
                        ))}
                    </div>

                    {/* Chips khác */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => { setHasText(v => !v); resetAndApply(); }}
                            className={`rounded-md border px-3 py-1.5 text-sm ${hasText ? 'border-amber-600 bg-white font-semibold' : 'border-amber-200 bg-white/70'}`}
                        >
                            Có Bình Luận ({withText})
                        </button>
                        <button
                            onClick={() => { setHasMedia(v => !v); resetAndApply(); }}
                            className={`rounded-md border px-3 py-1.5 text-sm ${hasMedia ? 'border-amber-600 bg-white font-semibold' : 'border-amber-200 bg-white/70'}`}
                        >
                            Có Hình Ảnh / Video ({withMedia})
                        </button>
                    </div>
                </div>

                {/* Search + sort */}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <input
                        value={q}
                        onChange={(e) => { setQ(e.target.value); resetAndApply(); }}
                        placeholder="Tìm theo tiêu đề / nội dung…"
                        className="min-w-[260px] flex-1 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <select
                        value={sort}
                        onChange={(e) => { setSort(e.target.value as 'new' | 'old'); resetAndApply(); }}
                        className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
                    >
                        <option value="new">Mới nhất</option>
                        <option value="old">Cũ nhất</option>
                    </select>
                </div>
            </div>

            {/* Danh sách review */}
            <div className="mt-6 space-y-6">
                {err && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
                        {err}
                    </div>
                )}

                {(loading && items.length === 0) &&
                    Array.from({ length: 4 }).map((_, i) =>
                        <div key={i} className="h-40 animate-pulse rounded-lg bg-amber-50" />
                    )
                }
                {pinned.length > 0 && (
                    <div className="space-y-6">
                        {pinned.map((rv) => (
                            <article
                                key={`pin-${rv.id}`}
                                className={`rounded-xl border border-amber-100 bg-white p-4 ${flash ? 'flash-once' : ''}`}
                            >
                                {/* Header người dùng */}
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 overflow-hidden rounded-full bg-amber-100">
                                        <Image width={80} height={80} src="/images/user/user-03.jpg" alt="user" />
                                    </div>
                                    <div>
                                        <div className="font-semibold">{rv.customer || 'Khách ẩn danh'}</div>
                                        <Stars value={rv.stars} />
                                    </div>
                                    <div className="ml-auto text-xs text-slate-500">{fmtDate(rv.createdAt)}</div>
                                </div>

                                {/* Nội dung */}
                                {rv.title && <div className="mt-2 font-medium">{rv.title}</div>}
                                {rv.content && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{rv.content}</p>}
                                {rv.roomName && <div className="mt-1 text-xs text-slate-500">Loại phòng: {rv.roomName}</div>}

                                {/* Media */}
                                {!!rv.medias?.length && (
                                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                                        {rv.medias.map((m, i) => (
                                            <div
                                                key={i}
                                                className="relative aspect-square cursor-pointer overflow-hidden rounded-md bg-amber-50"
                                                onClick={() => startLightbox(rv.medias, i)}
                                                title={m.note || undefined}
                                            >
                                                {m.type === 'IMAGE' ? (
                                                    <img src={m.url} alt="" className="h-full w-full object-cover transition-transform duration-200 hover:scale-105" />
                                                ) : (
                                                    <>
                                                        <video src={m.url} className="h-full w-full object-cover" muted />
                                                        <div className="absolute inset-0 grid place-items-center">
                                                            <div className="rounded-full bg-black/60 px-2 py-1 text-xs text-white">▶ Video</div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {/* Reply của nhân viên (nếu có) */}
                                {/* Reply của nhân viên (nếu có) */}
                                {rv.reply && (
                                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 overflow-hidden rounded-full bg-emerald-100">
                                                <Image
                                                    width={50}
                                                    height={50}
                                                    src={rv.reply.staffAvatar || "/images/logo/logo-icon-1.png"}
                                                    alt="staff"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold truncate">
                                                    Phản hồi từ {rv.reply.staffName || "nhân viên khách sạn"}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {fmtDate(rv.reply.createdAt)}
                                                </div>
                                            </div>
                                        </div>

                                        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-sm">
                                            {rv.reply.content}
                                        </p>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                )}

                {items.filter(rv => !pinnedIds.has(rv.id)).map((rv) => (
                    <article key={rv.id} className="rounded-xl border border-amber-100 bg-white p-4">
                        {/* Header người dùng */}
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 overflow-hidden rounded-full bg-amber-100">
                                <Image width={80} height={80} src="/images/user/user-03.jpg" alt="user" />
                            </div>
                            <div>
                                <div className="font-semibold">{rv.customer || 'Khách ẩn danh'}</div>
                                <Stars value={rv.stars} />
                            </div>
                            <div className="ml-auto text-xs text-slate-500">{fmtDate(rv.createdAt)}</div>
                        </div>

                        {/* Nội dung */}
                        {rv.title && <div className="mt-2 font-medium">{rv.title}</div>}
                        {rv.content && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{rv.content}</p>}
                        {rv.roomName && <div className="mt-1 text-xs text-slate-500">Loại phòng: {rv.roomName}</div>}

                        {/* Media */}
                        {!!rv.medias?.length && (
                            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                                {rv.medias.map((m, i) => (
                                    <div
                                        key={i}
                                        className="relative aspect-square cursor-pointer overflow-hidden rounded-md bg-amber-50"
                                        onClick={() => startLightbox(rv.medias, i)}
                                        title={m.note || undefined}
                                    >
                                        {m.type === 'IMAGE' ? (
                                            <img src={m.url} alt="" className="h-full w-full object-cover transition-transform duration-200 hover:scale-105" />
                                        ) : (
                                            <>
                                                <video src={m.url} className="h-full w-full object-cover" muted />
                                                <div className="absolute inset-0 grid place-items-center">
                                                    <div className="rounded-full bg-black/60 px-2 py-1 text-xs text-white">▶ Video</div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Reply của nhân viên (nếu có) */}
                        {/* Reply của nhân viên (nếu có) */}
                        {rv.reply && (
                            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 overflow-hidden rounded-full bg-emerald-100">
                                        <Image
                                            width={50}
                                            height={50}
                                            src={rv.reply.staffAvatar || "/images/logo/logo-icon-1.png"}
                                            alt="staff"
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold truncate">
                                            Phản hồi từ {rv.reply.staffName || "nhân viên khách sạn"}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {fmtDate(rv.reply.createdAt)}
                                        </div>
                                    </div>
                                </div>

                                <p className="mt-2 whitespace-pre-wrap leading-relaxed text-sm">
                                    {rv.reply.content}
                                </p>
                            </div>
                        )}


                    </article>
                ))}


                {/* Load more */}
                <div className="flex justify-center pt-2">
                    {hasMore ? (
                        <button
                            onClick={loadMore}
                            disabled={loading}
                            className="rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                            {loading ? 'Đang tải…' : 'Xem thêm'}
                        </button>
                    ) : (
                        <div className="text-sm text-slate-500">Đã hiển thị hết đánh giá.</div>
                    )}
                </div>
            </div>

            {/* Lightbox ảnh */}
            <Lightbox open={lbOpen} close={() => setLbOpen(false)} index={lbIndex} slides={lbSlides} />
            <style jsx global>{`
  @keyframes flashOnce {
    0%   { background-color: rgba(251,191,36,.25); box-shadow: 0 0 0 4px rgba(251,191,36,.25); }
    100% { background-color: transparent;            box-shadow: none; }
  }
  .flash-once { animation: flashOnce 1.1s ease-out 1; }
`}</style>

        </div>
    );
}
