'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export default function PayMockPage() {
    const q = useSearchParams();
    const hdon_ma = Number(q.get('hdon_ma') || 0);

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [counter, setCounter] = useState(300); // 5 phút
    const [info, setInfo] = useState<any>(null);

    // 1) Gọi API lấy thông tin thanh toán
    useEffect(() => {
        if (!hdon_ma) return;

        const fetchData = async () => {
            try {
                const res = await fetch(`${API_BASE}/public/pay/info/${hdon_ma}`);
                const data = await res.json();
                setInfo(data);
            } catch (err) {
                console.error("Lỗi load dữ liệu:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [hdon_ma]);

    // 2) Đếm ngược
    useEffect(() => {
        if (loading) return;
        if (counter <= 0) {
            handleConfirm(false); // auto fail
            return;
        }
        const t = setTimeout(() => setCounter(counter - 1), 1000);
        return () => clearTimeout(t);
    }, [counter, loading]);

    // 3) Xác nhận hoặc Hủy
    const handleConfirm = async (success: boolean) => {
        try {
            setBusy(true);
            await fetch(`${API_BASE}/public/pay/mock/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hdon_ma, success }),
            });

            // Redirect sang trang kết quả
            window.location.href = `/khachhang/dat-phong/ket-qua?hdon_ma=${hdon_ma}`;
        } finally {
            setBusy(false);
        }
    };

    const fmt = (v: any) =>
        Number(v).toLocaleString("vi-VN", { style: "currency", currency: "VND" });

    if (loading || !info) {
        return (
            <div className="mx-auto max-w-xl p-6 text-center text-slate-600">
                Đang tải thông tin thanh toán...
            </div>
        );
    }

    // Format countdown
    const mm = Math.floor(counter / 60);
    const ss = (counter % 60).toString().padStart(2, "0");

    return (
        <>
            <title>Xác nhận thanh toán</title>
        <div className="mx-auto max-w-6xl px-4 py-6 text-slate-800">
            <div className="rounded-2xl border bg-white p-6 md:p-8">
                <div className="relative flex justify-center items-center border-b-4 border-rose-200 pb-3 mb-8">
                    <h2 className="text-lg md:text-2xl font-semibold text-slate-800">
                        Xác nhận thanh toán đặt cọc
                    </h2>
                    <span className="absolute bottom-[-4px] right-0 h-[4px] w-1/3 bg-rose-700"></span>
                    
                    {/* <span className="absolute bottom-[-2px] left-1/2 h-[3px] w-1/3 -translate-x-1/2 bg-rose-600 rounded-full"></span> */}
                </div>

                {/* Header */}
                {/* <div className="bg-blue-600 text-white px-6 py-4">
                    <h1 className="text-xl font-semibold"></h1>
                    
                </div> */}
                
                {/* Countdown */}
                <div className="text-center py-4 bg-blue-50">
                    <span className="text-lg font-bold text-blue-700">
                        Thời gian còn lại: {mm}:{ss}
                    </span>
                    <p className="text-sm opacity-90">
                        Vui lòng không tắt trang khi giao dịch đang được xử lý.
                    </p>
                </div>

                <div className="p-6 space-y-6">

                    {/* THÔNG TIN NGƯỜI THANH TOÁN */}
                    <div className="border rounded-xl p-4 bg-gray-50">
                        <h2 className="font-semibold text-slate-700 mb-2">
                            Thông tin người thanh toán
                        </h2>
                        <p>Khách hàng: <span className="font-medium">{info.KH_TEN}</span></p>
                        <p>Email: <span className="font-medium">{info.KH_EMAIL}</span></p>
                        <p>SĐT: <span className="font-medium">{info.KH_SDT}</span></p>
                    </div>

                    {/* THÔNG TIN GIAO DỊCH */}
                    <div className="border rounded-xl p-4 bg-gray-50">
                        <h2 className="font-semibold text-slate-700 mb-2">
                            Thông tin giao dịch
                        </h2>

                        <p>Mã hoá đơn: <span className="font-medium">{info.HDON_MA}</span></p>
                        <p>Mã giao dịch:
                            <span className="font-medium"> {info.TRANSACTION_ID || "(Chưa có mã giao dịch)"} </span>
                        </p>

                        <p>Thời gian tạo:
                            <span className="font-medium"> {new Date(info.CREATED_AT).toLocaleString("vi-VN")} </span>
                        </p>

                        <p>Số tiền cần thanh toán:
                            <span className="font-semibold text-rose-700"> {fmt(info.TIEN_COC)} </span>
                        </p>
                    </div>

                    {/* DANH SÁCH PHÒNG */}
                    <div className="border rounded-xl p-4 bg-gray-50">
                        <h2 className="font-semibold text-slate-700 mb-3">
                            Danh sách phòng đã đặt
                        </h2>

                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="bg-slate-200 text-slate-700">
                                    <th className="border px-3 py-2 text-left">Loại phòng</th>
                                    <th className="border px-3 py-2 text-center">Số lượng</th>
                                    <th className="border px-3 py-2 text-right">Đơn giá</th>
                                    <th className="border px-3 py-2 text-right">Thành tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {info.PHONG_DA_DAT.map((p: any, idx: number) => (
                                    <tr key={idx} className="border-b">
                                        <td className="border px-3 py-2">{p.LOAI_PHONG}</td>
                                        <td className="border px-3 py-2 text-center">{p.SO_LUONG}</td>
                                        <td className="border px-3 py-2 text-right">{fmt(p.DON_GIA)}</td>
                                        <td className="border px-3 py-2 text-right">{fmt(p.TONG_TIEN)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="pt-4">
                            <p className="font-semibold">
                                Tổng tiền: {fmt(info.TONG_TIEN)}
                            </p>
                            <p className="font-semibold text-rose-700">
                                Tiền cọc cần thanh toán: {fmt(info.TIEN_COC)}
                            </p>
                        </div>
                    </div>

                    {/* BUTTONS */}
                    <div className="flex justify-center gap-4 pt-2">
                        <button
                            disabled={busy}
                            onClick={() => handleConfirm(true)}
                            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium disabled:opacity-60"
                        >
                            {busy ? "Đang xử lý..." : "Xác nhận thanh toán"}
                        </button>

                        <button
                            disabled={busy}
                            onClick={() => handleConfirm(false)}
                            className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-md font-medium disabled:opacity-60"
                        >
                            Hủy thanh toán
                        </button>
                    </div>

                </div>
            </div>
        </div>
        </>
    );
}
