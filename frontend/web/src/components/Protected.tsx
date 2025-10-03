// "use client";
// import { useEffect, useState } from "react";
// import { useRouter, usePathname } from "next/navigation";
// import { api } from "@/lib/api";

// export default function Protected({ children }: { children: React.ReactNode }) {
//     const pathname = usePathname();
//     const router = useRouter();
//     const [ok, setOk] = useState(false);

//     useEffect(() => {
//         if (pathname?.startsWith("/login")) return; // trang login thì bỏ qua
//         api.get("/auth/staff/me")
//             .then(() => setOk(true))
//             .catch(() => router.replace("/login"));
//     }, [pathname, router]);

//     if (pathname?.startsWith("/login")) return <>{children}</>;
//     if (!ok) return <div className="p-6">Đang kiểm tra phiên đăng nhập...</div>;
//     return <>{children}</>;
// }


"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";

export default function Protected({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [ok, setOk] = useState(false);

    useEffect(() => {
        // không guard trang /login
        if (pathname?.startsWith("/login")) return;

        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (!token) {
            router.replace("/login");
            return;
        }

        api.get("/auth/staff/me")
            .then(() => setOk(true))
            .catch(() => router.replace("/login"));
    }, [pathname, router]);

    if (pathname?.startsWith("/login")) return <>{children}</>;
    if (!ok) return <div className="p-6">Đang kiểm tra phiên đăng nhập...</div>;
    return <>{children}</>;
}
