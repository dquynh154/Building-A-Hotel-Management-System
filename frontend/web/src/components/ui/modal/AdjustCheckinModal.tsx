"use client";

import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import DatePicker from "@/components/form/date-picker";

type Mode = "DAY" | "HOUR";

interface Props {
    open: boolean;
    bookingId: number | null | undefined;

    mode: Mode; // "DAY" hoặc "HOUR"
    currentFrom?: string | null;  // ngày/giờ NHẬN HIỆN TẠI
    currentTo?: string | null;    // ngày/giờ TRẢ (chỉ để hiển thị dải)

    onClose: () => void;
    onChanged?: (newCheckin: string) => void;
}

// =======================
// Helpers giống file gốc
// =======================
function toInputDate(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(+d)) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
    ).padStart(2, "0")}`;
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

export default function AdjustCheckinModal({
    open,
    bookingId,
    mode,

    currentFrom,     // ngày giờ cũ của check-in
    currentTo,       // chỉ dùng để hiển thị
    onClose,
    onChanged,
}: Props) {
    const [submitting, setSubmitting] = useState(false);

    const [newDate, setNewDate] = useState("");          // DAY mode
    const [newDateTime, setNewDateTime] = useState("");  // HOUR mode
    const [pickerDate, setPickerDate] = useState<Date | undefined>(undefined);

    useEffect(() => {
        if (!open) return;

        if (mode === "DAY") {
            if (currentFrom) {
                const d = new Date(currentFrom);
                setPickerDate(d);   // ⭐ giữ ngày hiển thị trong DatePicker
                setNewDate(toInputDate(currentFrom));
            }
        } else {
            setNewDateTime(toInputDateTimeLocal(currentFrom || null));
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
            let newCheckinIso = "";

            if (mode === "DAY") {
                const d = new Date(`${newDate}T14:00:00`);
                if (isNaN(+d)) {
                    alert("Ngày mới không hợp lệ.");
                    return;
                }
                newCheckinIso = d.toISOString();
            } else {
                const d = new Date(newDateTime);
                if (isNaN(+d)) {
                    alert("Thời gian mới không hợp lệ.");
                    return;
                }
                newCheckinIso = d.toISOString();
            }

            // ============================
            //   CALL API adjust-checkin
            // ============================
            const res = await api.post(`/bookings/${bookingId}/adjust-checkin`, {
                newCheckin: newCheckinIso,
            });

            const serverNew = res.data?.newCheckin || newCheckinIso;

            onChanged?.(serverNew);
            onClose();
        } catch (err: any) {
            alert(err?.response?.data?.message || "Điều chỉnh thời gian nhận thất bại.");
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
                        Điều chỉnh thời gian nhận phòng
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
                                Chọn ngày nhận mới
                            </label>

                            <DatePicker
                                id="checkin-date-picker"
                                mode="single"
                                defaultDate={pickerDate}

                                onChange={(dates: any[], _dateStr: string, _instance: any) => {
                                    if (!dates || !dates[0]) return;
                                    const d = dates[0] as Date;

                                    // ⭐ CẬP NHẬT lại pickerDate để defaultDate = ngày mới
                                    setPickerDate(d);

                                    const y = d.getFullYear();
                                    const m = String(d.getMonth() + 1).padStart(2, "0");
                                    const day = String(d.getDate()).padStart(2, "0");

                                    setNewDate(`${y}-${m}-${day}`);
                                }}
                                placeholder="Chọn ngày"
                                allowPastDates={false}
                            />

                            <p className="text-sm text-slate-500">
                                Giờ nhận mặc định: <b>14:00 </b>.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="block text-xs font-medium text-slate-600">
                                Chọn thời điểm nhận mới
                            </label>
                            <input
                                type="datetime-local"
                                step={1800}
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                value={newDateTime}
                                onChange={(e) => setNewDateTime(e.target.value)}
                            />
                            <p className="text-xs text-slate-500">
                                Hệ thống sẽ tính thêm/giảm thời gian theo giờ.
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
