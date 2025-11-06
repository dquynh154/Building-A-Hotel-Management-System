'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useGuest } from '@/hooks/useGuest';

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


    return (
        <div className="mx-auto max-w-5xl px-4 py-8">
            {/* Card bọc toàn trang */}
            <div className="rounded-2xl border bg-white shadow-sm">
                {/* Header của card */}
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <h1 className="text-xl md:text-2xl font-bold text-slate-900">Đơn đặt phòng của tôi</h1>
                </div>

                {/* Body của card */}
                <div className="p-6">
                    {loading && (
                        <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">Đang tải…</div>
                    )}

                    {!loading && rows.length === 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
                            Bạn chưa có đặt phòng nào.
                            <div className="mt-3">
                                <Link href="/khachhang" className="font-semibold text-rose-700 hover:underline">
                                    Đặt phòng ngay
                                </Link>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        {rows.map((r) => {
                            const status = r.HDONG_TRANG_THAI;
                            const canPayDeposit =
                                status === 'PENDING' &&
                                r.DEPOSIT_INVOICE &&
                                r.DEPOSIT_INVOICE.HDON_TRANG_THAI !== 'PAID';

                            const depositAmount =
                                (r.DEPOSIT_INVOICE?.HDON_THANH_TIEN ?? r.HDONG_TIENCOCYEUCAU) as number;

                            const returnUrl = encodeURIComponent('/khachhang/quan-ly-dat-phong');
                            const payHref = canPayDeposit
                                ? `/khachhang/pay-mock?hdon_ma=${r.DEPOSIT_INVOICE!.HDON_MA}&amount=${depositAmount}&return=${returnUrl}`
                                : undefined;

                            const contractHref = `/khachhang/dat-phong/chi-tiet?hd=${r.HDONG_MA}`;
                            const badge = statusBadge(status);
                            const detailHref = r.DEPOSIT_INVOICE
                                ? `/khachhang/dat-phong/ket-qua?hdon_ma=${r.DEPOSIT_INVOICE.HDON_MA}`
                                : `/khachhang/dat-phong/ket-qua?hd=${r.HDONG_MA}`;
                            const receiptHref = r.DEPOSIT_INVOICE
                                ? `/khachhang/dat-phong/ket-qua?hdon_ma=${r.DEPOSIT_INVOICE.HDON_MA}`
                                : undefined; 
                            return (
                                <div
                                    key={r.HDONG_MA}
                                    className="rounded-xl border bg-white p-4 md:p-5 shadow-[0_1px_0_0_rgba(0,0,0,0.02)]"
                                >
                                    {/* Top row: mã + trạng thái */}
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-base font-semibold text-slate-900">MÃ HỢP ĐỒNG: HD000{r.HDONG_MA}</div>
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>
                                            {badge.text}
                                        </span>
                                    </div>

                                    {/* Ngày nhận/trả */}
                                    <div className="mt-1 text-sm text-slate-600">
                                        <div className='text-base'>Thời gian: 
                                        14:00   {fmtDateVN(r.HDONG_NGAYDAT)} <span className="mx-1 text-slate-400">→</span>{' '}
                                        12:00   {fmtDateVN(r.HDONG_NGAYTRA)}
                                        </div>
                                    </div>

                                    {/* Dòng loại phòng */}
                                    {r.CT.length > 0 && (
                                        <div className="mt-3 space-y-1 text-sm">
                                            {r.CT.map((c) => (
                                                <div key={c.CTDP_ID} className="flex items-center justify-between">
                                                    <span className="text-slate-700">
                                                        {c.LOAI_PHONG.LP_TEN}{' '}
                                                        <span className="text-slate-500">× {c.SO_LUONG}</span>
                                                    </span>
                                                    <span className="font-medium text-slate-900">{fmtVND(c.TONG_TIEN)} đ</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Cọc + hành động */}
                                    <div className="mt-4 flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
                                        <div className="text-sm text-slate-600">
                                            Cọc yêu cầu:&nbsp;
                                            <b className="text-rose-700">{fmtVND(depositAmount)} đ</b>
                                        </div>

                                        <div className="flex gap-2">
                                            <Link
                                                href={contractHref}
                                                className="rounded-md border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                            >
                                                Xem chi tiết
                                            </Link>

                                            {canPayDeposit ? (
                                                <Link
                                                    href={payHref!}
                                                    className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                                                >
                                                    Thanh toán cọc
                                                </Link>
                                            ) : (
                                                    receiptHref && (
                                                        <Link
                                                            href={receiptHref}
                                                            className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"
                                                        >
                                                            Xem biên nhận
                                                        </Link>
                                                    )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );

}
