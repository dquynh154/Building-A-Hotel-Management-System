'use client';
import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal"; // modal bạn đã có
import Button from "@/components/ui/button/Button";
import api from "@/lib/api";
import { absUrl } from "@/lib/url";
import LoaiPhongCreateModal from "./LoaiPhongCreateModal";
import TangCreateModal from "./TangCreateModal";

type Option = { value: number; label: string };
const TD_BASE_MA = 1; // thời điểm cơ bản

type HT = { HT_MA: number; HT_TEN: string };

export default function PhongCreateModal({
    open,
    onClose,
    onCreated, // callback reload list
}: {
    open: boolean;
    onClose: () => void;
    onCreated?: () => void;
}) {

    const [htList, setHtList] = useState<HT[]>([]);
    const [typePrices, setTypePrices] = useState<Record<number, string>>({}); // HT_MA -> giá
    const [typeImages, setTypeImages] = useState<any[]>([]);
    const [ten, setTen] = useState("");
    const [lp, setLp] = useState<number | "">("");
    const [tang, setTang] = useState<number | "">("");
    const [status, setStatus] = useState<"" | "AVAILABLE" | "MAINTENANCE">("");
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [lpOptions, setLpOptions] = useState<Option[]>([]);
    const [tangOptions, setTangOptions] = useState<Option[]>([]);
    const [openCreateLoaiPhong, setOpenCreateLoaiPhong] = useState(false);
    const [openCreateTang, setOpenCreateTang] = useState(false);
    const reloadLoaiPhong = async () => {
        const lpRes = await api.get("/loai-phong", { params: { take: 200 } });
        setLpOptions((lpRes.data || []).map((x: any) => ({ value: x.LP_MA, label: x.LP_TEN })));
    };
    const reloadTang = async () => {
        const tangRes = await api.get("/tang", { params: { take: 200 } });
        setTangOptions((tangRes.data || []).map((x: any) => ({
            value: x.TANG_MA,
            label: x.TANG_TEN || `Tầng ${x.TANG_MA}`,
        })));
    };
    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const htRes = await api.get<HT[]>('/hinh-thuc-thue', { params: { take: 200 } }).catch(() => ({ data: [] as HT[] }));
                setHtList(htRes.data || []);
            } catch { }
        })();
        Promise.all([
            api.get("/loai-phong", { params: { take: 200 } }),
            api.get("/tang", { params: { take: 200 } }),
        ]).then(([lpRes, tangRes]) => {
            setLpOptions((lpRes.data || []).map((x: any) => ({ value: x.LP_MA, label: x.LP_TEN })));
            setTangOptions((tangRes.data || []).map((x: any) => ({ value: x.TANG_MA, label: x.TANG_TEN || `Tầng ${x.TANG_MA}` })));
        }).catch(() => { });
    }, [open]);
    useEffect(() => {
        if (!open) return;
        // giả sử bạn có state lpMa trong modal tạo phòng
        if (!lp) { setTypePrices({}); setTypeImages([]); return; }

        (async () => {
            try {
                // Giá TD cơ bản của loại phòng đã chọn
                const dgRes = await api.get<any[]>('/don-gia', {
                    params: { LP_MA: lp, TD_MA: TD_BASE_MA, take: 2000 }
                }).catch(() => ({ data: [] as any[] }));

                const map: Record<number, string> = {};
                (dgRes.data || []).forEach((d: any) => { map[d.HT_MA] = String(d.DG_DONGIA ?? ''); });
                setTypePrices(map);

                // Ảnh của loại phòng đã chọn
                const imgRes = await api.get<any[]>(`/loai-phong/${lp}/images`).catch(() => ({ data: [] as any[] }));
                setTypeImages(imgRes.data || []);
            } catch {
                setTypePrices({});
                setTypeImages([]);
            }
        })();
    }, [open, lp]);

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
                    <div className="flex items-stretch">
                        <div className="relative grow">
                            <select
                                className="w-full rounded-l-lg border border-r-0 border-slate-300 px-3 pr-10 py-2 text-sm
                 dark:border-slate-700 dark:bg-slate-800"
                                value={lp}
                                onChange={(e) => setLp(e.target.value ? Number(e.target.value) : "")}
                            >
                                <option value="">— Chọn loại phòng —</option>
                                {lpOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>

                        {/* Nút liền kề, bo tròn bên phải */}
                        <button
                            type="button"
                            onClick={() => setOpenCreateLoaiPhong(true)}
                            className="inline-flex h-[36px] items-center justify-center rounded-r-lg
               border border-l-0 border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50
               dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            title="Thêm loại phòng"
                            aria-label="Thêm loại phòng"
                        >
                            +
                        </button>
                    </div>
                </div>

                <div>
                    <label className="mb-1 block text-sm">Tầng *</label>
                    <div className="flex items-stretch">
                        <div className="relative grow">
                            <select
                                className="w-full rounded-l-lg border border-r-0 border-slate-300 px-3 pr-10 py-2 text-sm
                 dark:border-slate-700 dark:bg-slate-800"
                                value={tang}
                                onChange={(e) => setTang(e.target.value ? Number(e.target.value) : '')}
                            >
                                <option value="">— Chọn tầng —</option>
                                {tangOptions.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Nút liền kề, bo tròn bên phải */}
                        <button
                            type="button"
                            onClick={() => setOpenCreateTang(true)}
                            className="inline-flex h-[36px] items-center justify-center rounded-r-lg
               border border-l-0 border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50
               dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            title="Thêm tầng"
                            aria-label="Thêm tầng"
                        >
                            +
                        </button>
                    </div>

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
                {/* Thông tin loại phòng đã chọn (chỉ hiển thị) */}
                {lp && (
                    <div className="sm:col-span-2 mt-3 rounded-xl border p-3">
                        <div className="mb-2 text-sm font-medium">Giá theo loại phòng (TD cơ bản)</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {htList.length ? htList.map(ht => (
                                <div key={ht.HT_MA} className="flex items-center gap-2">
                                    <div className="w-40 text-sm">{ht.HT_TEN}</div>
                                    <input
                                        type="text"
                                        className="w-full rounded-lg border px-3 py-2 text-sm bg-slate-50 text-slate-700"
                                        value={typePrices[ht.HT_MA] ?? ''}
                                        readOnly
                                        disabled
                                    />
                                </div>
                            )) : (
                                // fallback nếu không lấy được HT list (thiếu quyền)
                                Object.keys(typePrices).map((k) => (
                                    <div key={k} className="flex items-center gap-2">
                                        <div className="w-40 text-sm">HT #{k}</div>
                                        <input
                                            type="text"
                                            className="w-full rounded-lg border px-3 py-2 text-sm bg-slate-50 text-slate-700"
                                            value={typePrices[Number(k)] ?? ''}
                                            readOnly
                                            disabled
                                        />
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-3">
                            <div className="mb-2 text-sm font-medium">Ảnh loại phòng</div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                                {typeImages.length ? typeImages.map((img: any) => (
                                    <div key={img.IMG_ID} className="relative rounded-lg border p-2">
                                        <img src={absUrl(img.URL)} className="h-24 w-full rounded object-cover" />
                                        {img.IS_MAIN && (
                                            <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
                                                Đại diện
                                            </span>
                                        )}
                                    </div>
                                )) : (
                                    <div className="col-span-full rounded-lg border p-6 text-center text-slate-500">
                                        Chưa có ảnh
                                    </div>
                                )}
                            </div>
                            <p className="mt-2 text-xs text-slate-500">Giá & ảnh chỉ để xem. Muốn chỉnh, qua tab “Loại phòng”.</p>
                        </div>
                    </div>
                )}
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
            <LoaiPhongCreateModal
                open={openCreateLoaiPhong}
                onClose={() => setOpenCreateLoaiPhong(false)}
                onCreated={async () => {
                    await reloadLoaiPhong();
                    setOpenCreateLoaiPhong(false);
                }}
            />

            <TangCreateModal
                open={openCreateTang}
                onClose={() => setOpenCreateTang(false)}
                onCreated={async () => {
                    await reloadTang();
                    setOpenCreateTang(false);
                }}
            />
        </Modal>
    );
}
