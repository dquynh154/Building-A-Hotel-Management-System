"use client";
import { useEffect, useState } from "react";

type Summary = {
    ok: boolean;
    date: string;
    arrivals: number;
    departures: number;
    inhouse: number;
    occupancy: number; // 0..100
    revenue: number;   // today
    backendHealth?: boolean;
};

export default function Stats() {
    const [data, setData] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/summary", { cache: "no-store" });
                const json = await res.json();
                if (!cancelled) setData(json);
            } catch (e) {
                if (!cancelled)
                    setData({ ok: false, date: new Date().toISOString().slice(0, 10), arrivals: 0, departures: 0, inhouse: 0, occupancy: 0, revenue: 0, backendHealth: false });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-xl border animate-pulse bg-slate-50" />
            ))}
        </div>;
    }

    const ok = data?.ok && (data.backendHealth ?? true);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatBox label="Tình trạng backend" value={ok ? "OK" : "Mất kết nối"} hint={data?.date ?? ""} intent={ok ? "success" : "danger"} />
            <StatBox label="Khách đến hôm nay" value={String(data?.arrivals ?? 0)} hint="Arrivals" />
            <StatBox label="Khách đi hôm nay" value={String(data?.departures ?? 0)} hint="Departures" />
            <StatBox label="Đang ở" value={String(data?.inhouse ?? 0)} hint={`Công suất ${Math.round(data?.occupancy ?? 0)}%`} />
            <StatBox label="Doanh thu hôm nay" value={formatCurrency(data?.revenue ?? 0)} hint="VND" />
        </div>
    );
}

function StatBox({ label, value, hint, intent }: { label: string; value: string; hint?: string; intent?: "success" | "danger" | "default" }) {
    const ring = intent === "success" ? "ring-emerald-200" : intent === "danger" ? "ring-rose-200" : "ring-slate-200";
    const bg = intent === "success" ? "bg-emerald-50" : intent === "danger" ? "bg-rose-50" : "bg-slate-50";
    const text = intent === "success" ? "text-emerald-700" : intent === "danger" ? "text-rose-700" : "text-slate-700";
    return (
        <div className={`rounded-xl border p-4 ${bg} ring-1 ${ring}`}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`mt-1 text-2xl font-bold ${text}`}>{value}</div>
            {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
        </div>
    );
}

function formatCurrency(n: number) {
    try { return n.toLocaleString("vi-VN", { style: "currency", currency: "VND" }); } catch { return `${n}₫`; }
}