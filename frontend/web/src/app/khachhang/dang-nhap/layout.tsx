import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";

import { ThemeProvider } from "@/context/ThemeContext";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <ThemeProvider>
        <div className="relative flex lg:flex-row w-full h-screen justify-center flex-col  dark:bg-gray-900 sm:p-0">
          {children}
          {/* <div className="lg:w-1/2 w-full h-full bg-brand-950 dark:bg-white/5 lg:grid items-center hidden">
            <div className="relative items-center justify-center  flex z-1">
              <GridShape />
              <div className="flex flex-col items-center max-w-xs">
                <Link href="/admin" className="block mb-4">
                  <Image
                    width={231}
                    height={48}
                    src="/images/logo/logo-dark-5.png"
                    alt="Logo"
                  />
                </Link>
                <p className="text-center text-gray-400 dark:text-white/60">
                  
                </p>
              </div>
            </div>
          </div> */}

          {/* RIGHT PANEL thay bằng ảnh nền */}
          <div className="relative hidden h-full w-full lg:block lg:w-1/2">
            {/* Ảnh nền fill toàn bộ khung */}
            <Image
              src="/images/auth/auth-bg.jpg"     // ← ảnh bạn đặt ở public/images/auth/auth-bg.jpg
              alt="Auth background"
              fill
              priority
              className="object-cover"
            />

            {/* Overlay để chữ/logo nổi bật (tăng/giảm độ đậm bằng 40 → 60) */}
            <div className="absolute inset-0 bg-black/40 dark:bg-black/30" />

            {/* Nội dung chồng lên ảnh */}
            <div className="relative z-10 grid h-full place-items-center">
              {/* Lưới trang trí, cho mờ bớt */}
              <div className="pointer-events-none absolute inset-0 opacity-40">
                <GridShape />
              </div>

              <div className="relative z-10 flex max-w-xs flex-col items-center">
                <Link href="/admin" className="mb-4 block">
                  <Image width={231} height={48} src="/images/logo/logo-dark-5.png" alt="Logo" />
                </Link>
                <p className="whitespace-nowrap text-center text-white/90 text-2xl md:text-2xl font-semibold leading-tight tracking-wide drop-shadow">
                  Nghỉ ngơi trọn vẹn, phục vụ 24/7.
                </p>
              </div>
            </div>
          </div>

          <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
            <ThemeTogglerTwo />
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}
