"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type ServiceRequest = {
    HDONG_MA: number;
    PHONG_MA: number;
    PHONG_TEN?: string;
    CTSD_STT: number;
    DV_MA: number;
    CTDV_STT: number;
    DICH_VU_TEN: string;
    KH_HOTEN: string;
    REQUEST_TIME: string;
    CTDV_TRANGTHAI: string;
};

export default function ServiceHistoryPage() {
    const [items, setItems] = useState<ServiceRequest[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<"ALL" | "PENDING" | "ACTIVE" | "CANCELLED">("ALL");

    async function loadHistory() {
        setLoading(true);
        try {
            const res = await api.get("/requests/service/history");
            setItems(res.data || []);
        } catch (err) {
            console.error("Lỗi tải lịch sử:", err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadHistory();
    }, []);

    async function handleAction(it: ServiceRequest, action: "approve" | "reject") {
        try {
            const payload = {
                HDONG_MA: it.HDONG_MA,
                PHONG_MA: it.PHONG_MA,
                CTSD_STT: it.CTSD_STT,
                DV_MA: it.DV_MA,
                CTDV_STT: it.CTDV_STT,
            };

            const res = await api.post(`/requests/service/${action}`, payload);

            if (res.status >= 200 && res.status < 300) {
                // ✔ Không xoá item — chỉ cập nhật trạng thái
                setItems(prev =>
                    prev.map(x =>
                        x.CTDV_STT === it.CTDV_STT
                            ? { ...x, CTDV_TRANGTHAI: action === "approve" ? "ACTIVE" : "CANCELLED" }
                            : x
                    )
                );
            }
        } catch (err) {
            console.error("Lỗi xử lý yêu cầu:", err);
        }
    }

    const filtered = items.filter(it =>
        filter === "ALL" ? true : it.CTDV_TRANGTHAI === filter
    );

    return (
        <>
        <title>Lịch sử yêu cầu dịch vụ</title>
        
        <div className="mx-auto max-w-5xl p-6">
            <h1 className="text-2xl font-bold mb-4">Lịch sử yêu cầu dịch vụ</h1>

            {/* Bộ lọc */}
            <div className="flex gap-2 mb-4">
                {["ALL", "PENDING", "ACTIVE", "CANCELLED"].map(st => (
                    <button
                        key={st}
                        onClick={() => setFilter(st as any)}
                        className={`px-4 py-1.5 rounded-md border text-sm ${filter === st ? "bg-blue-600 text-white" : "bg-white hover:bg-gray-100"
                            }`}
                    >
                        {st === "ALL"
                            ? "Tất cả"
                            : st === "PENDING"
                                ? "Chờ duyệt"
                                : st === "ACTIVE"
                                    ? "Đã chấp nhận"
                                    : "Đã từ chối"}
                    </button>
                ))}
            </div>

            {/* Danh sách */}
            <div className="bg-white shadow rounded-lg border p-4">
                {loading && (
                    <div className="p-4 text-gray-500 text-center">Đang tải...</div>
                )}

                {!loading && filtered.length === 0 && (
                    <div className="p-4 text-gray-500 text-center">
                        Không có yêu cầu nào.
                    </div>
                )}

                <ul className="space-y-4">
                    {filtered.map(it => (
                        <li key={it.CTDV_STT} className="border rounded-md p-4">
                            <div className="flex justify-between">
                                <div>
                                    <div className="text-sm">
                                        <b>{it.KH_HOTEN}</b> yêu cầu <b>{it.DICH_VU_TEN}</b>{" "}
                                        cho phòng <b>{it.PHONG_TEN || `#${it.PHONG_MA}`}</b>
                                    </div>
                                    <div className="text-gray-500 text-sm">HĐ #{it.HDONG_MA}</div>
                                    <div className="text-xs text-gray-400">
                                        Lúc: {new Date(it.REQUEST_TIME).toLocaleString("vi-VN")}
                                    </div>
                                </div>

                                {/* TRẠNG THÁI */}
                                <div className="flex flex-col items-end gap-2 text-sm font-semibold">
                                    {it.CTDV_TRANGTHAI === "PENDING" && (
                                        <>
                                            <span className="text-amber-600">Chờ duyệt</span>

                                            {/* Nút xử lý */}
                                            <button
                                                onClick={() => handleAction(it, "approve")}
                                                className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                            >
                                                Chấp nhận
                                            </button>
                                            <button
                                                onClick={() => handleAction(it, "reject")}
                                                className="px-3 py-1 text-xs bg-rose-600 text-white rounded hover:bg-rose-700"
                                            >
                                                Từ chối
                                            </button>
                                        </>
                                    )}

                                    {it.CTDV_TRANGTHAI === "ACTIVE" && (
                                        <span className="text-green-600">Đã chấp nhận</span>
                                    )}
                                    {it.CTDV_TRANGTHAI === "CANCELLED" && (
                                        <span className="text-red-600">Đã từ chối</span>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
        </>
    );
}
