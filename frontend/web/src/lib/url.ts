// export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

// export function absUrl(u?: string | null) {
//     if (!u) return "";
//     // nếu đã là http(s) thì giữ nguyên
//     if (/^https?:\/\//i.test(u)) return u;
//     // đảm bảo 1 dấu /
//     return API_BASE.replace(/\/$/, "") + "/" + String(u).replace(/^\//, "");
// }



// /lib/url.ts
export function absUrl(u?: string) {
    if (!u) return '';
    // đã absolute -> giữ nguyên
    if (/^https?:\/\//i.test(u)) return u;

    const base =
        process.env.NEXT_PUBLIC_ASSET_BASE_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL || // fallback
        '';

    if (!base) return u; // fallback cuối cùng, để nó relative

    // chuẩn hoá slash
    const hasSlash = base.endsWith('/') || u.startsWith('/');
    return hasSlash ? `${base}${u}` : `${base}/${u}`;
}

