// src/lib/auth.ts
const KEY = 'token';

// Lưu / lấy token
export const getToken = () =>
    typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;

export const setToken = (t: string) => localStorage.setItem(KEY, t);

export const clearToken = () => localStorage.removeItem(KEY);

// fetch wrapper tự đính kèm Authorization
export async function sfetch(path: string, opts: RequestInit = {}) {
    const token = getToken();
    const headers = new Headers(opts.headers || {});
    headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(path, { ...opts, headers });
    let data: any = null;
    try {
        data = await res.json();
    } catch {
        //
    }

    if (!res.ok)
        throw data || { message: res.statusText, status: res.status };
    return data;
}
