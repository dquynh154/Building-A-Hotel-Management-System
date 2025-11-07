'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DatePicker from '@/components/form/date-picker';
import { useGuest } from '@/hooks/useGuest';
import { clearToken } from '@/lib/auth-guest';

const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseYMD = (s: string) => {
    const [y, m, d] = s.split('-').map(Number); // s = "YYYY-MM-DD"
    return new Date(y, (m || 1) - 1, d || 1);
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const absUrl = (u?: string | null) =>
    !u ? "" : (u.startsWith("http") ? u : `${API_BASE}${u}`);

const HERO_IMAGES = [
    '/images/hero/hero-1.jpg',
    '/images/hero/hero-2.jpg',
    '/images/hero/hero-3.jpg',
]; // đổi đường dẫn theo ảnh của bạn

function useAutoplay(len: number, delay = 5000) {
    const [idx, setIdx] = useState(0);
    useEffect(() => {
        let stop = false;
        const onVis = () => { /* pause khi tab ẩn */ };
        document.addEventListener('visibilitychange', onVis);
        const tick = () => {
            if (document.hidden) return;
            setIdx((i) => (i + 1) % len);
        };
        const id = setInterval(tick, delay);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
    }, [len, delay]);
    return [idx, setIdx] as const;
}


export default function Home() {
    // state tối giản cho form
    const [hotel, setHotel] = useState('');
    const [adults, setAdults] = useState(1);
    const [children, setChildren] = useState(0);
    const [from, setFrom] = useState(() => {
        const now = new Date();
        const hour = now.getHours();
        // Nếu đã sau 14h -> cho ngày nhận phòng là ngày mai
        if (hour >= 14) now.setDate(now.getDate() + 1);
        return ymd(now);
    });
    const [to, setTo] = useState(() => {
        const d = new Date();
        const hour = d.getHours();
        // Nếu đã sau 14h -> ngày trả phòng = ngày mốt
        if (hour >= 14) d.setDate(d.getDate() + 2);
        else d.setDate(d.getDate() + 1);
        return ymd(d);
    });
    const [curr, _setCurr] = useAutoplay(HERO_IMAGES.length, 5000);
    const setCurr = (v: number | ((i: number) => number)) =>
        _setCurr(typeof v === 'function' ? (v as any) : () => v);


    const handleRangeChange = useCallback((selectedDates: any[]) => {
        const [d1, d2] = selectedDates as Date[];
        if (d1) setFrom(ymd(d1));
        if (d2) setTo(ymd(d2));
    }, []);

    useEffect(() => {
        const el = document.getElementById('booking-range') as any;
        const fp = el?._flatpickr;
        if (fp) {
            // đảm bảo mode range và không cho chọn quá khứ
            fp.set('mode', 'range');
            fp.set('minDate', 'today');
            fp.set('dateFormat', 'd-m-Y');    // 👈 hiển thị dd-mm-yyyy
            fp.setDate([parseYMD(from), parseYMD(to)], true); // set giá trị ban đầu bằng Date
        }
    }, []);
    // === Rooms section state ===
    type Room = {
        LP_MA: number;
        LP_TEN: string;
        LP_SONGUOI: number;
        LP_TRANGTHAI: string;
        ROOM_COUNT?: number;
        IMG_URL?: string | null;
    };

    type RoomStatic = {
        subtitle?: string; // dòng nhỏ dưới tên hạng phòng (vd: giường)
        meta?: { icon?: 'bed' | 'area' | 'view' | 'guests'; text: string }[]; // các badge nhỏ
        desc?: string;     // đoạn mô tả
    };

    const ROOM_STATIC: Record<number, RoomStatic> = {
        // Ví dụ: LP_MA = 7 (bạn đổi theo ID thật trong DB)
        7: {
            subtitle: 'GIƯỜNG QUEEN/TWIN + GIƯỜNG PHỤ',
            meta: [
                { icon: 'area', text: '30 m²' },
                { icon: 'view', text: 'Cảnh thành phố / sông' },
                { icon: 'guests', text: '2 người lớn + 1 trẻ em' },
            ],
            desc:
                'Phòng Luxe là lựa chọn hoàn hảo cho những ai muốn kết hợp công việc và vui chơi. ' +
                'Thiết kế hiện đại, tiện nghi cao cấp mang đến cảm giác thoải mái như ở nhà.',
        },

        // Ví dụ: LP_MA = 37
        37: {
            subtitle: 'GIƯỜNG QUEEN/TWIN',
            meta: [
                { icon: 'area', text: '28 m²' },
                { icon: 'view', text: 'Cảnh thành phố' },
                { icon: 'guests', text: '2 người lớn' },
            ],
            desc:
                'Phòng tiêu chuẩn chú trọng trải nghiệm gọn gàng, ấm cúng với đầy đủ tiện nghi cần thiết.',
        },
        1: {
            subtitle: '1 Giường đôi',
            meta: [
                { icon: 'area', text: '28 m²' },
                { icon: 'view', text: 'Cảnh thành phố' },
                { icon: 'guests', text: '4 người lớn' },
            ],
            desc:
                'Nhỏ gọn mà vẫn đầy đủ tiện nghi, hạng phòng Lite sẽ khiến bạn yêu ngay từ cái nhìn đầu tiên.' +
                'Với chiếc giường queen siêu thoải mái, đây là nơi hoàn hảo cho những chuyến đi một mình hoặc cặp đôi muốn tận hưởng không gian riêng tư.',
        },

        // ... thêm các LP_MA khác ở đây
    };


    const [rooms, setRooms] = useState<Room[]>([]);
    const [roomsLoading, setRoomsLoading] = useState(false);

    useEffect(() => {
        const ctrl = new AbortController();
        (async () => {
            try {
                const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
                const res = await fetch(`${BASE}/public/loai-phong?take=6`, { signal: ctrl.signal });
                const payload = await res.json();
                const list: Room[] = payload?.items ?? [];

                setRooms(list);
            } catch { }
        })();
        return () => ctrl.abort();
    }, []);



    const onFind = () => {
        const qs = new URLSearchParams({
            from, to, adults: String(adults),
        }).toString();
        window.location.href = `/khachhang/dat-phong?${qs}`;
    };



    return (
        <div className="min-h-screen bg-[#F9F5EF] text-white">
            {/* Top bar */}


            {/* Hero */}
            <section className="relative group">
                {/* Slides */}
                <div className="relative h-[72vh] w-full overflow-hidden">
                    {HERO_IMAGES.map((src, i) => (
                        <img
                            key={src}
                            src={src}
                            alt=""
                            className={`
          absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out
          ${i === curr ? 'opacity-100' : 'opacity-0'}
        `}
                            // để lazy cho ảnh sau, ưu tiên ảnh đầu
                            loading={i === 0 ? 'eager' : 'lazy'}
                        />
                    ))}
                    {/* Overlay gradient để chữ dễ đọc */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
                </div>

                {/* Headline */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4">
                    <h1 className="text-center text-3xl font-extrabold leading-tight md:text-5xl ">
                        LƯU TRÚ TRỌN VẸN 24 GIỜ<br />VỚI DỊCH VỤ 24/7
                    </h1>
                </div>

                {/* Controls */}
                <button
                    aria-label="Previous"
                    onClick={() => setCurr((i) => (i - 1 + HERO_IMAGES.length) % HERO_IMAGES.length)}
                    className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
                >
                    ‹
                </button>
                <button
                    aria-label="Next"
                    onClick={() => setCurr((i) => (i + 1) % HERO_IMAGES.length)}
                    className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
                >
                    ›
                </button>

                {/* Dots */}
                <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 flex gap-2">
                    {HERO_IMAGES.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurr(i)}
                            aria-label={`Slide ${i + 1}`}
                            className={`h-2 w-2 rounded-full ${i === curr ? 'bg-white' : 'bg-white/40'}`}
                        />
                    ))}
                </div>

                {/* Booking bar nổi (giữ nguyên khối của bạn) */}
                <div className="absolute inset-x-0 -bottom-10 mx-auto max-w-4xl px-4">
                    <div className="rounded-xl bg-white text-black shadow-2xl">
                        <div className="flex flex-col md:flex-row md:items-center md:divide-x md:divide-gray-200">

                            <div className="flex-[1.4] p-4">
                                <div className="mb-1 text-xs font-medium text-gray-600">Ngày</div>
                                <DatePicker
                                    id="booking-range"
                                    mode="range"
                                    placeholder={`${from} - ${to}`}
                                    onChange={handleRangeChange}
                                />
                            </div>

                            <div className="flex-1 p-4">
                                <div className="mb-1 text-xs font-medium text-gray-600">Số Khách</div>
                                <select
                                    value={adults}
                                    onChange={(e) => setAdults(Number(e.target.value))}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <option key={i + 1} value={i + 1}>{i + 1} Người</option>
                                    ))}
                                </select>
                            </div>

                            <div className="shrink-0 p-4 md:pl-6 md:pr-5">
                                <button
                                    onClick={onFind}
                                    // className="h-12 min-w-[180px] rounded-md bg-blue-500 px-6 text-sm font-semibold text-white hover:bg-blue-600 focus:outline-none focus:ring-4 focus:ring-rose-300"
                                    className="inline-flex items-center rounded-md bg-[#B3834C] px-6 py-3 font-semibold text-white hover:bg-[#9c6f3e] focus:outline-none focus:ring-4 focus:ring-amber-300"

                                >
                                    TÌM PHÒNG
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            {/* ABOUT */}
            <section id="about" className="bg-[#F9F5EF]">
                <div className="mx-auto max-w-7xl px-4 py-16 md:py-24">
                    <div className="grid items-center gap-10 md:grid-cols-2">
                        {/* Text */}
                        <div>
                            <h2 className="mb-6 text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
                                VỀ CHÚNG TÔI
                            </h2>

                            <p className="mb-4 text-lg leading-8 text-slate-700">
                                Wendy Hotel tọa lạc tại vị trí thuận tiện, là điểm dừng chân lý tưởng cho cả nghỉ dưỡng
                                và công tác. Khi đến với Wendy, bạn sẽ đắm mình trong không gian thoáng đãng, tận hưởng
                                những dịch vụ chu đáo và các hoạt động thư giãn giúp xua tan mệt mỏi.
                            </p>

                            <p className="mb-4 text-lg leading-8 text-slate-700">
                                Hệ thống phòng được trang bị đầy đủ tiện nghi, thiết kế pha trộn giữa phong cách hiện đại
                                và nét ấm áp Á Đông. Khu nhà hàng – cà phê, phòng họp và các tiện ích 24/7 sẵn sàng đáp ứng
                                mọi nhu cầu của bạn.
                            </p>

                            <p className="text-lg leading-8 text-slate-700">
                                Đội ngũ nhân viên chuyên nghiệp, tận tâm luôn đồng hành để mang đến trải nghiệm lưu trú
                                thoải mái và đáng nhớ.
                            </p>

                            <div className="mt-8">
                                <a
                                    href="/gioi-thieu"
                                    className="inline-flex items-center rounded-md bg-[#B3834C] px-6 py-3 font-semibold text-white hover:bg-[#9c6f3e] focus:outline-none focus:ring-4 focus:ring-amber-300"
                                >
                                    TÌM HIỂU THÊM
                                </a>
                            </div>
                        </div>

                        {/* Image */}
                        <div className="relative">
                            <img
                                src="/images/about/about.jpg"  /* đổi sang ảnh của bạn */
                                alt="Không gian nhà hàng Wendy Hotel"
                                className="aspect-[4/3] w-full rounded-2xl object-cover shadow-xl ring-1 ring-black/10"
                            />
                        </div>
                    </div>
                </div>
            </section>
            {/* ROOMS & SUITES */}
            <section id="rooms" className="bg-[#F9F5EF]">
                <div className="mx-auto max-w-7xl px-4 py-16 md:py-24">
                    <div className="mb-10 flex items-end justify-between">
                        <div>
                            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
                                PHÒNG &amp; HẠNG PHÒNG
                            </h2>
                            <p className="mt-3 text-slate-600">Chọn hạng phòng phù hợp cho kỳ nghỉ của bạn.</p>
                        </div>
                    </div>

                    {/* Grid cards */}
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {(roomsLoading ? Array.from({ length: 3 }) : rooms).map((r: any, idx: number) => (
                            <article
                                key={r?.LP_MA ?? idx}
                                className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm transition hover:shadow-lg"
                            >
                                {/* Ảnh đại diện */}
                                {roomsLoading ? (
                                    <div className="aspect-[4/3] w-full animate-pulse bg-amber-100/60" />
                                ) : (
                                    <img
                                        src={absUrl(r.IMG_URL) || "/images/hero/hero-2.jpg"}
                                        alt={r.LP_TEN || "Loại phòng"}
                                        className="aspect-[4/3] w-full object-cover"
                                    />
                                )}

                                {/* Nội dung */}
                                <div className="space-y-3 p-5">
                                    <h3 className="text-xl font-extrabold text-slate-900">
                                        {roomsLoading ? "Đang tải…" : r.LP_TEN || "Loại phòng"}
                                    </h3>

                                    {/* Tag thông số: sức chứa + (tuỳ chọn) số phòng thuộc loại */}
                                    {!roomsLoading && (() => {
                                        const st = ROOM_STATIC[r.LP_MA];
                                        const metas = st?.meta ?? [];
                                        return (
                                            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                                                {metas.map((m, i) => (
                                                    <span key={i} className="rounded-full border border-amber-200 px-2 py-1">
                                                        {m.text}
                                                    </span>
                                                ))}

                                                {/* luôn có fallback số khách từ DB */}
                                                <span className="rounded-full border border-amber-200 px-2 py-1">
                                                    Tối đa {r.LP_SONGUOI} khách
                                                </span>
                                            </div>
                                        );
                                    })()}
                                    {/* Mô tả tĩnh (nếu có) */}
                                    {!roomsLoading && ROOM_STATIC[r.LP_MA]?.desc && (
                                        <p className="text-sm leading-6 text-slate-700">
                                            {ROOM_STATIC[r.LP_MA]?.desc}
                                        </p>
                                    )}

                                    {/* CTA */}
                                    {!roomsLoading && (
                                        <div className="pt-2">
                                            <a
                                                href={`/dat-phong/ket-qua?lp=${r.LP_MA}&from=${from}&to=${to}&adults=${adults}`}
                                                className="inline-flex items-center gap-2 rounded-md bg-[#D22F27] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b82821] focus:outline-none focus:ring-4 focus:ring-rose-300"
                                            >
                                                XEM CHI TIẾT
                                                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M12.293 4.293a1 1 0 011.414 0l4 4a1 1 0 01.083.094 1 1 0 01.207.61 1 1 0 01-.207.61l-4 4a1 1 0 11-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" />
                                                </svg>
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>


            {/* Footer khớp vibe ảnh mẫu (giản lược) */}

        </div>
    );
}
