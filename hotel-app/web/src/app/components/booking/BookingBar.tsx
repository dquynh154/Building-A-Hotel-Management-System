"use client";
import { useMemo, useState } from "react";

export default function BookingBar() {
    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const tomorrow = useMemo(() => {
        const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
    }, []);

    const [hotel, setHotel] = useState("");
    const [checkin, setCheckin] = useState(today);
    const [checkout, setCheckout] = useState(tomorrow);
    const [adults, setAdults] = useState(1);
    const [children, setChildren] = useState(0);
    const [error, setError] = useState("");

    const submit = () => {
        setError("");
        if (!hotel) return setError("Vui lòng chọn khách sạn");
        if (checkout <= checkin) return setError("Ngày trả phòng phải sau ngày nhận phòng");

        const qs = new URLSearchParams({ hotel, checkin, checkout, adults: String(adults), children: String(children) });
        window.location.href = `/search?${qs.toString()}`; // tạm thời điều hướng tới trang search
    };

    return (
        <div className="rounded-2xl bg-white shadow-xl border px-4 sm:px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                

                {/* Dates */}
                <div className="flex flex-col">
                    <label className="text-sm text-slate-600">Ngày nhận</label>
                    <input type="date" value={checkin} min={today} onChange={e => setCheckin(e.target.value)} className="h-12 rounded-xl border px-3" />
                </div>
                <div className="flex flex-col">
                    <label className="text-sm text-slate-600">Ngày trả</label>
                    <input type="date" value={checkout} min={checkin} onChange={e => setCheckout(e.target.value)} className="h-12 rounded-xl border px-3" />
                </div>

                {/* Guests + CTA */}
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex items-center gap-2">
                        <select value={adults} onChange={e => setAdults(Number(e.target.value))} className="h-12 rounded-xl border px-3 w-28">
                            {Array.from({ length: 6 }).map((_, i) => <option key={i} value={i + 1}>{i + 1} Người lớn</option>)}
                        </select>
                        <select value={children} onChange={e => setChildren(Number(e.target.value))} className="h-12 rounded-xl border px-3 w-28">
                            {Array.from({ length: 6 }).map((_, i) => <option key={i} value={i}>{i} Trẻ em</option>)}
                        </select>
                    </div>
                    <button onClick={submit} className="h-12 shrink-0 rounded-xl bg-rose-700 text-white px-6 font-semibold hover:bg-rose-600 w-full sm:w-auto">TÌM PHÒNG</button>
                </div>
            </div>
            {error && <div className="mt-2 text-rose-700 text-sm">{error}</div>}
        </div>
    );
}
