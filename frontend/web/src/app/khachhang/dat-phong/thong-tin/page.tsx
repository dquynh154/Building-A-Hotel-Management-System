'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useGuest } from '@/hooks/useGuest';
import Checkbox from '@/components/form/input/Checkbox';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

/** parse "37:2,1:1" -> {37:2, 1:1} */
const parseSel = (s: string | null) => {
    const map: Record<number, number> = {};
    if (!s) return map;
    s.split(',').forEach(pair => {
        const [a, b] = pair.split(':');
        const id = Number(a);
        const qty = Number(b);
        if (id && qty > 0) map[id] = qty;
    });
    return map;
};

const parseYMD = (v: string) => {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};

const fmtVND = (n: number) =>
    (n ?? 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });

export default function ThongTinLuuTruPage() {
    const q = useSearchParams();

    // Params cố định từ URL
    const from = q.get('from') || '';
    const to = q.get('to') || '';
    const adults = Number(q.get('adults') || 1);
    const selMap = useMemo(() => parseSel(q.get('sel')), [q]);

    // Tính ngày/đêm
    const fromDate = parseYMD(from);
    const toDate = parseYMD(to);
    const nights = Math.max(1, Math.ceil((+toDate - +fromDate) / 86400000));

    // Dòng đã chọn (kèm giá từ API)
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const grandTotal = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

    const router = useRouter();

    // build lại chuỗi sel "LPMA:qty,LPMA:qty"
    const selStr = useMemo(() => {
        return Object.entries(selMap)
            .map(([id, qty]) => `${id}:${qty}`)
            .join(',');
    }, [selMap]);

    const depositPercent = 50;
    const deposit = Math.round(grandTotal * depositPercent / 100); // VND, làm tròn đơn giản


    const backHref = useMemo(() => {
        const p = new URLSearchParams({ from, to, adults: String(adults) });
        return `/khachhang/dat-phong?${p.toString()}`;
    }, [from, to, adults]);
    const { guest, loading: guestLoading } = useGuest();
    const [showLoginNotice, setShowLoginNotice] = useState(false);

    // build URL tiếp theo (trang thanh toán) và URL đăng nhập quay lại đúng trang đó
    const nextQS = new URLSearchParams({ from, to, adults: String(adults), sel: selStr }).toString();
    const payHref = `/khachhang/dat-phong/thong-tin?${nextQS}`;
    const loginHref = `/khachhang/dang-nhap?redirect=${encodeURIComponent(payHref)}`;

    // Fetch lại loại phòng (để lấy PRICE/IMG_URL) rồi lọc theo selMap
    useEffect(() => {
        let on = true;
        (async () => {
            try {
                setLoading(true);
                setErr(null);
                const url = `${API_BASE}/public/loai-phong-trong?from=${from}&to=${to}&adults=${adults}&take=50`;
                const res = await fetch(url, { credentials: 'include' });
                const json = await res.json();
                const list: any[] = Array.isArray(json?.items) ? json.items : [];
                const chosen = list
                    .filter(it => selMap[it.LP_MA])
                    .map(it => {
                        const qty = selMap[it.LP_MA];
                        const nightly = Number(it.PRICE ?? 0);
                        return { ...it, qty, nightly, total: nightly * qty * nights };
                    });
                if (on) setRows(chosen);
            } catch (e: any) {
                if (on) setErr('Không tải được dữ liệu.');
            } finally {
                if (on) setLoading(false);
            }
        })();
        return () => {
            on = false;
        };
    }, [from, to, adults, selMap]);
    // --- Form "Khách hàng"
    type Person = {
        firstName: string;
        lastName: string;
        phone?: string;
        email?: string;
        nationality?: string; // mã quốc gia, ví dụ 'VN'
    };

    const [bookingFor, setBookingFor] = useState<'me' | 'other'>('me');
    const [booker, setBooker] = useState<Person>({ firstName: '', lastName: '', phone: '', email: '' });
    const [guestInfo, setGuestInfo] = useState<Person>({ firstName: '', lastName: '', phone: '' });
    const [agreeNews, setAgreeNews] = useState(false);

    // build payload để lưu vào LUU_TRU_KHACH (có cờ is_primary)
    const buildStayGuests = () => {
        if (bookingFor === 'me') {
            return [
                { ...booker, is_primary: true, role: 'booker_primary' },
            ];
        }
        return [
            { ...booker, is_primary: false, role: 'booker' },
            { ...guestInfo, is_primary: true, role: 'guest_primary' },
        ];
    };

    /**
     * Tự điền thông tin người đặt từ tài khoản đăng nhập.
     * - Không đè giá trị người dùng đã gõ (chỉ fill nếu đang trống).
     * - Tách KH_HOTEN -> firstName (tên đệm + tên lót) & lastName (tên).
     */
    useEffect(() => {
        if (!guest || guestLoading) return;

        const fullName = (guest.KH_HOTEN || '').trim();
        let first = '', last = '';

        if (fullName) {
            const parts = fullName.split(/\s+/);
            last = parts.pop() || '';
            first = parts.join(' '); // phần còn lại
        } else {
            // fallback nếu backend tách sẵn
            first = guest.KH_TEN || '';
            last = guest.KH_HO || '';
        }

        const nat =
            guest.KH_QUOCTICH || guest.KH_QUOC_TICH || guest.NATIONALITY || 'VN';

        setBooker((v) => ({
            firstName: v.firstName || first,
            lastName: v.lastName || last,
            phone: v.phone || guest.KH_SDT || '',
            email: v.email || guest.KH_EMAIL || '',
            nationality: v.nationality || nat,
        }));
    }, [guest, guestLoading]);
    // ==== VALIDATION ====
    type FormErrors = {
        booker?: Partial<Record<'firstName' | 'lastName' | 'phone' | 'email', string>>;
        guest?: Partial<Record<'firstName' | 'lastName' | 'phone', string>>;
    };
    const [errors, setErrors] = useState<FormErrors>({});

    const isNonEmpty = (s?: string) => !!(s && s.trim().length > 0);
    const isEmail = (s?: string) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
    const isPhone = (s?: string) => !!s && /^[0-9]{10,11}$/.test(s.replace(/\D/g, ''));
    const [errors1, setErrors1] = useState({
        isChecked: "",
    });
    const validateForm = () => {
        const be: Record<string, string> = {};
        const ge: Record<string, string> = {};

        if (!isNonEmpty(booker.firstName)) be.firstName = 'Bắt buộc';
        if (!isNonEmpty(booker.lastName)) be.lastName = 'Bắt buộc';
        if (!isPhone(booker.phone)) be.phone = 'SĐT không hợp lệ (10–11 số)';
        if (!isEmail(booker.email)) be.email = 'Email không hợp lệ';

        if (bookingFor === 'other') {
            if (!isNonEmpty(guestInfo.firstName)) ge.firstName = 'Bắt buộc';
            if (!isNonEmpty(guestInfo.lastName)) ge.lastName = 'Bắt buộc';
            if (!isPhone(guestInfo.phone)) ge.phone = 'SĐT không hợp lệ (10–11 số)';
        }

        setErrors({ booker: be, guest: ge });
        const hasError = Object.keys(be).length || Object.keys(ge).length;
        return !hasError;
    };
    const [method, setMethod] = useState<'bank' | 'cod' | 'momo'>('bank');
    const [isChecked, setIsChecked] = useState(false);
    return (
        <div className="mx-auto max-w-6xl px-4 py-6 text-slate-800">
            {/* KHUNG BỌC CHUNG */}
            <div className="rounded-2xl border bg-white">
                {/* Header khung */}
                <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3 border-b px-5 py-4">
                    <div className="justify-self-start">
                        <Link href={backHref} className="inline-flex items-center gap-2 text-rose-700 hover:text-rose-800">
                            <span className="text-lg leading-none">‹</span>
                            <span className="text-sm font-medium">Quay lại phòng</span>
                        </Link>
                    </div>
                    <h2 className="justify-self-center text-lg md:text-xl font-semibold text-slate-800">
                        Thông tin lưu trú của bạn
                    </h2>

                </div>

                {/* Nội dung trong khung */}
                <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-12">
                    <div id="form-root" className="md:col-span-8 flex flex-col gap-6">
                        {/* Form lưu trú */}
                        <div className="md:col-span-8 rounded-xl border bg-white p-0 overflow-hidden">
                            {/* Header section nhạt nền */}
                            <div className="border-b bg-rose-50/30 px-5 py-4">
                                <div className="text-lg font-semibold">Khách hàng</div>
                            </div>

                            <div className="px-5 py-5">
                                <div className="mb-4 border-b pb-4">
                                    <div className="mb-2 text-sm text-gray-600">Tôi đang đặt</div>
                                    <div className="inline-flex rounded-md border">
                                        <button
                                            type="button"
                                            onClick={() => setBookingFor('me')}
                                            className={`px-4 py-2 text-sm ${bookingFor === 'me' ? 'bg-rose-600 text-white' : 'bg-white text-rose-700 hover:bg-rose-50'}`}
                                        >
                                            Cho tôi
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBookingFor('other')}
                                            className={`px-4 py-2 text-sm border-l ${bookingFor === 'other' ? 'bg-rose-600 text-white' : 'bg-white text-rose-700 hover:bg-rose-50'}`}
                                        >
                                            Cho người khác
                                        </button>
                                    </div>
                                </div>

                                {/* Thông tin người đặt (liên hệ) */}
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="space-y-1">
                                        <div className="relative">
                                            <input
                                                className={`w-full rounded-md border px-3 py-2 ${errors.booker?.firstName ? 'border-red-500' : ''}`}
                                                placeholder="Tên"
                                                value={booker.firstName}
                                                onChange={e => setBooker(v => ({ ...v, firstName: e.target.value }))}
                                            />
                                            {errors.booker?.firstName && <p className="mt-1 text-xs text-red-600">{errors.booker.firstName}</p>}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="relative">
                                            <input
                                                className={`w-full rounded-md border px-3 py-2 ${errors.booker?.lastName ? 'border-red-500' : ''}`}
                                                placeholder="Họ"
                                                value={booker.lastName}
                                                onChange={e => setBooker(v => ({ ...v, lastName: e.target.value }))}
                                            />
                                            {errors.booker?.lastName && <p className="mt-1 text-xs text-red-600">{errors.booker.lastName}</p>}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="relative">
                                            <input
                                                className={`w-full rounded-md border px-3 py-2 ${errors.booker?.phone ? 'border-red-500' : ''}`}
                                                placeholder="SĐT"
                                                value={booker.phone}
                                                onChange={e => setBooker(v => ({ ...v, phone: e.target.value }))}
                                            />
                                            {errors.booker?.phone && <p className="mt-1 text-xs text-red-600 md:col-span-2">{errors.booker.phone}</p>}

                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="relative">
                                            <input
                                                className={`w-full rounded-md border px-3 py-2 ${errors.booker?.email ? 'border-red-500' : ''}`}
                                                placeholder="Email"
                                                value={booker.email}
                                                onChange={e => setBooker(v => ({ ...v, email: e.target.value }))}
                                            />
                                            {errors.booker?.email && <p className="mt-1 text-xs text-red-600 md:col-span-2">{errors.booker.email}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* <div className="md:col-span-8 rounded-xl border bg-white p-0 overflow-hidden"> */}
                        {/* Nếu đặt cho người khác → hiển thị form khách ở chính */}
                        {bookingFor === 'other' && (
                            <div className="md:col-span-8 rounded-xl border bg-white p-0 overflow-hidden">
                                <div className="border-b bg-rose-50/30 px-5 py-4">
                                    <div className="text-lg font-semibold">Nhập thông tin chi tiết của khách ở chính</div>
                                </div>

                                <div className="px-5 py-5">
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div className="space-y-1">
                                            <div className="relative">
                                                <input
                                                    className={`w-full rounded-md border px-3 py-2 ${errors.guest?.firstName ? 'border-red-500' : ''}`}
                                                    placeholder="Tên"
                                                    value={guestInfo.firstName}
                                                    onChange={e => setGuestInfo(v => ({ ...v, firstName: e.target.value }))}
                                                />
                                                {errors.guest?.firstName && <p className="mt-1 text-xs text-red-600">{errors.guest.firstName}</p>}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="relative">
                                                <input
                                                    className={`w-full rounded-md border px-3 py-2 ${errors.guest?.lastName ? 'border-red-500' : ''}`}
                                                    placeholder="Họ"
                                                    value={guestInfo.lastName}
                                                    onChange={e => setGuestInfo(v => ({ ...v, lastName: e.target.value }))}
                                                />
                                                {errors.guest?.lastName && <p className="mt-1 text-xs text-red-600">{errors.guest.lastName}</p>}
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <div className="relative">
                                                <input
                                                    className={`w-full rounded-md border px-3 py-2 ${errors.guest?.phone ? 'border-red-500' : ''}`}
                                                    placeholder="SĐT"
                                                    value={guestInfo.phone}
                                                    onChange={e => setGuestInfo(v => ({ ...v, phone: e.target.value }))}
                                                />
                                                {errors.guest?.phone && <p className="mt-1 text-xs text-red-600 md:col-span-2">{errors.guest.phone}</p>}

                                            </div>
                                        </div>

                                    </div>
                                </div>
                            </div>
                        )}
                        {/* </div> */}


                        <div className="md:col-span-8 rounded-xl border bg-white p-0 overflow-hidden">
                            {/* Phương thức thanh toán */}
                            <div className="border-b bg-rose-50/30 px-5 py-4">
                                <div className="text-lg font-semibold">Chọn phương thức thanh toán</div>
                            </div>
                            <div className="px-5 py-5">

                                <div className="space-y-3">
                                    <label className="flex items-center gap-3">
                                        <input type="radio" name="pm" checked={method === 'bank'} onChange={() => setMethod('bank')} />
                                        <span>Chuyển khoản ngân hàng</span>
                                    </label>
                                    <label className="flex items-center gap-3">
                                        <input type="radio" name="pm" checked={method === 'momo'} onChange={() => setMethod('momo')} />
                                        <span>Ví MoMo </span>
                                    </label>

                                </div>
                                {showLoginNotice && (
                                    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                        Bạn cần <Link href={loginHref} className="font-semibold underline">đăng nhập</Link> để tiếp tục đặt phòng thanh toán cọc.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="md:col-span-8 rounded-xl border bg-white p-0 overflow-hidden">
                            {/* Phương thức thanh toán */}
                            <div className="border-b bg-rose-50/30 px-5 py-4">
                                <div className="text-lg font-semibold">Ghi chú</div>
                            </div>
                            <div className="px-5 py-5">
                                <input type="text" />
                            </div>

                        </div>
                        <div className="flex items-center gap-3">
                            <Checkbox className="w-5 h-5" checked={isChecked} onChange={setIsChecked} />
                            <p className="inline-block font-normal text-gray-500 dark:text-gray-400">
                                Tôi đồng ý xử lý dữ liệu cá nhân và xác nhận rằng tôi đã đọc{" "}
                                <span className="text-gray-800 dark:text-white/90">Quy tắc đặt phòng online </span> và{" "}
                                <span className="text-gray-800 dark:text-white">Chính sách quyền riêng tư</span>.
                                 
                            </p>
                        </div>
                        {errors1.isChecked && <p className="text-sm text-red-500 mt-1">{errors1.isChecked}</p>}
                        <button
                            onClick={async () => {
                                if (!guest && !guestLoading) {
                                    setShowLoginNotice(true);
                                    return;
                                }
                                if (!validateForm()) {
                                    document.getElementById('form-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    return;
                                }

                                // Lưu thông tin khách ở chính
                                sessionStorage.setItem('stay_guests', JSON.stringify(buildStayGuests()));

                                // 1) PREPARE: recheck tồn + tạo HĐ/HĐ cọc (trả hdon_ma + deposit)
                                const items = rows.map(r => ({ lp_ma: r.LP_MA, qty: r.qty }));
                                const stayGuests = buildStayGuests();
                                const prepRes = await fetch(`${API_BASE}/public/dat-truoc/prepare`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    // đã có sẵn function buildStayGuests()
                                    body: JSON.stringify({
                                        from, to, adults, items,
                                        kh_ma: guest?.KH_MA || null,
                                        stay_guests: stayGuests,
                                    }),

                                });
                                if (!prepRes.ok) {
                                    const e = await prepRes.json().catch(() => ({}));
                                    alert(e?.message || 'Không chuẩn bị đơn được.');
                                    return;
                                }
                                const prep = await prepRes.json();
                                const hdon_ma = prep.hdon_ma;
                                const dep = Math.round(Number(prep.deposit || deposit));

                                // 2) CREATE pay url
                                const payRes = await fetch(`${API_BASE}/public/pay/vnpay/create`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({
                                        hdon_ma,
                                        amount: dep, // 50% từ server
                                        returnUrl: `${window.location.origin}/khachhang/dat-phong/ket-qua`,
                                    }),
                                });

                                // const js = await payRes.json();
                                // if (js?.pay_url) window.location.href = js.pay_url;
                                const js = await payRes.json();
                                if (js?.pay_url) {
                                    // gắn email người đặt vào query string
                                    const payUrlWithEmail = `${js.pay_url}&email=${encodeURIComponent(booker.email ?? "")}`;
                                    window.location.href = payUrlWithEmail;
                                }
                            }}


                            disabled={!rows.length}
                            className="mt-6 h-12 w-full rounded-md bg-rose-600 text-white font-semibold disabled:opacity-40"
                        >
                            Đặt phòng & Thanh toán cọc {depositPercent}% ({fmtVND(deposit)})
                        </button>
                    </div>


                    {/* Aside tóm tắt */}
                    <aside className="md:col-span-4 rounded-xl border bg-white p-5 shadow-sm md:sticky md:top-24 md:h-max self-start">
                        <div className="mb-3 text-base font-semibold">Đơn đặt phòng của tôi</div>

                        <div className="overflow-hidden rounded-lg border text-sm">
                            {/* Số đêm */}
                            <div className="bg-rose-50 px-3 py-2 font-semibold">{nights} đêm</div>

                            {/* 2 cột ngày vào/ra – thu hẹp để đứng gần nhau */}
                            <div className="px-3 py-3">
                                <div className="mx-auto grid max-w-[260px] grid-cols-2 items-start gap-2">
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

                            {/* Danh sách phòng đã chọn */}
                            <div className="divide-y">
                                {loading && <div className="px-3 py-2 text-xs text-gray-500">Đang tải…</div>}
                                {err && <div className="px-3 py-2 text-xs text-red-600">{err}</div>}
                                {!loading && !rows.length && !err && (
                                    <div className="px-3 py-2 text-xs text-gray-500">Chưa chọn phòng.</div>
                                )}
                                {!loading &&
                                    rows.map((r) => (
                                        <div key={r.LP_MA} className="flex items-center justify-between px-3 py-2">
                                            <div>
                                                <div className="font-semibold text-rose-700">{r.LP_TEN}</div>
                                                <div className="text-xs text-gray-500">
                                                    {fmtVND(r.nightly)}/đêm × {r.qty} phòng
                                                </div>
                                            </div>
                                            <div className="font-semibold">{fmtVND(r.total)}</div>
                                        </div>
                                    ))}
                            </div>

                            {/* Tổng cộng */}
                            <div className="flex items-center justify-between bg-rose-50 px-3 py-3">
                                <div className="text-sm font-medium">Tạm tính</div>
                                <div className="text-lg font-bold text-rose-700">{fmtVND(grandTotal)}</div>
                            </div>
                            <div className="px-3 py-3 space-y-2">

                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-600">Tiền cọc ({depositPercent}%)</div>
                                    <div className="text-base font-semibold text-rose-700">{fmtVND(deposit)}</div>
                                </div>
                            </div>


                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
