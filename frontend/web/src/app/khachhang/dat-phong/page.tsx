'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import DatePicker from '@/components/form/date-picker';
import Lightbox from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

type RoomLite = {
    LP_MA: number;
    LP_TEN: string;
    LP_SONGUOI: number;
    LP_TRANGTHAI?: string;
    ROOM_COUNT?: number;
    IMG_URL?: string | null;
    LOAI_PHONG_IMAGE?: { URL: string | null }[] | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const absUrl = (u?: string | { URL?: string | null } | null) => {
    if (!u) return "";
    const url = typeof u === "string" ? u : u.URL || "";
    return url.startsWith("http") ? url : `${API_BASE}${url}`;
};


const fmtVND = (n: number) => (n ?? 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
const diffDays = (a: string, b: string) => {
    const da = new Date(a), db = new Date(b);
    return Math.max(1, Math.ceil((+db - +da) / 86400000));
};


const parseISODate = (s: string | null) => {
    if (!s) return null;
    // hỗ trợ "YYYY-MM-DD" hoặc "DD/MM/YYYY"
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00');
    const m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const d = new Date(s);
    return isNaN(+d) ? null : d;
};

const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseYMD = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};

const ddmmyyyy = (s: string) => {
    const d = parseYMD(s);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function DatPhongPage() {
    const q = useSearchParams();
    const router = useRouter();
    const params = useSearchParams();

    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    // lấy từ query (YYYY-MM-DD) hoặc fallback hôm nay/mai
    const [from, setFrom] = useState<string>(params.get('from') || ymd(today));
    const [to, setTo] = useState<string>(params.get('to') || ymd(tomorrow));

    const adults = Number(q.get('adults') || 1);
    const [adultsDraft, setAdultsDraft] = useState(adults);
    const [guestOpen, setGuestOpen] = useState(false);

    const fromDate = parseYMD(from);
    const toDate = parseYMD(to);
    const nights = Math.max(1, Math.ceil((+toDate - +fromDate) / 86400000));

    const [loading, setLoading] = useState(true);
    const [rooms, setRooms] = useState<RoomLite[]>([]);
    const [err, setErr] = useState<string | null>(null);

    const [openLightbox, setOpenLightbox] = useState(false);
    const [photos, setPhotos] = useState<{ src: string }[]>([]);
    const [photoIndex, setPhotoIndex] = useState(0);

    useEffect(() => {
        if (guestOpen) setAdultsDraft(adults);
    }, [guestOpen, adults]);

    const handleRangeChange = useCallback((selectedDates: any[]) => {
        const [d1, d2] = selectedDates as Date[];
        const el = document.getElementById('dp-range') as any;
        const fp = el?._flatpickr;

        // Mới chọn ngày đầu: giữ lịch mở, KHÔNG setFrom (tránh re-render)
        if (d1 && !d2) {
            fp?.open();
            return;
        }

        // Có đủ 2 ngày: cập nhật state + URL, rồi mới đóng
        if (d1 && d2) {
            const nf = ymd(d1);
            const nt = ymd(d2);
            setFrom(nf);
            setTo(nt);

            const next = new URLSearchParams(params.toString());
            next.set('from', nf);
            next.set('to', nt);
            router.replace(`?${next.toString()}`);

            fp?.close();
        }
    }, [params, router]);


    // ▼ THAY effect cũ bằng đoạn này
    useEffect(() => {
        const t = setTimeout(() => {
            const el = document.getElementById('dp-range') as any;
            const fp = el?._flatpickr;
            if (!fp) return;

            // giống y như trang khachhang/page
            fp.set('mode', 'range');
            fp.set('minDate', 'today');    // chặn quá khứ
            fp.set('dateFormat', 'd-m-Y'); // hiển thị dd-mm-yyyy
            fp.setDate([parseYMD(from), parseYMD(to)], true); // đồng bộ ngày đã chọn từ query
        }, 0);
        return () => clearTimeout(t);
    }, [from, to]);


    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true); setErr(null);
                const url = `${API_BASE}/public/loai-phong-trong?from=${from}&to=${to}&adults=${adults}&take=50&includeEmpty=true`;
                const res = await fetch(url, { credentials: 'include' });
                const json = await res.json();
                const items = Array.isArray(json?.items) ? json.items : [];
                if (mounted) setRooms(items);
            } catch { if (mounted) setErr('Không tải được danh sách phòng.'); }
            finally { if (mounted) setLoading(false); }
        })();
        return () => { mounted = false; };
    }, [from, to, adults]);


    // ▼ LƯU PHÒNG ĐÃ CHỌN
    const [selection, setSelection] = useState<null | {
        id: number; name: string; nightly: number; nights: number; total: number;
    }>(null);

    // khi đổi ngày → cập nhật lại tổng tiền
    useEffect(() => {
        setSelection(s => s ? { ...s, nights, total: s.nightly * nights } : s);
    }, [from, to]); // nights đổi theo from/to

    // handler bấm "Chọn"
    const onChoose = (r: any) => {
        const nightly = Number(r?.PRICE ?? 0);
        setSelection({
            id: Number(r.LP_MA),
            name: String(r.LP_TEN || ''),
            nightly,
            nights,
            total: nightly * nights,
        });
    };
    // ▼ Giỏ phòng đã chọn (key = LP_MA)
    type BasketItem = { id: number; name: string; nightly: number; qty: number };
    type Basket = Record<number, BasketItem>;
    const [basket, setBasket] = useState<Basket>({});

    // Tính tổng
    const basketItems = Object.values(basket);
    const basketCount = basketItems.reduce((s, x) => s + x.qty, 0);
    const basketTotal = basketItems.reduce((s, x) => s + x.nightly * x.qty * nights, 0);
    // encode giỏ: "LPMA:qty,LPMA:qty"
    const encodeSel = (items: { id: number; qty: number }[]) =>
        items.map(it => `${it.id}:${it.qty}`).join(',');

    const onNext = () => {
        const items = Object.values(basket);
        if (!items.length) return;
        const sel = encodeSel(items); // ví dụ "37:2,1:1"
        const qs = new URLSearchParams({
            from,
            to,
            adults: String(adults),     // adults đang đọc từ URL
            sel,
        }).toString();
        router.push(`/khachhang/dat-phong/thong-tin?${qs}`);
    };

    // Handlers
    const addRoom = (r: any) => {
        const id = Number(r.LP_MA);
        const nightly = Number(r?.PRICE ?? 0);
        const name = String(r?.LP_TEN ?? '');
        setBasket(prev => ({ ...prev, [id]: { id, name, nightly, qty: (prev[id]?.qty ?? 0) + 1 } }));
    };
    const incQty = (id: number) => setBasket(prev => ({ ...prev, [id]: { ...prev[id], qty: prev[id].qty + 1 } }));
    const decQty = (id: number) => setBasket(prev => {
        const cur = prev[id]; if (!cur) return prev;
        const q = cur.qty - 1;
        if (q <= 0) { const { [id]: _, ...rest } = prev; return rest; }
        return { ...prev, [id]: { ...cur, qty: q } };
    });

    // +1 nhưng không vượt quá max (ROOM_COUNT)
    const addRoomLimited = (r: any, max: number) => {
        const id = Number(r.LP_MA);
        const nightly = Number(r?.PRICE ?? 0);
        const name = String(r?.LP_TEN ?? '');
        setBasket(prev => {
            const cur = prev[id]?.qty ?? 0;
            if (cur >= max) return prev;
            return { ...prev, [id]: { id, name, nightly, qty: cur + 1 } };
        });
    };

    const incQtyLimited = (id: number, max: number) => {
        setBasket(prev => {
            const cur = prev[id];
            if (!cur || cur.qty >= max) return prev;
            return { ...prev, [id]: { ...cur, qty: cur.qty + 1 } };
        });
    };

    // Khi đổi ngày → cập nhật lại tổng theo số đêm
    useEffect(() => {
        setBasket(prev => {
            const next: Basket = {};
            for (const [k, v] of Object.entries(prev)) next[Number(k)] = { ...v }; // giữ nguyên nightly, qty
            return next;
        });
    }, [from, to]);

    // Khi thay đổi tham số lọc ⇒ xoá giỏ/selection
    useEffect(() => {
        setBasket({});          // xoá toàn bộ các phòng đã chọn (stepper về nút "Chọn")
        // setSelection(null);   // nếu bạn còn dùng selection đơn, bỏ comment để xoá luôn
    }, [from, to, adults]);    // 👈 đổi ngày hoặc số người là reset



    return (
        <div className="mx-auto max-w-7xl px-4 py-6 text-slate-800">

            {/* Thanh tóm tắt trên cùng */}
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-white px-4 py-3">
                    <div className="text-xs text-gray-500 font-medium">Nhận phòng và trả phòng</div>
                    {/* <div className="mt-1 flex items-center gap-2 text-sm font-semibold"> */}
                    <div className="mt-2 flex items-center gap-3">
                        <div className="w-full md:w-80">
                            <DatePicker
                                id="dp-range"
                                mode="range"
                                defaultDate={[parseYMD(from), parseYMD(to)]}        // HIỂN THỊ ngày đã chọn
                                onChange={handleRangeChange}
                                placeholder={`${from.split('-').reverse().join('-')} đến ${to.split('-').reverse().join('-')}`}
                            />
                        </div>
                    </div>
                    {/* </div> */}
                </div>
                <div className="relative rounded-lg border bg-white px-4 py-3">
                    <div className="text-xs text-gray-500 font-medium">Khách</div>

                    <button
                        type="button"
                        onClick={() => setGuestOpen((v) => !v)}
                        className="mt-1 w-full text-left text-xl font-semibold"
                    >
                        {adults} người
                    </button>

                    {guestOpen && (
                        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border bg-white p-4 shadow-xl">
                            <div className="mb-3 text-sm font-semibold">Số khách</div>

                            <div className="flex items-center justify-between rounded-md bg-rose-50 px-3 py-2">
                                <span className="text-sm text-rose-900">Người</span>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        // onClick={() => setAdults((n) => Math.max(1, n - 1))}
                                        onClick={() => setAdultsDraft(n => Math.max(1, n - 1))}
                                        className="h-8 w-8 rounded-md bg-rose-200 text-rose-900"
                                    >
                                        –
                                    </button>
                                    <span className="w-8 text-center font-semibold">{adultsDraft}</span>
                                    <button
                                        type="button"
                                        // onClick={() => setAdults((n) => Math.min(10, n + 1))}
                                        onClick={() => setAdultsDraft(n => Math.min(10, n + 1))}
                                        className="h-8 w-8 rounded-md bg-rose-600 text-white"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setGuestOpen(false)}
                                    className="rounded-md px-4 py-2 text-sm"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const next = new URLSearchParams(q.toString());
                                        next.set('adults', String(adultsDraft)); // cập nhật URL để refetch
                                        // nếu bạn vẫn đang dùng children ở BE, giữ nguyên giá trị cũ trong query
                                        router.replace(`?${next.toString()}`);
                                        setGuestOpen(false);
                                    }}
                                    className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                                >
                                    Hoàn tất
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-2xl border bg-white p-6 md:p-8">
                <div className="relative flex justify-center items-center border-b-4 border-rose-200 pb-3 mb-8">
                    <h2 className="text-lg md:text-2xl font-semibold text-slate-800">
                        Chọn phòng
                    </h2>
                    <span className="absolute bottom-[-4px] left-0 h-[4px] w-1/3 bg-rose-700"></span>
                    {/* <span className="absolute bottom-[-2px] left-1/2 h-[3px] w-1/3 -translate-x-1/2 bg-rose-600 rounded-full"></span> */}
                </div>


                <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-12">
                    {/* Danh sách phòng */}
                    <div className="space-y-6 md:col-span-8">
                        {loading && (
                            <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">Đang tải phòng…</div>
                        )}
                        {err && <div className="rounded-xl border bg-white p-6 text-sm text-red-600">{err}</div>}

                        {!loading && !err && rooms.length === 0 && (
                            <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">
                                Không tìm thấy loại phòng phù hợp.
                            </div>
                        )}

                        {rooms.map((r) => {
                            const price = Number((r as any).PRICE ?? 0);

                            const imgSrc = absUrl(r.IMG_URL) || '/images/hero/hero-2.jpg';
                            const nights = diffDays(from, to);
                            const total = price * nights;
                            return (
                                <div key={r.LP_MA} className="overflow-hidden rounded-xl border border-rose-100 bg-white shadow-sm">
                                    {/* --- Hàng đầu tiên: Ảnh + Thông tin --- */}
                                    <div className="flex flex-row gap-5 p-4">
                                        {/* Ảnh nhỏ bên trái */}
                                        {/* <div className="relative min-w-[280px] max-w-[300px] h-[230px] rounded-md overflow-hidden">
                                            <img
                                                src={absUrl(r.IMG_URL) || '/images/hero/hero-2.jpg'}
                                                alt={r.LP_TEN}
                                                className="w-full h-full object-cover"
                                            />

                                        </div> */}
                                        <div
                                            className="relative w-[300px] h-[230px]  rounded-md overflow-hidden cursor-pointer"
                                            onClick={() => {
                                                // chuẩn bị danh sách ảnh
                                                const imgs = (r.LOAI_PHONG_IMAGE ?? [])
                                                    .map((i: any) => ({ src: absUrl(i.URL) }))
                                                    .filter(i => i.src);
                                                // fallback: nếu chưa có mảng ảnh riêng thì dùng ảnh chính
                                                setPhotos(imgs.length ? imgs : [{ src: absUrl(r.IMG_URL) }]);
                                                setPhotoIndex(0);
                                                setOpenLightbox(true);
                                            }}
                                        >
                                            <img
                                                src={absUrl(r.IMG_URL) || '/images/hero/hero-2.jpg'}
                                                alt={r.LP_TEN}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute top-2 left-2 bg-rose-600 text-white text-[11px] px-2 py-0.5 rounded">
                                                Bestseller
                                            </div>
                                        </div>

                                        {/* Thông tin bên phải */}
                                        <div className="flex flex-col justify-start flex-1">
                                            <div className="flex items-start justify-between mb-1">
                                                <h3 className="text-base font-semibold text-rose-700">{r.LP_TEN}</h3>
                                                <div className="text-xs text-gray-500">Tối đa {r.LP_SONGUOI} khách</div>
                                            </div>

                                            <div className="flex flex-wrap gap-2 text-xs mb-2">
                                                <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5">🐾 Cho phép thú cưng</span>
                                                <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5">📺 Smart TV</span>
                                                <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5">🧊 Tủ lạnh mini</span>
                                                <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5">🚭 Không hút thuốc</span>
                                                <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-200 px-2 py-0.5">🛏️ Giường Queen size</span>
                                            </div>

                                            <p className="text-[13px] text-gray-600 leading-snug">
                                                Phòng tiêu chuẩn ấm cúng, thiết kế hiện đại. Phù hợp khách công tác hoặc cặp đôi.
                                            </p>

                                            <div className="mt-3">
                                                <button className="border border-rose-300 text-rose-600 text-xs rounded-full px-3 py-1 hover:bg-rose-50">
                                                    Hiển thị thêm
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* --- Gói giá (phía dưới) --- */}
                                    <div className="border-t border-rose-100 bg-rose-50/20 p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                                        <div className="text-xs text-gray-600">

                                            <ul className="space-y-1">
                                                <li>🍳 Đã bao gồm ăn sáng</li>

                                                <li>❌ Không hoàn cọc</li>
                                            </ul>
                                        </div>

                                        {/* Giá + nút */}
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                {/* Giá gốc */}
                                                {/* <div className="text-xs line-through opacity-50">{fmtVND(price * 1.1)}</div> */}
                                                <div className="text-lg font-bold text-rose-600">{fmtVND(price * nights)}</div>
                                                <div className="text-xs text-gray-500">Giá dành cho {nights} đêm</div>
                                            </div>

                                            {/* Nút chọn / hết phòng */}
                                            {(() => {
                                                const available = Number((r as any).ROOM_COUNT ?? 0);
                                                const qty = basket[r.LP_MA]?.qty ?? 0;
                                                const canInc = qty < available;

                                                return qty ? (
                                                    <div className="flex items-center overflow-hidden rounded-md">
                                                        <button
                                                            type="button"
                                                            onClick={() => decQty(r.LP_MA)}
                                                            className="h-10 w-10 bg-rose-100 text-rose-700 font-bold"
                                                        >−</button>

                                                        <div className="h-10 min-w-[48px] bg-rose-50 flex items-center justify-center text-rose-700 font-semibold">
                                                            {qty}
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => incQtyLimited(r.LP_MA, available)}
                                                            disabled={!canInc}
                                                            className="h-10 w-10 bg-rose-100 text-rose-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >+</button>
                                                    </div>
                                                ) : available <= 0 ? (
                                                    <div className="text-sm font-semibold text-gray-400 select-none">
                                                        Đã hết phòng
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => addRoomLimited(r, available)}
                                                        className="h-10 rounded-md bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700"
                                                    >
                                                        Chọn
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            );

                        })}
                    </div>

                    {/* Đơn đặt phòng của tôi */}
                    <aside className="md:col-span-4 rounded-xl border bg-white p-5 shadow-sm md:sticky md:top-24 md:h-max self-start">
                        <div className="mb-3 text-base font-semibold">Đơn đặt phòng của tôi</div>

                        <div className="overflow-hidden rounded-lg border text-sm">
                            {/* thanh hồng hiển thị số đêm */}
                            <div className="bg-rose-50 px-3 py-2 font-semibold">{nights} đêm</div>

                            {/* 2 cột ngày vào / ra */}
                            <div className="grid grid-cols-2 gap-2 px-3 py-3">
                                <div>
                                    <div className="text-lg font-bold">
                                        {fromDate.getDate()} tháng {fromDate.getMonth() + 1}
                                    </div>
                                    <div className="text-xs text-gray-500 capitalize">
                                        {fromDate.toLocaleDateString('vi-VN', { weekday: 'long' })}
                                    </div>
                                    <div className="text-xs text-gray-500">từ lúc 14:00</div>
                                </div>

                                <div className="text-right">
                                    <div className="text-lg font-bold">
                                        {toDate.getDate()} tháng {toDate.getMonth() + 1}
                                    </div>
                                    <div className="text-xs text-gray-500 capitalize">
                                        {toDate.toLocaleDateString('vi-VN', { weekday: 'long' })}
                                    </div>
                                    <div className="text-xs text-gray-500">đến 12:00</div>
                                </div>
                            </div>
                        </div>
                        {basketItems.length > 0 && (
                            <div className="mt-4 overflow-hidden rounded-lg border">
                                <div className="divide-y">
                                    {basketItems.map(it => (
                                        <div key={it.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                            <div>
                                                <div className="font-semibold text-rose-700">{it.name}</div>
                                                <div className="text-xs text-gray-500">{fmtVND(it.nightly)}/đêm × {nights} đêm × {it.qty} phòng</div>
                                            </div>
                                            <div className="font-semibold">{fmtVND(it.nightly * nights * it.qty)}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between bg-rose-50 px-3 py-3">
                                    <div className="text-sm font-medium">Tạm tính ({basketCount} phòng)</div>
                                    <div className="text-lg font-bold text-rose-700">{fmtVND(basketTotal)}</div>
                                </div>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={onNext}
                            disabled={basketItems.length === 0}
                            className="mt-4 w-full h-12 rounded-md bg-rose-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Tiếp theo
                        </button>

                    </aside>
                </div>
            </div>
            <Lightbox
                open={openLightbox}
                close={() => setOpenLightbox(false)}
                index={photoIndex}
                slides={photos}
                plugins={[Thumbnails]}
            />

        </div>
    );
}
