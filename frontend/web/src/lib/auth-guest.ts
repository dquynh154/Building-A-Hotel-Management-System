// src/lib/auth-guest.ts
const KEY = 'guest_token';

export const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem(KEY) : null);
export const setToken = (t: string) => localStorage.setItem(KEY, t);
export const clearToken = () => localStorage.removeItem(KEY);

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
