'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import DatePicker from '@/components/form/date-picker';
import { useGuest } from '@/hooks/useGuest';
import { clearToken } from '@/lib/auth-guest';
import { Clock, BedDouble, Window, KeyRound, Dog, ShowerHead, Wifi, Tv, MailIcon, Phone, Map } from "@/icons";

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
        3: {
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
        1: {
            subtitle: 'GIƯỜNG QUEEN/TWIN',
            meta: [
                { icon: 'area', text: '28 m²' },
                { icon: 'view', text: 'Cảnh thành phố' },
                { icon: 'guests', text: '2 người lớn' },
            ],
            desc:
                'Phòng tiêu chuẩn chú trọng trải nghiệm gọn gàng, ấm cúng với đầy đủ tiện nghi cần thiết.',
        },
        2: {
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


    // --- Rooms slider state ---
    const [slide, setSlide] = useState(0);
    const [perView, setPerView] = useState(3);

    // Cập nhật perView theo màn hình, đồng thời không vượt quá số phòng hiện có
    useEffect(() => {
        const calc = () => {
            const base = window.innerWidth >= 1024 ? 3 : (window.innerWidth >= 640 ? 2 : 1);
            const len = rooms?.length ?? 0;
            setPerView(Math.max(1, Math.min(base, len || base))); // nếu có 3 phòng thì perView=3
            setSlide(0); // reset về đầu khi đổi kích thước / dữ liệu
        };
        calc();
        window.addEventListener('resize', calc);
        return () => window.removeEventListener('resize', calc);
    }, [rooms?.length]);

    const maxSlide = Math.max(0, (rooms?.length ?? 0) - perView);
    const nextSlide = () => setSlide(s => Math.min(maxSlide, s + 1));
    const prevSlide = () => setSlide(s => Math.max(0, s - 1));
    const atStart = slide === 0;
    const atEnd = slide === maxSlide;
    const AMENITIES = [
        { icon: Clock, text: "Lưu trú trọn vẹn 24 giờ" },
        { icon: BedDouble, text: "Bộ drap trải giường và gối ngủ cao cấp" },
        { icon: Window, text: "Cửa sổ kính từ trần đến sàn" },
        { icon: KeyRound, text: "Khoá phòng điện tử" },
        { icon: Dog, text: "Thân thiện với thú cưng" },
        { icon: ShowerHead, text: "Vòi sen điều chỉnh áp suất nước" },
        { icon: Wifi, text: "Wi-Fi tốc độ cao" },
        { icon: Tv, text: "TV thông minh" },
    ];

    // --- Reviews: có thể fetch từ BE, còn không thì dùng fallback dưới ---
    type Review = { id: number; name: string; rating: number; content: string };

    const REVIEWS_FALLBACK: Review[] = [
        { id: 1, name: "Mai", rating: 5, content: "Khách sạn phục vụ rất tốt, chúng tôi rất hài lòng." },
        { id: 2, name: "Long", rating: 4, content: "Phòng sạch, view đẹp, nhân viên thân thiện." },
        { id: 3, name: "Hà", rating: 5, content: "Bữa sáng ngon, tiện nghi đầy đủ, sẽ quay lại." },
    ];

    const [reviews, setReviews] = useState<Review[]>(REVIEWS_FALLBACK);
    const [idx, setIdx] = useState(0);

    // Nếu đã có API public, bật fetch này (đổi URL cho đúng):
    useEffect(() => {
        (async () => {
            try {
                const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
                const url = `${API_BASE}/public/danh-gia?status=PUBLISHED&take=5`; // <— chỉnh endpoint nếu khác
                const r = await fetch(url, { credentials: 'include' });  // nếu dùng cookie
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const j = await r.json();
                if (Array.isArray(j.items) && j.items.length) {
                    setReviews(j.items.map((x: any, i: number) => ({
                        id: x.DG_MA ?? i,
                        name: x.KH_TEN ?? x.KHACH_HANG?.KH_HOTEN ?? "Khách ẩn danh",
                        rating: Number(x.DG_SAO ?? 5),
                        content: x.DG_NOI_DUNG || x.DG_TIEU_DE || "Rất tuyệt vời!",
                    })));
                    setIdx(0);
                }
            } catch { /* im lặng dùng fallback */ }
        })();
    }, []);

    // Tự chạy slide mỗi 5s
    useEffect(() => {
        if (reviews.length <= 1) return;
        const t = setInterval(() => setIdx(i => (i + 1) % reviews.length), 5000);
        return () => clearInterval(t);
    }, [reviews.length]);

    const prevReview = () => setIdx(i => (i - 1 + reviews.length) % reviews.length);
    const nextReview = () => setIdx(i => (i + 1) % reviews.length);


    return (
        <div className="min-h-screen bg-[#FDFCF9] text-white">
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
            <section id="about" className="bg-[#FDFCF9]">
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
            {/* ROOMS & SUITES */}
            <section
                id="rooms"
                className="relative"
                style={{
                    backgroundImage: "url('/images/hero/hero-1.jpg')", // đổi path ảnh nền trời
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            >
                {/* overlay làm dịu */}
                <div className="absolute inset-0 bg-black/40"></div>

                <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24">
                    {/* Heading giữa như ảnh mẫu */}
                    <div className="mb-10 text-center">
                        <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-5xl">
                            HỆ THỐNG PHÒNG
                        </h2>
                        <p className="mx-auto mt-4 max-w-4xl text-base leading-7 text-white/90 md:text-lg">
                            223 phòng nghỉ từ tiêu chuẩn đến cao cấp được bố trí hài hòa trong khuôn viên khách sạn...
                        </p>
                    </div>

                    {/* Slider khung ngoài */}
                    <div className="relative">
                        <div className="relative overflow-hidden px-12">


                            {/* Nút điều hướng */}
                            <button
                                onClick={prevSlide}
                                aria-label="Prev"
                                className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded bg-black/50 p-3 text-white hover:bg-black/70"
                            >
                                ‹
                            </button>
                            <button
                                onClick={nextSlide}
                                aria-label="Next"
                                className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded bg-black/50 p-3 text-white hover:bg-black/70"
                            >
                                ›
                            </button>

                            {/* Viewport */}
                            <div className="overflow-hidden px-16">
                                {/* Track */}
                                <div
                                    className="flex gap-6 transition-transform duration-500 ease-out"
                                    style={{ transform: `translateX(-${(100 / perView) * slide}%)` }}
                                >
                                    {(roomsLoading ? Array.from({ length: 3 }) : rooms).map((r: any, idx: number) => (
                                        <div
                                            key={r?.LP_MA ?? idx}
                                            style={{ flex: `0 0 ${100 / perView}%`, maxWidth: `${100 / perView}%` }}
                                        >
                                            {/* Card như ảnh mẫu: ảnh trên + khung trắng dưới */}
                                            <article className="flex h-full flex-col rounded-lg bg-white shadow-lg">
                                                {/* Ảnh */}
                                                {roomsLoading ? (
                                                    <div className="aspect-[4/3] animate-pulse rounded-t-lg bg-gray-200" />
                                                ) : (
                                                    <img
                                                        src={absUrl(r.IMG_URL) || "/images/hero/hero-2.jpg"}
                                                        alt={r?.LP_TEN || "Loại phòng"}
                                                        className="aspect-[4/3] w-full rounded-t-lg object-cover"
                                                    />
                                                )}

                                                {/* Nội dung */}
                                                <div className="flex grow flex-col p-6">
                                                    <h3 className="text-2xl font-extrabold text-[#d39a2a]">
                                                        {roomsLoading ? "Đang tải…" : (r?.LP_TEN || "Loại phòng")}
                                                    </h3>

                                                    {/* mô tả rút gọn: 3 dòng + ellipsis, giữ chiều cao đều */}
                                                    {!roomsLoading && (
                                                        <p
                                                            className="mt-3 text-slate-700 overflow-hidden text-ellipsis
                   [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical]"
                                                        >
                                                            {ROOM_STATIC[r?.LP_MA]?.desc ||
                                                                `Nằm ở tầng tiện nghi, tối đa ${r?.LP_SONGUOI ?? 2} khách, nội thất hiện đại, tiện nghi đầy đủ.`}
                                                        </p>
                                                    )}

                                                    {/* CTA đẩy xuống đáy để các card cao bằng nhau */}
                                                    {!roomsLoading && (
                                                        <div className="mt-auto pt-4">
                                                            <a
                                                                href={`/dat-phong/ket-qua?lp=${r.LP_MA}&from=${from}&to=${to}&adults=${adults}`}
                                                                className="inline-flex items-center gap-2 font-semibold text-[#d39a2a] hover:underline"
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

                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>


            {/* TIỆN ÍCH PHÒNG */}
            <section className="">
                <div className="mx-auto max-w-7xl px-4 py-16 md:py-20">
                    <h2 className="mb-10 text-3xl font-extrabold tracking-tight md:text-5xl text-slate-900">
                        Tiện Ích Phòng
                    </h2>

                    <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
                        {AMENITIES.map((it, i) => {
                            const Icon = it.icon;
                            return (
                                <div
                                    key={i}
                                    className="rounded-md border border-gray-200 bg-white p-10 text-center transition-shadow hover:shadow-md"
                                >
                                    <Icon className="mx-auto h-10 w-10" strokeWidth={2.2} />
                                    <div
                                        className="mt-6 text-xs font-extrabold uppercase tracking-wide text-gray-900
                         overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]"
                                        title={it.text}
                                    >
                                        {it.text}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>
            {/* ĐÁNH GIÁ KHÁCH HÀNG */}
            <section className="bg-[#d39a2a] text-white">
                <div className="mx-auto max-w-4xl px-4 py-10 md:py-14">
                    {/* stars */}
                    <div className="mb-3 flex justify-center gap-1 text-lg">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={i < (reviews[idx]?.rating ?? 5) ? 'opacity-100' : 'opacity-40'}>★</span>
                        ))}
                    </div>

                    {/* slider viewport */}
                    <div className="relative">
                        {/* nút trái/phải */}
                        <button
                            onClick={prevReview}
                            aria-label="Trước"
                            className="absolute left-0 top-1/2 -translate-y-1/2 rounded bg-black/20 px-3 py-2 backdrop-blur hover:bg-black/30"
                        >‹</button>
                        <button
                            onClick={nextReview}
                            aria-label="Sau"
                            className="absolute right-0 top-1/2 -translate-y-1/2 rounded bg-black/20 px-3 py-2 backdrop-blur hover:bg-black/30"
                        >›</button>

                        {/* track (fade) */}
                        <div className="overflow-hidden px-10">
                            <div className="relative h-[120px] md:h-[150px]">
                                {reviews.map((rv, i) => (
                                    <div
                                        key={rv.id}
                                        className={`absolute inset-0 flex flex-col items-center justify-center text-center transition-opacity duration-700
                          ${i === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                                    >
                                        <blockquote className="mx-auto max-w-2xl text-lg md:text-2xl leading-relaxed italic overflow-hidden [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical]">
                                            &ldquo;{rv.content}&rdquo;
                                        </blockquote>
                                        <div className="mt-6 text-sm tracking-[0.25em]">{rv.name?.toUpperCase()}</div>
                                    </div>
                                ))}
                            </div>

                            {/* dots */}
                            <div className="mt-6 flex justify-center gap-2">
                                {reviews.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setIdx(i)}
                                        aria-label={`Chuyển tới đánh giá ${i + 1}`}
                                        className={`h-1 rounded-full transition-all ${i === idx ? 'w-8 bg-white' : 'w-4 bg-white/60'}`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* CTA đọc thêm */}
                    <div className="mt-10 flex justify-center">
                        <a
                            href="khachhang/danh-gia"
                            className="inline-flex items-center gap-2 rounded-full border border-white/80 px-5 py-2 text-sm font-semibold hover:bg-white hover:text-[#d39a2a]"
                        >
                            Đọc thêm
                            <span aria-hidden>→</span>
                        </a>
                    </div>
                </div>
            </section>


            {/* VỊ TRÍ & LIÊN HỆ */}
            <section id="contact" className="bg-[#FDFCF9]">
                <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-8 px-4 py-14 md:grid-cols-2">

                    {/* Bản đồ */}
                    <div className="relative overflow-hidden rounded-xl shadow">
                        <iframe
                            title="Bản đồ"
                            src={
                                "https://www.google.com/maps?q=" +
                                encodeURIComponent("Khu II, Đ. 3 Tháng 2, Xuân Khánh, Ninh Kiều, Cần Thơ") +
                                "&output=embed"
                            }
                            className="h-[360px] w-full md:h-[420px] border-0"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                        />
                    </div>

                    {/* Thông tin liên hệ */}
                    <div className="flex flex-col justify-center">
                        <div className="text-[13px] tracking-[0.3em] text-yellow-600">LOCATION</div>
                        <h2 className="mt-2 text-3xl font-extrabold md:text-5xl text-gray-900">Vị trí & liên hệ</h2>

                        <p className="mt-6 text-lg text-slate-700">
                            Khu II, Đ. 3 Tháng 2, Xuân Khánh, Ninh Kiều, Cần Thơ
                        </p>

                        <div className="mt-8 space-y-4 text-slate-800">
                            <div className="flex items-center gap-3">
                                <Phone className="h-6 w-6 text-yellow-700" />
                                <div>
                                    <div>(+84) 123456789</div>

                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <MailIcon className="h-6 w-6 text-yellow-700" />
                                <div>
                                    <div><a href="mailto:info@wendyhotel.com" className="hover:underline">info@wendyhotel.com</a></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Map className="h-6 w-6 text-yellow-700" />
                                <a
                                    href={
                                        "https://www.google.com/maps/dir/?api=1&destination=" +
                                        encodeURIComponent("Khu II, Đ. 3 Tháng 2, Xuân Khánh, Ninh Kiều, Cần Thơ")
                                    }
                                    target="_blank" rel="noopener"
                                    className="font-semibold text-yellow-700 hover:underline"
                                >
                                    Xem chỉ đường →
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>


        </div>
    );
}
