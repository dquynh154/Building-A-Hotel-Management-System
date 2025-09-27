import { NextResponse } from "next/server";


export async function GET() {
    const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";


    try {
        // Gọi thử /health trước
        const healthRes = await fetch(`${base}/health`, { cache: "no-store" });
        const healthOk = healthRes.ok;


        // Nếu backend có endpoint /api/summary thì dùng, ngược lại trả fallback
        const sumRes = await fetch(`${base}/api/summary`, { cache: "no-store" }).catch(() => null);


        if (sumRes?.ok) {
            const data = await sumRes.json();
            return NextResponse.json({ ...data, backendHealth: healthOk });
        }


        // Fallback demo: số liệu 0 khi chưa có endpoint thật
        const today = new Date().toISOString().slice(0, 10);
        return NextResponse.json({ ok: healthOk, date: today, arrivals: 0, departures: 0, inhouse: 0, occupancy: 0, revenue: 0, backendHealth: healthOk });
    } catch (e) {
        const today = new Date().toISOString().slice(0, 10);
        return NextResponse.json({ ok: false, date: today, arrivals: 0, departures: 0, inhouse: 0, occupancy: 0, revenue: 0, backendHealth: false }, { status: 200 });
    }
}

