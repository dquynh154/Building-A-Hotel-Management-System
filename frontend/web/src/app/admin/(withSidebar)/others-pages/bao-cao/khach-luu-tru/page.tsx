"use client";

import { useState } from "react";
import api from "@/lib/api";
import DatePicker from "@/components/form/date-picker";
import { Print, TrashBinIcon } from "@/icons";

const toYMD = (value: string) => {
    if (!value) return "";
    const [d, m, y] = value.split("-");
    return `${y}-${m}-${d}`;
};

function formatDateTime(value: string | Date) {
    if (!value) return "";
    const d = new Date(value);
    return d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function GuestStayReport() {
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [items, setItems] = useState([]);

    const [loading, setLoading] = useState(false);
    const [canPrint, setCanPrint] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await api.get("/bao-cao/khach-luu-tru", {
                params: { from, to }
            });
            setItems(res.data.items || []);

            setCanPrint((res.data.items || []).length > 0);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
         <title>Báo cáo khách lưu trú</title>
        <div className="space-y-6">
            <h1 className="text-2xl font-semibold">Báo cáo khách lưu trú</h1>

            {/* Bộ lọc */}
            <div className="grid grid-cols-4 gap-4 bg-white p-4 rounded-lg border">

                <div>
                    <label className="text-xs text-slate-500">Từ ngày</label>
                    <DatePicker
                        id="fromDate"
                        placeholder="Chọn ngày"
                        allowPastDates
                        onChange={(d, str) => setFrom(toYMD(str))}
                    />
                </div>

                <div>
                    <label className="text-xs text-slate-500">Đến ngày</label>
                    <DatePicker
                        id="toDate"
                        placeholder="Chọn ngày"
                        allowPastDates
                        onChange={(d, str) => setTo(toYMD(str))}
                    />
                </div>

                <div className="flex items-end">
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md shadow hover:bg-blue-500 disabled:opacity-50"
                    >
                        {loading ? "Đang tải..." : "Áp dụng"}
                    </button>
                </div>
                <div className="flex items-end">
                    <a
                        href={
                            canPrint
                                ? `/admin/others-pages/bao-cao/khach-luu-tru/print?from=${from}&to=${to}`
                                : undefined
                        }
                        onClick={(e) => {
                            if (!canPrint) e.preventDefault();
                        }}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`
            flex items-center justify-center
            w-12 h-11 rounded-md shadow transition
            ${canPrint
                                ? "bg-green-600 text-white hover:bg-green-500 cursor-pointer"
                                : "bg-gray-300 text-white cursor-not-allowed opacity-60"
                            }
        `}
                    >
                        <Print />
                    </a>
                </div>

                

            </div>

            {/* Bảng kết quả */}
            <div className="bg-white rounded-lg border p-4 overflow-auto">
                <table className="min-w-full text-sm">
                    <thead>
                        <tr className="bg-slate-100">
                            <th className="px-3 py-2 text-left">Hợp đồng</th>
                            <th className="px-3 py-2 text-left">Tên khách</th>
                            <th className="px-3 py-2 text-left">CCCD</th>
                            <th className="px-3 py-2 text-left">Số điện thoại</th>
                            <th className="px-3 py-2 text-left">Địa chỉ</th>
                            <th className="px-3 py-2 text-left">Phòng</th>
                            <th className="px-3 py-2 text-left">Từ ngày</th>
                            <th className="px-3 py-2 text-left">Đến ngày</th>
                        </tr>
                    </thead>

                    <tbody>
                        {items.map((it: any) => (
                            it.guests.map((g: any, idx: number) => (
                                <tr
                                    key={it.hopDong + "-" + g.name}
                                    className={idx !== 0 ? "" : "border-t"}
                                >
                                    {/* Mã hợp đồng — chỉ hiển thị ở dòng đầu */}
                                    <td className="px-3 py-2">
                                        {idx === 0 ? `HD000${it.hopDong}` : ""}
                                    </td>

                                    {/* Tên khách */}
                                    <td className="px-3 py-2">{g.name}</td>

                                    {/* CCCD */}
                                    <td className="px-3 py-2">{g.cccd || "—"}</td>

                                    {/* SĐT */}
                                    <td className="px-3 py-2">{g.phone || "—"}</td>

                                    {/* Địa chỉ */}
                                    <td className="px-3 py-2">{g.address || "—"}</td>

                                    {/* Phòng — chỉ hiển thị ở dòng đầu */}
                                    <td className="px-3 py-2">
                                        {idx === 0 ? it.rooms.map((r: any) => r.room).join(", ") : ""}
                                    </td>

                                    {/* Từ ngày — chỉ hiển thị ở dòng đầu */}
                                    <td className="px-3 py-2">
                                        {idx === 0 ? formatDateTime(it.stayFrom) : ""}
                                    </td>

                                    {/* Đến ngày — chỉ hiển thị ở dòng đầu */}
                                    <td className="px-3 py-2">
                                        {idx === 0 ? formatDateTime(it.stayTo) : ""}
                                    </td>
                                </tr>
                            ))
                        ))}

                        {items.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center text-slate-400 py-4">
                                    Không có dữ liệu.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
        </>
    );
}
