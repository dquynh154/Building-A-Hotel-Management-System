"use client";
import Checkbox from "@/components/form/input/Checkbox";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import React, { useState } from "react";
import { gfetch, setToken } from "@/lib/auth-guest";
import { useRouter } from "next/navigation";

export default function SignUpForm() {
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);
    const [isChecked, setIsChecked] = useState(false);

    // form state
    const [fname, setFname] = useState("");
    const [lname, setLname] = useState("");
    const [phone, setPhone] = useState("");
    const [username, setUsername] = useState(""); // KH_TAIKHOAN
    const [email, setEmail] = useState("");       // KH_EMAIL (optional)
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState({
        fname: "",
        lname: "",
        phone: "",
        username: "",
        password: "",
        isChecked: "",
    });

    const [loading, setLoading] = useState(false);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const newErrors: any = {};
        if (!fname.trim()) newErrors.fname = "Vui lòng nhập tên";
        if (!lname.trim()) newErrors.lname = "Vui lòng nhập họ";
        if (!phone.trim()) newErrors.phone = "Vui lòng nhập số điện thoại";
        if (!username.trim()) newErrors.username = "Vui lòng nhập tên đăng nhập";
        if (!password.trim()) newErrors.password = "Vui lòng nhập mật khẩu";
        if (!isChecked) newErrors.isChecked = "Vui lòng đồng ý Điều khoản & Chính sách";

        setErrors(newErrors);

        // nếu có ít nhất 1 lỗi thì dừng lại
        if (Object.keys(newErrors).length > 0) return;

        setLoading(true);
        try {
            const payload = {
                KH_HOTEN: `${fname} ${lname}`.trim(),
                KH_SDT: phone || null,
                KH_EMAIL: email || null,
                KH_TAIKHOAN: username,
                KH_MATKHAU: password,
            };
            const data = await gfetch("/api/auth/guest/register", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            setToken(data.token);
            router.replace("/khachhang");
        } catch (e: any) {
            const msg = e?.message || "Đăng ký thất bại";
            const newErrs: any = {};

            if (msg.includes("Tài khoản")) newErrs.username = msg;
            else if (msg.includes("Số điện thoại")) newErrs.phone = msg;
            else if (msg.includes("Email")) newErrs.email = msg;
            else newErrs.username = msg; // fallback

            setErrors(prev => ({ ...prev, ...newErrs }));
        }
        finally {
            setLoading(false);
        }
    };


    return (
        <div className="flex flex-col flex-1 lg:w-1/2 w-full overflow-y-auto no-scrollbar">
            <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
                <Link
                    href="/khachhang"
                    className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                >
                    <ChevronLeftIcon />
                    Trở về trang khách
                </Link>
            </div>

            <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
                <div>
                    <div className="mb-5 sm:mb-8">
                        <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
                            Đăng ký
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Nhập thông tin để tạo tài khoản khách hàng.
                        </p>
                    </div>

                    {/* social row giữ nguyên UI (chưa gắn OAuth) */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
                        <button className="inline-flex items-center justify-center gap-3 py-3 text-sm font-normal text-gray-700 transition-colors bg-gray-100 rounded-lg px-7 hover:bg-gray-200 hover:text-gray-800 dark:bg-white/5 dark:text-white/90 dark:hover:bg-white/10">
                            {/* Google icon */}
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M18.7511 10.1944C18.7511 9.47495 18.6915 8.94995 18.5626 8.40552H10.1797V11.6527H15.1003C15.0011 12.4597 14.4654 13.675 13.2749 14.4916L13.2582 14.6003L15.9087 16.6126L16.0924 16.6305C17.7788 15.1041 18.7511 12.8583 18.7511 10.1944Z" fill="#4285F4" /><path d="M10.1788 18.75C12.5895 18.75 14.6133 17.9722 16.0915 16.6305L13.274 14.4916C12.5201 15.0068 11.5081 15.3666 10.1788 15.3666C7.81773 15.3666 5.81379 13.8402 5.09944 11.7305L4.99473 11.7392L2.23868 13.8295L2.20264 13.9277C3.67087 16.786 6.68674 18.75 10.1788 18.75Z" fill="#34A853" /><path d="M5.10014 11.7305C4.91165 11.186 4.80257 10.6027 4.80257 9.99992C4.80257 9.3971 4.91165 8.81379 5.09022 8.26935L5.08523 8.1534L2.29464 6.02954L2.20333 6.0721C1.5982 7.25823 1.25098 8.5902 1.25098 9.99992C1.25098 11.4096 1.5982 12.7415 2.20333 13.9277L5.10014 11.7305Z" fill="#FBBC05" /><path d="M10.1789 4.63331C11.8554 4.63331 12.9864 5.34303 13.6312 5.93612L16.1511 3.525C14.6035 2.11528 12.5895 1.25 10.1789 1.25C6.68676 1.25 3.67088 3.21387 2.20264 6.07218L5.08953 8.26943C5.81381 6.15972 7.81776 4.63331 10.1789 4.63331Z" fill="#EB4335" /></svg>
                            Đăng ký với Google
                        </button>
                        <button className="inline-flex items-center justify-center gap-3 py-3 text-sm font-normal text-gray-700 transition-colors bg-gray-100 rounded-lg px-7 hover:bg-gray-200 hover:text-gray-800 dark:bg_white/5 dark:text-white/90 dark:hover:bg_white/10">
                            {/* X icon */}
                            <svg width="21" className="fill-current" height="20" viewBox="0 0 21 20" fill="none"><path d="M15.6705 1.875H18.4272L12.4047 8.75833L19.4897 18.125H13.9422L9.59717 12.4442L4.62554 18.125H1.86721L8.30887 10.7625L1.51221 1.875H7.20054L11.128 7.0675L15.6705 1.875ZM14.703 16.475H16.2305L6.37054 3.43833H4.73137L14.703 16.475Z" /></svg>
                            Đăng ký với X
                        </button>
                    </div>

                    <div className="relative py-3 sm:py-5">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="p-2 text-gray-400 bg-white dark:bg-gray-900 sm:px-5 sm:py-2">Hoặc</span>
                        </div>
                    </div>

                    <form onSubmit={onSubmit}>
                        <div className="space-y-5">
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                                <div className="sm:col-span-1">
                                    <Label>Tên<span className="text-error-500">*</span></Label>
                                    <Input type="text" placeholder="Nhập tên của bạn" value={fname} onChange={(e) => setFname(e.target.value)} />
                                    {errors.fname && <p className="text-sm text-red-500 mt-1">{errors.fname}</p>}
                                </div>
                                <div className="sm:col-span-1">
                                    <Label>Họ<span className="text-error-500">*</span></Label>
                                    <Input type="text" placeholder="Nhập họ của bạn" value={lname} onChange={(e) => setLname(e.target.value)} />
                                    {errors.lname && <p className="text-sm text-red-500 mt-1">{errors.lname}</p>}
                                </div>
                            </div>

                            <div>
                                <Label>Số điện thoại<span className="text-error-500">*</span></Label>
                                <Input type="text" placeholder="Nhập số điện thoại của bạn" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone}</p>}
                            </div>

                            <div>
                                <Label>Email</Label>
                                <Input type="email" placeholder="Nhập email (không bắt buộc)" value={email} onChange={(e) => setEmail(e.target.value)} />
                            </div>

                            <div>
                                <Label>Tên đăng nhập<span className="text-error-500">*</span></Label>
                                <Input type="text" placeholder="Nhập tên đăng nhập" value={username} onChange={(e) => setUsername(e.target.value)} />
                                {errors.username && <p className="text-sm text-red-500 mt-1">{errors.username}</p>}
                            </div>

                            <div>
                                <Label>Mật khẩu<span className="text-error-500">*</span></Label>
                                <div className="relative">
                                    <Input
                                        placeholder="Nhập mật khẩu"
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <span
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                                    >
                                        {showPassword ? <EyeIcon className="fill-gray-500 dark:fill-gray-400" /> : <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />}
                                    </span>
                                </div>
                                {errors.password && <p className="text-sm text-red-500 mt-1">{errors.password}</p>}
                            </div>

                            <div className="flex items-center gap-3">
                                <Checkbox className="w-5 h-5" checked={isChecked} onChange={setIsChecked} />
                                <p className="inline-block font-normal text-gray-500 dark:text-gray-400">
                                    Bằng việc tạo tài khoản, bạn đồng ý với{" "}
                                    <span className="text-gray-800 dark:text-white/90">Điều khoản & Điều kiện</span> và{" "}
                                    <span className="text-gray-800 dark:text-white">Chính sách quyền riêng tư</span>.
                                </p>
                            </div>
                            {errors.isChecked && <p className="text-sm text-red-500 mt-1">{errors.isChecked}</p>}


                            <div>
                                <button disabled={loading} className="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-white transition rounded-lg bg-brand-500 shadow-theme-xs hover:bg-brand-600">
                                    {loading ? "Đang tạo tài khoản…" : "Đăng ký"}
                                </button>
                            </div>
                        </div>
                    </form>

                    <div className="mt-5">
                        <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                            Đã có tài khoản?{" "}
                            <Link href="/khachhang/dang-nhap" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
                                Đăng nhập
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
