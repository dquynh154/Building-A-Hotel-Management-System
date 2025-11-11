'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import Image from "next/image";
function vnd(n: number) { return Number(n || 0).toLocaleString('vi-VN'); }
function fmt(iso?: string | Date) {
    if (!iso) return '—';
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    if (Number.isNaN(+d)) return '—';
    return d.toLocaleString('vi-VN', { hour12: false });
}

export default function InvoicePrintPage() {

    const { id } = useParams() as { id: string };
    const [inv, setInv] = useState<any>(null);
    const pays: Array<{ so_tien: number; thoi_gian: any; phuong_thuc: string; status?: string }> = useMemo(() => {
        const arr = Array.isArray(inv?.THANH_TOAN) ? inv.THANH_TOAN : [];
        return arr.map((p: any) => ({
            so_tien: Number(p?.TT_SO_TIEN ?? p?.so_tien ?? 0),
            thoi_gian: p?.TT_THOI_GIAN ?? p?.TT_NGAY_TAO ?? p?.createdAt ?? p?.thoi_gian,
            phuong_thuc: p?.TT_PHUONG_THUC ?? p?.phuong_thuc ?? '',
            status: (p?.TT_TRANG_THAI_GIAO_DICH ?? p?.status ?? '').toUpperCase(),
        }));
    }, [inv]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/hoadon/${id}`, { params: { _: Date.now() } });
                setInv(data);
            } catch (e: any) {
                alert(e?.response?.data?.message || 'Không tải được hóa đơn');
            } finally {
                setLoading(false);
                setTimeout(() => window.print(), 100);
            }
        })();
    }, [id]);

    if (loading || !inv) return <div className="p-6 text-slate-500">Đang chuẩn bị hóa đơn…</div>;

    // ====== Chuẩn hóa dữ liệu từ API ======
    const kh = inv.KHACH_HANG ?? {};                       // khách chính (đã bổ sung ở BE)
    const b = inv.BOOKING ?? {};                          // <== KHÔNG dùng inv.HOP_DONG nữa
    const rows = inv.CHI_TIET ?? [];                       // BE chưa trả thì sẽ là []

    // Chuẩn hóa mảng thanh toán từ bảng THANH_TOAN (TT_*)

    const tong = Number(inv?.HDON_TONG_TIEN ?? 0);
    const total = Number(inv?.HDON_THANH_TIEN ?? 0);
    const discount = Number(inv?.HDON_GIAM_GIA ?? 0);
    const fee = Number(inv?.HDON_PHI ?? 0);
    const deposit = Number(inv?.HDON_COC_DA_TRU ?? 0);

    const paid = pays
        .filter(p => (p.status ? p.status === 'SUCCEEDED' : true))
        .reduce((s, p) => s + Number(p.so_tien || 0), 0);
    const due = Math.max(0, total - paid);

    const invDate = inv.HDON_NGAYLAP ?? inv.HDON_TAO_LUC ?? inv.createdAt;
    const staff = inv.STAFF ?? null;
    return (
        <div className="mx-auto my-6 w-[840px] bg-white p-8 text-[13px] text-slate-800 print:m-0 print:w-full print:p-0">
            {/* Header */} <div className="mb-4">
                {/* Logo (trên cùng, canh giữa) */}
                <div className="flex justify-center">
                    <Image
                        className="dark:hidden"
                        src="/images/logo/logo-5.png"
                        alt="Logo"
                        width={150}
                        height={40}
                        priority
                    />

                </div>

                {/* Tiêu đề hóa đơn (giữa) */}
                <div className="mt-2 text-center">
                    <div className="font-semibold">Khách sạn Wendy</div>
                    <div className="text-2xl font-extrabold tracking-wide">HÓA ĐƠN BÁN HÀNG</div>
                    <div className="mt-1 text-sm opacity-70">
                        Số: {inv.HDON_SO ?? inv.HDON_MA} &nbsp;•&nbsp; Ngày: {fmt(inv.HDON_NGAYLAP ?? inv.HDON_TAO_LUC ?? inv.createdAt)}
                    </div>

                    <div className="opacity-70">ĐC: 14 Phan Đình Phùng, phường Ninh Kiều, Cần Thơ | SDT: 0123456789</div>
                    <div className="opacity-70"></div>
                </div>

            </div>

            {/* Thông tin KH / Booking */}
            <div className="mt-4 grid grid-cols-2 gap-6">
                <div>
                    <div><span className="opacity-70">Khách hàng:</span> <b>{kh.KH_HOTEN || '—'}</b></div>
                    {kh.KH_DIACHI && <div><span className="opacity-70">Địa chỉ:</span> {kh.KH_DIACHI}</div>}
                    {kh.KH_SDT && <div><span className="opacity-70">SDT:</span> {kh.KH_SDT}</div>}

                </div>
                <div className="text-right">
                    <div><span className="opacity-70">Mã HĐ:</span> <b>{b.HDONG_MA ?? '—'}</b></div>
                    <div><span className="opacity-70">Đặt:</span> {fmt(b.HDONG_NGAYDAT)} → {fmt(b.HDONG_NGAYTRA)}</div>
                    <div><span className="opacity-70">Ở:</span> {fmt(b.HDONG_NGAYTHUCNHAN)} → {fmt(b.HDONG_NGAYTHUCTRA)}</div>
                </div>
            </div>

            {/* Bảng chi tiết (ẩn nếu chưa có dữ liệu) */}
            {rows.length > 0 && (
                <table className="mt-6 w-full border-collapse">
                    <thead>
                        <tr className="border-y">
                            <th className="py-2 text-left">Diễn giải</th>
                            <th className="py-2 w-20 text-right">SL</th>
                            <th className="py-2 w-32 text-right">Đơn giá</th>
                            <th className="py-2 w-32 text-right">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r: any, i: number) => (
                            <tr key={i} className="border-b">
                                <td className="py-1">{r.dien_giai}</td>
                                <td className="py-1 text-right tabular-nums">{r.so_luong ?? 1}</td>
                                <td className="py-1 text-right tabular-nums">{vnd(Number(r.don_gia || 0))}</td>
                                <td className="py-1 text-right tabular-nums font-medium">{vnd(Number(r.thanh_tien || 0))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* Tổng hợp */}
            <div className="mt-4 grid grid-cols-[1fr_auto] items-start"><div />
                <div className="inline-grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 min-w-[260px]">
                    <span className="opacity-70">Tổng cộng:</span> <span className="text-right tabular-nums">{vnd(tong)}</span>
                    <span className="opacity-70">Giảm giá:</span> <span className="text-right tabular-nums">-{vnd(discount)}</span>
                    <span className="opacity-70">Phí:</span> <span className="text-right tabular-nums">+{vnd(fee)}</span>
                    <span className="opacity-70">Tiền cọc:</span> <span className="text-right tabular-nums">-{vnd(deposit)}</span>
                    <span className="opacity-70 font-semibold">Thành tiền:</span> <span className="text-right tabular-nums font-semibold">{vnd(total)}</span>
                    <span className="opacity-70">Đã thanh toán:</span> <span className="text-right tabular-nums">{vnd(paid)}</span>
                    <span className="opacity-70">Còn lại:</span> <span className="text-right tabular-nums">{vnd(due)}</span>
                </div>
            </div>

            {/* <div className="mt-4 grid grid-cols-[1fr_auto] items-start"> <div />
                <div className="inline-grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 min-w-[260px]">

                    <span className="opacity-70">Tổng cộng:</span>
                    <span className="text-right tabular-nums font-semibold">{vnd(total)}
                    </span> <span className="opacity-70">Đã thanh toán:</span>
                    <span className="text-right tabular-nums">{vnd(paid)} </span>
                    <span className="opacity-70">Còn lại:</span>
                    <span className="text-right tabular-nums">{vnd(due)}</span>
                </div>
                 </div> */}

            {/* Chi tiết thanh toán */}
            {/* {pays.length > 0 && (
                <div className="mt-4">
                    <div className="mb-1 font-medium">Chi tiết thanh toán</div>
                    {pays.map((p, i) => (
                        <div key={i} className="flex justify-between text-sm">
                            <span>{fmt(p.thoi_gian)} — {p.phuong_thuc || '—'}</span>
                            <span className="tabular-nums">{vnd(p.so_tien)}</span>
                        </div>
                    ))}
                </div>
            )} */}

            {/* Ký tên */}
            <div className="mt-10 grid grid-cols-3 text-center">
                <div>Người lập {staff?.NV_HOTEN && <div className="mt-10 font-medium">{staff.NV_HOTEN}</div>}</div>
                <div>Người thu</div>
                <div>Khách hàng</div>
            </div>

            <style jsx global>{`
        @media print {
          @page { margin: 12mm; }
          body { background: white; }
        }
      `}</style>
        </div>
    );
}
