'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useGuest } from '@/hooks/useGuest';
import { clearToken } from '@/lib/auth-guest';

function UserMenu({ guest }: { guest: any }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-black/5"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <span className="truncate max-w-[180px]">Xin chào, {guest?.KH_HOTEN || guest?.KH_TAIKHOAN}</span>
                <svg width="16" height="16" viewBox="0 0 20 20" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
                    <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
                </svg>
            </button>

            {open && (
                <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm text-slate-800 shadow-xl">
                    <Link href="/khachhang/quan-ly-dat-phong" className="block px-4 py-2.5 hover:bg-blue-100" onClick={() => setOpen(false)}>
                        Đơn đặt phòng của tôi
                    </Link>
                    <button className="block w-full px-4 py-2.5 text-left hover:bg-blue-100" onClick={() => { clearToken(); location.reload(); }}>
                        Đăng xuất
                    </button>
                </div>
            )}
        </div>
    );
}

export default function Header() {
    const { guest, loading } = useGuest();

    return (
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 text-slate-800">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
                <Link href="/khachhang" className="inline-flex items-center" aria-label="Trang chủ">
                    <Image
                        src="/images/logo/logo-5.png"
                        alt="Hotel Logo"
                        width={96}
                        height={28}
                        priority
                        className="h-7 w-auto md:h-8"
                    />
                </Link>

                <nav className="hidden gap-6 md:flex">
                    <Link href="/khachhang" className="text-sm text-slate-700 hover:text-blue-600">TRANG CHỦ</Link>
                    <Link href="/khachhang/gioi-thieu" className="text-sm text-slate-700 hover:text-blue-600">GIỚI THIỆU</Link>
                    <Link href="/khachhang/tin-tuc" className="text-sm text-slate-700 hover:text-blue-600">TIN TỨC</Link>
                    <Link href="/khachhang/tien-ich" className="text-sm text-slate-700 hover:text-blue-600">TIỆN ÍCH</Link>
                    <Link href="/khachhang/dat-phong" className="text-sm text-slate-700 hover:text-blue-600">ĐẶT PHÒNG</Link>
                </nav>

                {/* Right */}
                {loading ? null : guest ? (
                    <div className="hidden md:flex items-center gap-3"><UserMenu guest={guest} /></div>
                ) : (
                    <div className="hidden md:flex gap-3">
                        <a href="/khachhang/dang-nhap" className="px-3 py-2 text-sm">Đăng nhập</a>
                        <a href="/khachhang/dang-ky" className="rounded-md bg-rose-600 px-3 py-2 text-sm text-white">Đăng ký</a>
                    </div>
                )}
            </div>
        </header>
    );
}
