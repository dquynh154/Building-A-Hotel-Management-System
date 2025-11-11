'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useGuest } from '@/hooks/useGuest';
import BookingDetailModal from '@/components/ui/modal/BookingDetaiModal';
import ReviewModal from '@/components/ui/modal/ReviewModal';
import { useRouter } from 'next/navigation';

type CTLine = {
    CTDP_ID: number;
    SO_LUONG: number;
    DON_GIA: number;
    TONG_TIEN: number;
    TRANG_THAI: string;
    LOAI_PHONG: { LP_MA: number; LP_TEN: string };
};

type DepositInvoice = {
    HDONG_MA: number;
    HDON_MA: number;
    HDON_TRANG_THAI: 'ISSUED' | 'PAID' | 'VOID' | 'DRAFT';
    HDON_THANH_TIEN: string | number;
} | null;

type Row = {
    HDONG_MA: number;
    HDONG_TRANG_THAI: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';
    HDONG_NGAYDAT: string;
    HDONG_NGAYTRA: string;
    HDONG_TIENCOCYEUCAU: string | number;
    HDONG_TONGTIENDUKIEN: string | number;
    HDONG_TAO_LUC: string;
    CT: CTLine[];
    DEPOSIT_INVOICE: DepositInvoice;
};

const fmtVND = (n: any) => Number(n || 0).toLocaleString('vi-VN');
const fmtDateVN = (iso: string) =>
    new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const statusBadge = (s: Row['HDONG_TRANG_THAI']) => {
    switch (s) {
        case 'PENDING': return { text: 'CHỜ CỌC', cls: 'bg-amber-100 text-amber-700' };
        case 'CONFIRMED': return { text: 'ĐÃ CỌC', cls: 'bg-emerald-100 text-emerald-700' };
        case 'CHECKED_IN': return { text: 'ĐANG Ở', cls: 'bg-sky-100 text-sky-700' };
        case 'CHECKED_OUT': return { text: 'ĐÃ TRẢ', cls: 'bg-slate-100 text-slate-700' };
        case 'CANCELLED': return { text: 'HỦY', cls: 'bg-rose-100 text-rose-700' };
        case 'NO_SHOW': return { text: 'VẮNG MẶT', cls: 'bg-zinc-100 text-zinc-700' };
        default: return { text: s, cls: 'bg-slate-100 text-slate-700' };
    }
};

export default function QuanLyDatPhongPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const { guest, loading: guestLoading } = useGuest();
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const router = useRouter();
    useEffect(() => {
        if (guestLoading) return;
        if (!guest) {
            setLoading(false);
            return; // sẽ show “Bạn chưa đăng nhập”/link đăng nhập bên dưới
        }

        (async () => {
            try {
                setLoading(true);
                const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
                const res = await fetch(
                    `${BASE}/public/khachhang/my-bookings?kh_ma=${guest.KH_MA}`,
                    { credentials: 'include' }
                );
                const json = await res.json();
                setRows(Array.isArray(json?.items) ? json.items : []);
            } catch { }
            finally { setLoading(false); }
        })();
    }, [guestLoading, guest]);

    useEffect(() => {
        if (selectedId) setReviewOpen(true);
    }, [selectedId]);
    const [reviews, setReviews] = useState<number[]>([]); // danh sách HDONG_MA đã được đánh giá tổng thể

    useEffect(() => {
        if (!guest) return;
        const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
        fetch(`${BASE}/public/khachhang/reviews?kh_ma=${guest.KH_MA}`)
            .then(res => res.json())
            .then(json => {
                if (Array.isArray(json.items)) {
                    setReviews(json.items.map((r: any) => r.HDONG_MA));
                }
            })
            .catch(() => { });
    }, [guest]);

    return (
        <div className="mx-auto max-w-5xl px-4 py-8">
            <div className="rounded-2xl border bg-white shadow-sm">
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <h1 className="text-xl md:text-2xl font-bold text-slate-900">
                        Đơn đặt phòng của tôi
                    </h1>

                </div>

                <div className="p-6">
                    {loading && (
                        <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
                            Đang tải danh sách đơn đặt phòng…
                        </div>
                    )}

                    {!loading && rows.length === 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
                            Bạn chưa có đặt phòng nào.
                            <div className="mt-3">
                                <Link
                                    href="/khachhang"
                                    className="font-semibold text-rose-700 hover:underline"
                                >
                                    Đặt phòng ngay
                                </Link>
                            </div>
                        </div>
                    )}

                    {/* Danh sách đơn */}
                    <div className="space-y-4">
                        {rows.map((r) => {
                            const badge = statusBadge(r.HDONG_TRANG_THAI);
                            const depositAmount =
                                (r.DEPOSIT_INVOICE?.HDON_THANH_TIEN ??
                                    r.HDONG_TIENCOCYEUCAU) as number;
                            const canPay =
                                r.HDONG_TRANG_THAI === "PENDING" &&
                                r.DEPOSIT_INVOICE?.HDON_TRANG_THAI !== "PAID";

                            const totalAmount = Number(r.HDONG_TONGTIENDUKIEN || 0);
                            const remain = Math.max(totalAmount - depositAmount, 0);

                            const payHref = canPay
                                ? `/khachhang/pay-mock?hdon_ma=${r.DEPOSIT_INVOICE?.HDON_MA}&amount=${depositAmount}&return=/khachhang/quan-ly-dat-phong`
                                : undefined;

                            const detailHref = `/khachhang/dat-phong/chi-tiet?hd=${r.HDONG_MA}`;
                            const invoiceHref = r.DEPOSIT_INVOICE
                                ? `/khachhang/dat-phong/ket-qua?hdon_ma=${r.DEPOSIT_INVOICE.HDON_MA}`
                                : undefined;


                            return (
                                <div
                                    key={r.HDONG_MA}
                                    className="rounded-xl border bg-white p-4 md:p-5 shadow-[0_1px_0_0_rgba(0,0,0,0.03)]"
                                >
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="font-semibold text-slate-900">
                                            MÃ HỢP ĐỒNG: HD{r.HDONG_MA.toString().padStart(6, "0")}
                                        </div>
                                        <span
                                            className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}
                                        >
                                            {badge.text}
                                        </span>
                                    </div>

                                    <div className="text-sm text-slate-600 mb-1">
                                        Thời gian:{" "}
                                        <b>
                                            14:00 {fmtDateVN(r.HDONG_NGAYDAT)} → 12:00{" "}
                                            {fmtDateVN(r.HDONG_NGAYTRA)}
                                        </b>
                                    </div>

                                    {/* Chi tiết phòng */}
                                    {r.CT?.length > 0 && (
                                        <ul className="mt-2 text-sm text-slate-700 divide-y">
                                            {r.CT.map((ct) => (
                                                <li
                                                    key={ct.CTDP_ID}
                                                    className="flex justify-between py-1.5"
                                                >
                                                    <span>
                                                        {ct.LOAI_PHONG.LP_TEN}{" "}
                                                        <span className="text-slate-500">
                                                            × {ct.SO_LUONG}
                                                        </span>
                                                    </span>
                                                    <span className="font-medium">
                                                        {fmtVND(ct.TONG_TIEN)} ₫
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {/* Tổng hợp thanh toán */}
                                    <div className="mt-3 text-sm text-slate-700 space-y-1">
                                        <div>
                                            Cọc yêu cầu:{" "}
                                            <b className="text-rose-700">
                                                {fmtVND(depositAmount)} ₫
                                            </b>
                                        </div>
                                        <div>
                                            Tổng dự kiến:{" "}
                                            <b className="text-slate-800">
                                                {fmtVND(totalAmount)} ₫
                                            </b>
                                        </div>
                                        {remain > 0 && (
                                            <div>
                                                Còn lại khi nhận phòng:{" "}
                                                <b className="text-emerald-700">{fmtVND(remain)} ₫</b>
                                            </div>
                                        )}
                                    </div>

                                    {/* Footer hành động */}
                                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                                        {/* <button
                                            onClick={() => {
                                                setSelectedId(r.HDONG_MA);
                                                setDetailOpen(true);
                                            }}
                                            className="rounded-md border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                        >
                                            Xem chi tiết
                                        </button> */}


                                        {/* {canPay ? (
                                            <Link
                                                href={payHref!}
                                                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                                            >
                                                Thanh toán cọc
                                            </Link>
                                        ) : invoiceHref ? (
                                            <Link
                                                href={invoiceHref}
                                                className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                                            >
                                                Xem biên nhận
                                            </Link>
                                        ) : null} */}

                                        {canPay ? (
                                            <Link
                                                href={payHref!}
                                                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                                            >
                                                Thanh toán cọc
                                            </Link>
                                        ) : (
                                            (
                                                r.DEPOSIT_INVOICE?.HDON_TRANG_THAI === 'PAID' || // đã thanh toán thì luôn được xem
                                                !(r.HDONG_TRANG_THAI === 'CANCELLED' && r.DEPOSIT_INVOICE?.HDON_TRANG_THAI === 'ISSUED') // ẩn nếu vừa bị hủy + chưa thanh toán
                                            )
                                        ) ? (
                                            <Link
                                                href={invoiceHref || '#'}
                                                className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                                            >
                                                Xem biên nhận
                                            </Link>
                                        ) : null}


                                        {['PENDING', 'CONFIRMED'].includes(r.HDONG_TRANG_THAI) && (
                                            <button
                                                onClick={async () => {
                                                    if (!confirm(
                                                        r.HDONG_TRANG_THAI === 'CONFIRMED'
                                                            ? 'Huỷ đơn này sẽ mất tiền cọc. Bạn có chắc chắn muốn huỷ không?'
                                                            : 'Bạn có chắc chắn muốn huỷ đơn đặt phòng này?'
                                                    )) return;

                                                    try {
                                                        const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
                                                        await fetch(`${BASE}/public/khachhang/cancel-booking`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            credentials: 'include',
                                                            body: JSON.stringify({ kh_ma: guest?.KH_MA, hdong_ma: r.HDONG_MA }),
                                                        });
                                                        alert('Đơn đã được huỷ.');
                                                        // reload danh sách
                                                        const res = await fetch(
                                                            `${BASE}/public/khachhang/my-bookings?kh_ma=${guest?.KH_MA}`,
                                                            { credentials: 'include' }
                                                        );
                                                        const json = await res.json();
                                                        setRows(Array.isArray(json?.items) ? json.items : []);
                                                    } catch (err) {
                                                        alert('Không thể huỷ đơn. Vui lòng thử lại.');
                                                    }
                                                }}
                                                className="rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                                            >
                                                Huỷ đơn
                                            </button>
                                        )}


                                        {r.HDONG_TRANG_THAI === 'CHECKED_OUT' && (
                                            reviews.includes(r.HDONG_MA) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => router.push(`/khachhang/danh-gia?hdong_ma=${r.HDONG_MA}`)}
                                                    className="rounded-md bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
                                                >
                                                    Xem lại đánh giá
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setSelectedId(r.HDONG_MA)}
                                                    className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                                                >
                                                    Đánh giá
                                                </button>
                                            )
                                        )}

                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            <BookingDetailModal
                open={detailOpen}
                bookingId={selectedId}
                onClose={() => {
                    setDetailOpen(false);
                    setSelectedId(null);
                }}
            />
            <ReviewModal
                open={reviewOpen}
                onClose={() => setReviewOpen(false)}
                hdong_ma={selectedId}
                kh_ma={guest?.KH_MA}
                rooms={
                    rows.find(x => x.HDONG_MA === selectedId)?.CT.map(ct => ({
                        CTDP_ID: ct.CTDP_ID,
                        LP_TEN: ct.LOAI_PHONG.LP_TEN,
                        SO_LUONG: ct.SO_LUONG,
                    })) || []
                }
            />

        </div>
    );


}
