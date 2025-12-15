"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import DatePicker from '@/components/form/date-picker';
type Mode = "DAY" | "HOUR";

interface Props {
    open: boolean;
    bookingId: number | null | undefined;
    mode: Mode; // "DAY" hoặc "HOUR"
    currentFrom?: string | null;
    currentTo?: string | null;
    onClose: () => void;
    onChanged?: (newCheckout: string) => void;
}

function toInputDate(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(+d)) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toInputDateTimeLocal(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(+d)) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${hh}:${mm}`;
}

export default function AdjustReturnDateModal({
    open,
    bookingId,
    mode,
    currentFrom,
    currentTo,
    onClose,
    onChanged,
}: Props) {
    const [submitting, setSubmitting] = useState(false);

    // theo ngày
    const [newDate, setNewDate] = useState("");

    // theo giờ
    const [newDateTime, setNewDateTime] = useState("");
    const [pickerDate, setPickerDate] = useState<Date | undefined>(undefined);

    useEffect(() => {
        if (!open) return;

        if (mode === "DAY") {
            if (currentTo) {
                const d = new Date(currentTo);
                setPickerDate(d);                // ⭐ quan trọng
                setNewDate(toInputDate(currentTo));
            }
        } else {
            setNewDateTime(toInputDateTimeLocal(currentTo || null));
        }
    }, [open, mode]);


    const canSubmit = useMemo(() => {
        if (!bookingId) return false;
        return mode === "DAY" ? !!newDate : !!newDateTime;
    }, [bookingId, mode, newDate, newDateTime]);

    if (!open) return null;

    const handleSubmit = async () => {
        if (!bookingId || !canSubmit) return;

        try {
            setSubmitting(true);
            let newCheckoutIso = "";

            if (mode === "DAY") {
                const d = new Date(`${newDate}T12:00:00`);
                if (isNaN(+d)) {
                    alert("Ngày mới không hợp lệ.");
                    return;
                }
                newCheckoutIso = d.toISOString();
            } else {
                const d = new Date(newDateTime);
                if (isNaN(+d)) {
                    alert("Thời gian mới không hợp lệ.");
                    return;
                }
                newCheckoutIso = d.toISOString();
            }

            // ============================
            //  CALL API mới: adjust-checkout
            // ============================
            const res = await api.post(`/bookings/${bookingId}/adjust-checkout`, {
                newCheckout: newCheckoutIso,
            });

            const serverNew = res.data?.newCheckout || newCheckoutIso;

            onChanged?.(serverNew);
            onClose();
        } catch (err: any) {
            // console.error(err);
            alert(err?.response?.data?.message || "Điều chỉnh thời gian thất bại.");
        } finally {
            setSubmitting(false);
        }
    };

    const fmtCurrentRange = () => {
        if (!currentFrom || !currentTo) return "—";
        const f = new Date(currentFrom);
        const t = new Date(currentTo);
        return (
            f.toLocaleString("vi-VN", { hour12: false }) +
            " → " +
            t.toLocaleString("vi-VN", { hour12: false })
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-xl bg-white shadow-lg">
                {/* Header */}
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-xl font-semibold text-slate-800">
                        Điều chỉnh thời gian trả phòng
                    </h2>
                    <button
                        onClick={onClose}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="px-4 py-4 space-y-4">
                    <div className="text-sm text-slate-500">
                        Khoảng hiện tại:{" "}
                        <span className="font-medium text-slate-700">
                            {fmtCurrentRange()}
                        </span>
                    </div>

                    {mode === "DAY" ? (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-600">
                                Chọn ngày trả mới
                            </label>

                            <DatePicker
                                id="checkout-date-picker"
                                mode="single"
                                defaultDate={pickerDate}   
                                onChange={(selectedDates: any[]) => {
                                    if (!selectedDates || !selectedDates[0]) return;
                                    const d = selectedDates[0];
                                    setPickerDate(d);  
                                    // Chuyển về YYYY-MM-DD
                                    const y = d.getFullYear();
                                    const m = String(d.getMonth() + 1).padStart(2, "0");
                                    const day = String(d.getDate()).padStart(2, "0");

                                    setNewDate(`${y}-${m}-${day}`);
                                }}
                                placeholder="Chọn ngày"
                                allowPastDates={false}  // cho phép chọn ngày cũ nếu cần
                            />

                            <p className="text-sm text-slate-500">
                                Giờ trả mặc định: <b>12:00 trưa</b>.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-600">
                                Chọn thời điểm trả mới
                            </label>
                            <input
                                type="datetime-local"
                                step={1800}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                value={newDateTime}
                                onChange={(e) => setNewDateTime(e.target.value)}
                            />
                            <p className="text-xs text-slate-500">
                                Hệ thống sẽ tính thêm/giảm tiền theo tổng số giờ thực tế.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Hủy
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit || submitting}
                        className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                        {submitting ? "Đang lưu..." : "Lưu thay đổi"}
                    </button>
                </div>
            </div>
        </div>
    );
}
