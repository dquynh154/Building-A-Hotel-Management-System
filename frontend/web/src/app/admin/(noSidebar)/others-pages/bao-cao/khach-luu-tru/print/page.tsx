"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useSearchParams } from "next/navigation";

function formatDateTime(dt: string) {
    const d = new Date(dt);
    return d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function GuestStayPrintPage({ searchParams }: any) {
    const params = useSearchParams();      // ← dùng hook
    const from = params.get("from") || "";
    const to = params.get("to") || "";

    const [items, setItems] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const res = await api.get("/bao-cao/khach-luu-tru", {
                params: { from, to }
            });

            // Dữ liệu giống FE: mỗi phần tử là 1 hợp đồng
            setItems(res.data.items || []);
        };

        fetchData();
    }, [from, to]);



    useEffect(() => {
        // delay 300ms để đảm bảo DOM đã render xong
        const t = setTimeout(() => window.print(), 300);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="p-10 print:p-0 text-black max-w-4xl mx-auto">

            {/* Header */}
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold">KHÁCH SẠN WENDY</h1>
                <p>Địa chỉ: Khu II, Đ. 3 Tháng 2, Xuân Khánh, Ninh Kiều, Cần Thơ</p>
                <p>SĐT: 0123456789</p>
            </div>

            <h2 className="text-xl font-semibold text-center mb-6">
                BÁO CÁO KHÁCH LƯU TRÚ
            </h2>

            <p className="mb-2">
                <strong>Từ ngày:</strong> {from} &nbsp;
                <strong>Đến ngày:</strong> {to}
            </p>

            {/* Table */}
            <table className="w-full border-collapse" style={{ fontSize: "14px" }}>
                <thead>
                    <tr>
                        <th className="border p-2">Hợp đồng</th>
                        <th className="border p-2">Tên khách</th>
                        <th className="border p-2">CCCD</th>
                        <th className="border p-2">SĐT</th>
                        <th className="border p-2">Địa chỉ</th>
                        <th className="border p-2">Phòng</th>
                        <th className="border p-2">Từ ngày</th>
                        <th className="border p-2">Đến ngày</th>
                    </tr>
                </thead>

                <tbody>
                    {items.map((it: any) =>
                        it.guests.map((g: any, idx: number) => (    
                            <tr key={it.hopDong + "-" + idx}>
                                {/* Hợp đồng – chỉ dòng đầu */}
                                <td className="border p-2 text-center">
                                    {idx === 0 ? `#${it.hopDong}` : ""}
                                </td>

                                {/* Tên khách */}
                                <td className="border p-2">{g.name}</td>

                                {/* CCCD */}
                                <td className="border p-2 text-center">
                                    {g.cccd || "—"}
                                </td>

                                {/* SĐT */}
                                <td className="border p-2 text-center">
                                    {g.phone || "—"}
                                </td>

                                {/* Địa chỉ */}
                                <td className="border p-2">
                                    {g.address || "—"}
                                </td>

                                {/* Phòng – chỉ dòng đầu */}
                                <td className="border p-2">
                                    {idx === 0 ? it.rooms.map((r: any) => r.room).join(", ") : ""}
                                </td>

                                {/* Từ ngày – chỉ dòng đầu */}
                                <td className="border p-2">
                                    {idx === 0 ? formatDateTime(it.stayFrom) : ""}
                                </td>

                                {/* Đến ngày – chỉ dòng đầu */}
                                <td className="border p-2">
                                    {idx === 0 ? formatDateTime(it.stayTo) : ""}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>

            </table>

            <div className="mt-10 text-right pr-10">
                <p>Ngày ..... tháng ..... năm 20....</p>
                <p className="mt-6 font-semibold">Người lập báo cáo</p>
                <p>(Ký, ghi rõ họ tên)</p>
            </div>
        </div>
    );
}
