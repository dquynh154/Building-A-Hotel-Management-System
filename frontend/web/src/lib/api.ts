import axios from "axios";

export const api = axios.create({
    baseURL: "/api",                 // chỉ dùng đường dẫn tương đối
    headers: { "Content-Type": "application/json" },
    withCredentials: true,           // nếu backend dùng cookie đăng nhập
});
api.interceptors.request.use((config) => {
    if (typeof window !== "undefined") {
        const t = localStorage.getItem("token");
        if (t) config.headers.Authorization = `Bearer ${t}`;
    }
    return config;
});
export default api;
