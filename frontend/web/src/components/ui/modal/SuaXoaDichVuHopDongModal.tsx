"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { PencilIcon, TrashBinIcon } from "@/icons";

type ServiceLineForModal = {
    lineStt: number;   // CTDV_STT
    PHONG_MA: number;
    roomName: string;
    ctsdLineId: number; // CTSD_STT
    DV_MA: number;
    dvTen: string;
    ngay: string;       // ISO string
    so_luong: number;
    don_gia: number;
    thanh_tien: number;
};

type LocalRow = ServiceLineForModal & {
    newQty: number;
    saving?: boolean;
    deleting?: boolean;
};

interface Props {
    open: boolean;
    bookingId: number;

    // để show tiêu đề
    roomName: string;
    serviceName: string;

    // danh sách record raw (thường là filter từ detail.services)
    records: ServiceLineForModal[];

    onClose: () => void;
    onChanged?: () => void; // gọi lại để reload chi tiết HĐ ở ngoài
}

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

function formatCurrency(v: number) {
    return v.toLocaleString("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
    });
}

export default function SuaXoaDichVuHopDongModal({
    open,
    bookingId,
    roomName,
    serviceName,
    records,
    onClose,
    onChanged,
}: Props) {
    const [rows, setRows] = useState<LocalRow[]>([]);

    // mỗi lần mở modal (hoặc records đổi) thì sync lại state
    useEffect(() => {
        if (!open) return;
        setRows(
            (records || []).map((r) => ({
                ...r,
                newQty: r.so_luong,
                saving: false,
                deleting: false,
            }))
        );
    }, [open, records]);

    const totalAll = useMemo(
        () => rows.reduce((sum, r) => sum + r.don_gia * r.newQty, 0),
        [rows]
    );

    if (!open) return null;

    const handleQtyChange = (index: number, value: string) => {
        const num = Number(value);
        if (isNaN(num) || num < 0) return;

        setRows((prev) =>
            prev.map((r, i) => (i === index ? { ...r, newQty: num } : r))
        );
    };

    const handleUpdateRow = async (row: LocalRow) => {
        if (row.newQty <= 0) {
            alert("Số lượng phải lớn hơn 0.");
            return;
        }
        if (row.newQty === row.so_luong) {
            // không đổi gì thì thôi
            return;
        }

        setRows((prev) =>
            prev.map((r) =>
                r.lineStt === row.lineStt ? { ...r, saving: true } : r
            )
        );

        try {
            await api.put(`/bookings/${bookingId}/services/${row.lineStt}`, {
                PHONG_MA: row.PHONG_MA,
                CTSD_STT: row.ctsdLineId,
                DV_MA: row.DV_MA,
                CTDV_SOLUONG: row.newQty,
                CTDV_DONGIA: row.don_gia,
                CTDV_NGAY: row.ngay,
            });

            // cập nhật lại state local
            setRows((prev) =>
                prev.map((r) =>
                    r.lineStt === row.lineStt
                        ? {
                            ...r,
                            so_luong: row.newQty,
                            thanh_tien: row.don_gia * row.newQty,
                            saving: false,
                        }
                        : r
                )
            );

            onChanged?.();
        } catch (err) {
            console.error(err);
            alert("Cập nhật dịch vụ thất bại.");
            setRows((prev) =>
                prev.map((r) =>
                    r.lineStt === row.lineStt ? { ...r, saving: false } : r
                )
            );
        }
    };

    const handleDeleteRow = async (row: LocalRow) => {
        if (!confirm("Bạn có chắc muốn xóa dòng dịch vụ này không?")) return;

        setRows((prev) =>
            prev.map((r) =>
                r.lineStt === row.lineStt ? { ...r, deleting: true } : r
            )
        );

        try {
            await api.delete(`/bookings/${bookingId}/services/${row.lineStt}`);

            setRows((prev) => prev.filter((r) => r.lineStt !== row.lineStt));
            onChanged?.();
        } catch (err) {
            console.error(err);
            alert("Xóa dịch vụ thất bại.");
            setRows((prev) =>
                prev.map((r) =>
                    r.lineStt === row.lineStt ? { ...r, deleting: false } : r
                )
            );
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-4xl rounded-xl bg-white shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between border-b px-6 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-slate-800">
                            Chi tiết dịch vụ hợp đồng
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Phòng <span className="font-medium">{roomName}</span> – Dịch vụ{" "}
                            <span className="font-medium">{serviceName}</span>
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="max-h-[480px] overflow-auto px-6 py-4">
                    {rows.length === 0 ? (
                        <div className="py-6 text-center text-sm text-slate-500">
                            Không có bản ghi dịch vụ nào.
                        </div>
                    ) : (
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600">
                                <tr>
                                    <th className="px-3 py-2 text-left">Thời gian</th>
                                    <th className="px-3 py-2 text-right">Số lượng</th>
                                    <th className="px-3 py-2 text-right">Đơn giá</th>
                                    <th className="px-3 py-2 text-right">Thành tiền</th>
                                    <th className="px-3 py-2 text-center w-28">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, idx) => {
                                    const lineTotal = r.don_gia * r.newQty;
                                    const isBusy = r.saving || r.deleting;

                                    return (
                                        <tr key={r.lineStt} className="border-t border-slate-200">
                                            <td className="px-3 py-2">
                                                {formatDateTime(r.ngay)}
                                            </td>

                                            <td className="px-3 py-2 text-right">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    className="w-20 rounded border px-2 py-1 text-right"
                                                    value={r.newQty}
                                                    onChange={(e) =>
                                                        handleQtyChange(idx, e.target.value)
                                                    }
                                                    disabled={isBusy}
                                                />
                                            </td>

                                            <td className="px-3 py-2 text-right">
                                                {formatCurrency(Number(r.don_gia))}
                                            </td>

                                            <td className="px-3 py-2 text-right">
                                                {formatCurrency(Number(lineTotal))}
                                            </td>

                                            <td className="px-3 py-2">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => handleUpdateRow(r)}
                                                        disabled={isBusy || r.newQty === r.so_luong}
                                                        className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                                                    >
                                                        {r.saving ? (
                                                            <span className="text-[11px]">...</span>
                                                        ) : (
                                                            <PencilIcon className="w-5 h-5" />
                                                        )}
                                                    </button>

                                                    <button
                                                        onClick={() => handleDeleteRow(r)}
                                                        disabled={isBusy}
                                                        className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
                                                    >
                                                        {r.deleting ? (
                                                            <span className="text-[11px]">...</span>
                                                        ) : (
                                                            <TrashBinIcon className="w-5 h-5" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>

                            <tfoot>
                                <tr className="border-t border-slate-300 bg-slate-50">
                                    <td className="px-3 py-2 text-right font-medium" colSpan={3}>
                                        Tổng cộng
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold">
                                        {formatCurrency(Number(totalAll))}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
                    <button
                        onClick={onClose}
                        className="rounded-md border border-slate-300 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    );
}
