// src/lib/auth-guest.ts
const KEY = 'guest_token';

export const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem(KEY) : null);
export const setToken = (t: string) => {
    localStorage.setItem(KEY, t);
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("guest-login")); // 👈 phát tín hiệu login thành công
    }
};

export const clearToken = () => {
    localStorage.removeItem(KEY);
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("guest-logout")); // 👈 phát tín hiệu logout
    }
};

// fetch wrapper luôn đính kèm Authorization nếu có
export async function gfetch(path: string, opts: RequestInit = {}) {
    const token = getToken();
    const headers = new Headers(opts.headers || {});
    headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(path, { ...opts, headers });
    // cố gắng parse JSON
    let data: any = null;
    try { data = await res.json(); } catch { }
    if (!res.ok) throw (data || { message: res.statusText, status: res.status });
    return data;
}
