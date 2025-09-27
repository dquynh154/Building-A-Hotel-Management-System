import Image  from "next/image";
import Link from "next/link";
import ChatWidget from "./components/ChatWidget";
import Stats from "./components/Stats";
import Hero from "./components/Hero";

export const metadata = { title: "Trang chủ hệ thống" };

export default async function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-black text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/tenmoi.png" width={160} height={160} alt="Logo" className="" />
            <span className="font-bold tracking-wide">WENDY HOTEL</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link className="hover:underline" href="#">Khách sạn</Link>
            <Link className="hover:underline" href="#">Trải nghiệm</Link>
            <Link className="hover:underline" href="#">Hội nghị & sự kiện</Link>
            <Link className="hover:underline" href="#">Ưu đãi</Link>
            <Link className="rounded-md bg-rose-600 px-3 py-1.5 font-medium hover:bg-rose-500" href="#">Đặt ngay</Link>
          </nav>
        </div>
      </header>

      {/* Hero + Booking Bar */}
      <Hero />

      {/* Content below hero */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-10 grid gap-8">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight">Tổng quan hôm nay</h2>
          <p className="text-sm text-slate-600">Số liệu realtime từ backend (qua /api/summary). Nếu backend chưa chạy sẽ hiển thị fallback.</p>
          <div className="mt-4">
            <Stats />
          </div>
        </section>
      </main>

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 flex items-center justify-between">
          <p className="text-sm text-slate-600">© {new Date().getFullYear()} Hotel Manager</p>
          <div className="flex items-center gap-4 text-sm">
            <Link className="hover:underline" href="/about">Giới thiệu</Link>
            <Link className="hover:underline" href="/help">Trợ giúp</Link>
            <ChatWidget />
          </div>
        </div>
      </footer>
    </div>
  );
}
