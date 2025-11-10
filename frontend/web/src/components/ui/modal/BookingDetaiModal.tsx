'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Link from 'next/link';

const fmtVND = (n: any) => Number(n || 0).toLocaleString('vi-VN');
const fmtDateVN = (iso: string) =>
    new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function BookingDetailModal({
    open,
    onClose,
    bookingId,
}: {
    open: boolean;
    onClose: () => void;
    bookingId?: number | null;
}) {
    const [data, setData] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !bookingId) return;
        const fetchDetail = async () => {
            try {
                setLoading(true);
                const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
                const res = await fetch(`${BASE}/public/khachhang/my-bookings/${bookingId}`, {
                    credentials: 'include',
                });
                const json = await res.json();
                setData(json);
            } finally {
                setLoading(false);
            }
        };
        fetchDetail();
    }, [open, bookingId]);

    if (!open) return null;

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-3xl p-6">
            <h2 className="text-lg font-semibold mb-4">Chi tiết đơn đặt phòng</h2>

            {loading && <p className="text-slate-600">Đang tải...</p>}

            {!loading && data && (
                <div className="space-y-3 text-sm text-slate-700">
                    <div className="flex justify-between">
                        <div>Mã hợp đồng:</div>
                        <div className="font-semibold">HD{String(data.HDONG_MA).padStart(6, '0')}</div>
                    </div>
                    <div className="flex justify-between">
                        <div>Trạng thái:</div>
                        <div className="font-semibold">{data.HDONG_TRANG_THAI}</div>
                    </div>
                    <div className="flex justify-between">
                        <div>Thời gian:</div>
                        <div>
                            14:00 {fmtDateVN(data.HDONG_NGAYDAT)} → 12:00 {fmtDateVN(data.HDONG_NGAYTRA)}
                        </div>
                    </div>

                    <div className="border-t pt-3">
                        <div className="font-semibold mb-2">Phòng đã đặt</div>
                        <ul className="space-y-1">
                            {data.CT?.map((ct: any) => (
                                <li key={ct.CTDP_ID} className="flex justify-between">
                                    <span>
                                        {ct.LOAI_PHONG.LP_TEN} × {ct.SO_LUONG}
                                    </span>
                                    <span>{fmtVND(ct.TONG_TIEN)} ₫</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {data.LUU_TRU_KHACH?.length > 0 && (
                        <div className="border-t pt-3">
                            <div className="font-semibold mb-2">Khách lưu trú</div>
                            <ul className="space-y-1">
                                {data.LUU_TRU_KHACH.map((g: any) => (
                                    <li key={g.KH_MA}>
                                        {g.KHACH_HANG?.KH_HOTEN}
                                        {g.LA_KHACH_CHINH && (
                                            <span className="ml-2 text-xs text-emerald-600">(Khách chính)</span>
                                        )}
                                        {g.LA_KHACH_DAT && (
                                            <span className="ml-2 text-xs text-blue-600">(Người đặt)</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="border-t pt-3 space-y-1">
                        <div>
                            Cọc yêu cầu:{' '}
                            <b className="text-rose-700">{fmtVND(data.HDONG_TIENCOCYEUCAU)} ₫</b>
                        </div>
                        <div>
                            Tổng dự kiến:{' '}
                            <b className="text-slate-800">{fmtVND(data.HDONG_TONGTIENDUKIEN)} ₫</b>
                        </div>
                    </div>

                    {data.DEPOSIT_INVOICE && (
                        <div className="border-t pt-3">
                            <div className="font-semibold mb-1">Hóa đơn cọc</div>
                            <div className="text-sm text-slate-600">
                                Mã hóa đơn: {data.DEPOSIT_INVOICE.HDON_MA}
                            </div>
                            <div className="text-sm text-slate-600">
                                Trạng thái: {data.DEPOSIT_INVOICE.HDON_TRANG_THAI}
                            </div>
                            <Link
                                href={`/khachhang/dat-phong/ket-qua?hdon_ma=${data.DEPOSIT_INVOICE.HDON_MA}`}
                                className="mt-2 inline-block rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                                Xem biên nhận
                            </Link>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
