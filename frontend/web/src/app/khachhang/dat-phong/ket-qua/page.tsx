'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";

type InvoiceDetail = {
    HDON_MA: number;
    HDON_TAO_LUC: string;
    HDON_TONG_TIEN?: number;
    HDON_COC_DA_TRU?: number;
    HOP_DONG_DAT_PHONG?: {
        KHACH_HANG?: { KH_HOTEN: string; KH_EMAIL: string; KH_SDT?: string };
        HDONG_NGAYDAT?: string;
        HDONG_NGAYTRA?: string;
        HDONG_NGAYTHUCNHAN?: string;
        HDONG_NGAYTHUCTRA?: string;
        CT_DAT_TRUOC?: {
            SO_LUONG: number;
            DON_GIA: number;
            LOAI_PHONG: { LP_TEN: string };
        }[];
    };
};


const fmtVND = (n?: number) => (n || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });

export default function KetQuaThanhToanPage() {
    const q = useSearchParams();
    const txnRef = q.get('vnp_TxnRef') || q.get('txnRef') || '';
    const hdon = q.get('hdon_ma') || '';
    const [status, setStatus] = useState<'PENDING' | 'SUCCEEDED' | 'FAILED' | 'NOT_FOUND'>('PENDING');
    const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);

    // Poll trạng thái thanh toán
    useEffect(() => {
        let t: any, count = 0;
        const tick = async () => {
            count++;
            try {
                const url = txnRef
                    ? `${API_BASE}/public/pay/status?txnRef=${encodeURIComponent(txnRef)}`
                    : `${API_BASE}/public/pay/status?hdon_ma=${encodeURIComponent(hdon || '')}`;
                const r = await fetch(url, { credentials: 'include' });
                const js = await r.json();
                const s = String(js?.status || 'PENDING').toUpperCase();
                setStatus(s as any);

                if (s === 'SUCCEEDED' || s === 'FAILED' || s === 'NOT_FOUND' || count > 30) {
                    clearTimeout(t);
                    if (s === 'SUCCEEDED') fetchInvoice();
                    return;
                }
            } catch (e) { console.error(e); }
            t = setTimeout(tick, 2000);
        };
        tick();
        return () => clearTimeout(t);
    }, [txnRef, hdon]);

    // Lấy thông tin biên nhận khi thanh toán xong
    async function fetchInvoice() {
        if (!hdon) return;
        const res = await fetch(`${API_BASE}/public/hoa-don/${hdon}`);
        if (res.ok) {
            const js = await res.json();
            setInvoice(js);
        }
    }

    const title =
        status === 'SUCCEEDED' ? 'Biên nhận đặt phòng'
            : status === 'FAILED' ? 'Thanh toán thất bại'
                : status === 'NOT_FOUND' ? 'Không tìm thấy giao dịch'
                    : 'Đang xác thực thanh toán…';

    return (
        <>
            <title>Kết quả giao dịch</title>
        <div className="mx-auto max-w-3xl p-6 text-slate-800">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h1
                    className={`mb-6 text-center font-extrabold tracking-wide ${status === 'SUCCEEDED'
                            ? 'text-3xl text-slate-800'
                            : status === 'FAILED'
                                ? 'text-2xl text-red-600'
                                : status === 'NOT_FOUND'
                                    ? 'text-2xl text-amber-600'
                                    : 'text-2xl text-gray-500 animate-pulse'
                        }`}
                >
                    {title}
                </h1>


                {status === 'PENDING' && (
                    <p className="text-sm text-gray-600">Hệ thống đang chờ xác nhận từ cổng thanh toán…</p>
                )}
                {status === 'FAILED' && (
                    <p className="text-sm text-red-700">Giao dịch không thành công. Vui lòng tạo lại đơn đặt phòng mới</p>
                )}

                {status === 'SUCCEEDED' && invoice && (
                    <div className="mt-6 border-t pt-4">
                        <h2 className="text-lg font-semibold mb-3 text-center"></h2>
                        <div className="grid md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <p><b>Mã hóa đơn:</b> #{invoice.HDON_MA}</p>
                                <p><b>Ngày lập:</b> {new Date(invoice.HDON_TAO_LUC).toLocaleDateString('vi-VN')}</p>
                                <p><b>Khách hàng:</b> {invoice.HOP_DONG_DAT_PHONG?.KHACH_HANG?.KH_HOTEN}</p>
                                <p><b>Email:</b> {invoice.HOP_DONG_DAT_PHONG?.KHACH_HANG?.KH_EMAIL}</p>
                            </div>
                            <div>
                                <p><b>Ngày nhận phòng:</b> {new Date(invoice.HOP_DONG_DAT_PHONG?.HDONG_NGAYDAT ?? '').toLocaleDateString('vi-VN')}</p>
                                <p><b>Ngày trả phòng:</b> {new Date(invoice.HOP_DONG_DAT_PHONG?.HDONG_NGAYTRA ?? '').toLocaleDateString('vi-VN')}</p>
                                {/* <p><b>Ngày nhận phòng:</b> {new Date(invoice.HOP_DONG_DAT_PHONG?.HDONG_NGAYTHUCNHAN || '').toLocaleDateString('vi-VN')}</p>
                                <p><b>Ngày trả phòng:</b> {new Date(invoice.HOP_DONG_DAT_PHONG?.HDONG_NGAYTHUCTRA || '').toLocaleDateString('vi-VN')}</p> */}
                            </div>
                        </div>

                        <div className="mt-4">
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-gray-100 text-left">
                                        <th className="border p-2">Loại phòng</th>
                                        <th className="border p-2">Số lượng (đêm)</th>
                                        <th className="border p-2">Đơn giá</th>
                                        <th className="border p-2">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoice.HOP_DONG_DAT_PHONG?.CT_DAT_TRUOC?.map((ct, i) => (
                                        <tr key={i}>
                                            <td className="border p-2">{ct.LOAI_PHONG.LP_TEN}</td>
                                            <td className="border p-2 text-center">{ct.SO_LUONG}</td>
                                            <td className="border p-2 text-right">{fmtVND(ct.DON_GIA)}</td>
                                            <td className="border p-2 text-right">{fmtVND(ct.DON_GIA * ct.SO_LUONG)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            <div className="mt-4 text-right space-y-1 text-sm">
                                <p>Tiền cọc: <b>{fmtVND(Number(invoice.HDON_COC_DA_TRU))}</b></p>
                                <p>Tổng tiền: <b>{fmtVND(Number(invoice.HDON_TONG_TIEN))}</b></p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-6 flex items-center gap-3 justify-center">
                    <Link href="/khachhang" className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white">
                        Về trang chính
                    </Link>
                    <Link href="/khachhang/quan-ly-dat-phong" className="rounded-md border px-4 py-2 text-sm">
                        Đơn đặt phòng
                    </Link>
                </div>
            </div>
        </div>
        </>
    );
}
