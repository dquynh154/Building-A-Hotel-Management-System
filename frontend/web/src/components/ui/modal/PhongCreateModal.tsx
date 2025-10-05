'use client';
import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal"; // modal bạn đã có
import Button from "@/components/ui/button/Button";
import api from "@/lib/api";

type Option = { value: number; label: string };

export default function PhongCreateModal({
    open,
    onClose,
    onCreated, // callback reload list
}: {
    open: boolean;
    onClose: () => void;
    onCreated?: () => void;
}) {
    const [ten, setTen] = useState("");
    const [lp, setLp] = useState<number | "">("");
    const [tang, setTang] = useState<number | "">("");
    const [status, setStatus] = useState<"" | "AVAILABLE" | "MAINTENANCE">("");
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [lpOptions, setLpOptions] = useState<Option[]>([]);
    const [tangOptions, setTangOptions] = useState<Option[]>([]);

    useEffect(() => {
        if (!open) return;
        // load dropdowns
        Promise.all([
            api.get("/loai-phong", { params: { take: 200 } }),
            api.get("/tang", { params: { take: 200 } }),
        ]).then(([lpRes, tangRes]) => {
            setLpOptions((lpRes.data || []).map((x: any) => ({ value: x.LP_MA, label: x.LP_TEN })));
            setTangOptions((tangRes.data || []).map((x: any) => ({ value: x.TANG_MA, label: x.TANG_TEN || `Tầng ${x.TANG_MA}` })));
        }).catch(() => { });
    }, [open]);

    const canSave = ten.trim().length > 0 && lp !== "" && tang !== "" && !saving;

    const save = async (keepOpen: boolean) => {
        if (!canSave) return;
        setSaving(true); setErr(null);
        try {
            await api.post("/phong", {
                PHONG_TEN: ten.trim(),
                LP_MA: Number(lp),
                TANG_MA: Number(tang),
                ...(status ? { PHONG_TRANGTHAI: status } : {}), // chỉ gửi nếu chọn
            });
            onCreated?.();
            if (keepOpen) {
                // reset form để nhập tiếp
                setTen(""); setLp(""); setTang(""); setStatus("");
            } else {
                onClose();
                // reset nhẹ khi đóng
                setTimeout(() => { setTen(""); setLp(""); setTang(""); setStatus(""); }, 0);
            }
        } catch (e: any) {
            setErr(e?.response?.data?.message || "Lưu thất bại");
        } finally { setSaving(false); }
    };

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-3xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Thêm phòng mới</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm">Tên phòng *</label>
                    <input
                        value={ten}
                        onChange={(e) => setTen(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        placeholder="VD: Phòng 101"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm">Loại phòng *</label>
                    <select
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        value={lp}
                        onChange={(e) => setLp(e.target.value ? Number(e.target.value) : "")}
                    >
                        <option value="">— Chọn loại phòng —</option>
                        {lpOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-sm">Tầng *</label>
                    <select
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        value={tang}
                        onChange={(e) => setTang(e.target.value ? Number(e.target.value) : "")}
                    >
                        <option value="">— Chọn tầng —</option>
                        {tangOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-sm">Trạng thái (tuỳ chọn)</label>
                    <select
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                    >
                        <option value="">— Mặc định (Trống) —</option>
                        <option value="AVAILABLE">Trống</option>
                        <option value="MAINTENANCE">Bảo trì</option>
                    </select>
                </div>
            </div>

            {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

            <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={() => save(false)}>
                    {saving ? "Đang lưu..." : "Lưu"}
                </Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={() => save(true)}>
                    {saving ? "..." : "Lưu & Thêm mới"}
                </Button>
            </div>
        </Modal>
    );
}
