'use client';
import { useState, useRef,useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
// === Giá cơ bản gợi ý khi tạo loại phòng ===
const TD_BASE_MA = 1;
type HT = { HT_MA: number; HT_TEN: string };

const PRICE_SOURCE_LP_MA = 1; 

export default function LoaiPhongCreateModal({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    onCreated?: () => void; // gọi để reload list
}) {
    const [useBase, setUseBase] = useState(true);
    const [htList, setHtList] = useState<HT[]>([]);
    const [suggest, setSuggest] = useState<Record<number, string>>({});
    const [ten, setTen] = useState('');
    const [soNguoi, setSoNguoi] = useState<number | ''>('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const nameRef = useRef<HTMLInputElement>(null);

    // VALIDATION (≥1). Nếu bạn đã cho phép null ở DB thì đổi điều kiện theo nhu cầu.
    const isTenValid = ten.trim().length > 0;
    const isSoNguoiValid =
        soNguoi !== '' && Number.isInteger(Number(soNguoi)) && Number(soNguoi) >= 1;

    const canSave = isTenValid && isSoNguoiValid && !saving;

    const create = async () => {
        setSaving(true); setErr(null);
        try {
            // 1) tạo loại phòng
            const res = await api.post('/loai-phong', {
                LP_TEN: ten.trim(),
                LP_SONGUOI: Number(soNguoi),
            });
            const lpId = res.data?.LP_MA;
            if (lpId) {
                if (useBase) {
                    const entries = Object.entries(suggest)
                        .map(([ht, val]) => ({ HT_MA: Number(ht), DG_DONGIA: String(val || '').trim() }))
                        .filter(e => e.DG_DONGIA !== '');
                    await Promise.all(entries.map(e =>
                        api.post('/don-gia', {
                            LP_MA: lpId,
                            HT_MA: e.HT_MA,
                            TD_MA: TD_BASE_MA,
                            DG_DONGIA: e.DG_DONGIA,
                        })
                    ));
                }                
            }

            // 2) nếu có ảnh → upload + ghi DB
            const urls = await uploadImages();
            if (lpId && urls.length) await createImageRecords(lpId, urls);

            onCreated?.();
            return lpId;
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Lưu thất bại');
            throw e;
        } finally {
            setSaving(false);
        }
    };

    const onSave = async () => {
        if (!canSave) return;
        const lpId = await create();
        if (lpId) {
            // đóng modal
            onClose();
            // reset form
            setTen(''); setSoNguoi(''); setFiles([]); setPreviews([]);
        }
    };

    const onSaveAndNew = async () => {
        if (!canSave) return;
        const lpId = await create();
        if (lpId) {
            // giữ modal mở để nhập tiếp
            setTen(''); setSoNguoi('');
            setFiles([]); setPreviews([]);
            // focus lại ô tên nếu muốn
            // nameRef.current?.focus();
        }
    };

    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const picked = Array.from(e.target.files || []);
        if (!picked.length) return;

        setFiles(prev => {
            // gộp + khử trùng lặp (theo name|size|lastModified)
            const merged = [...prev, ...picked];
            const uniq = new Map<string, File>();
            for (const f of merged) {
                const k = `${f.name}|${f.size}|${f.lastModified}`;
                if (!uniq.has(k)) uniq.set(k, f);
            }
            // BE giới hạn 10 file: cắt bớt nếu cần
            return Array.from(uniq.values()).slice(0, 10);
        });

        setPreviews(prev => [
            ...prev,
            ...picked.map(f => URL.createObjectURL(f)),
        ]);

        // rất quan trọng: reset value để có thể chọn lại cùng 1 file lần sau
        e.currentTarget.value = "";
    }
    function removeAt(i: number) {
        setFiles(fs => fs.filter((_, idx) => idx !== i));
        setPreviews(ps => ps.filter((_, idx) => idx !== i));
    }

    async function uploadImages(): Promise<string[]> {
        if (files.length === 0) return [];
        const fd = new FormData();
        files.forEach(f => fd.append('files', f));
        const res = await api.post('/upload/loai-phong', fd, {
            headers: { 'Content-Type': undefined },
            withCredentials: true,
        });
        return res.data?.urls ?? [];
    }

    async function createImageRecords(lpId: number, urls: string[]) {
        if (!urls.length) return;
        // tạo record ảnh
        await api.post(`/loai-phong/${lpId}/images`, { urls });
        // đặt ảnh đầu làm đại diện (tuỳ chọn)
        try {
            const list = await api.get(`/loai-phong/${lpId}/images`);
            const first = list.data?.[0];
            if (first) await api.put(`/loai-phong/images/${first.IMG_ID}/main`);
        } catch { }
    }

    async function loadBaseFromFixedLP(lp_ma: number) {
        try {
            // gọi thẳng theo LP nguồn + TD cơ bản
            const res = await api.get('/don-gia', {
                params: { TD_MA: TD_BASE_MA, LP_MA: lp_ma, take: 2000 },
            });

            // nếu BE CHƯA hỗ trợ filter LP_MA, fallback filter ở FE:
            const rows = (res.data || []).filter((d: any) =>
                d.LP_MA === lp_ma && Number(d.TD_MA) === TD_BASE_MA
            );

            const map: Record<number, string> = {};
            rows.forEach((d: any) => { map[d.HT_MA] = String(d.DG_DONGIA ?? ''); });
            setSuggest(map); // ← đổ vào các ô input
        } catch (e) {
            // không có giá nguồn thì để trống
            setSuggest({});
        }
    }

    // useEffect(() => {
    //     if (!open) return;
    //     (async () => {
    //         try {
    //             const [htRes, baseRes] = await Promise.all([
    //                 api.get<HT[]>('/hinh-thuc-thue', { params: { take: 100 } }).catch(() => ({ data: [] as HT[] })),
    //                 api.get<any[]>('/don-gia', { params: { TD_MA: TD_BASE_MA, take: 2000 } }).catch(() => ({ data: [] as any[] })),
    //             ]);
    //             setHtList(htRes.data || []);
    //             const map: Record<number, string> = {};
    //             (baseRes.data || []).forEach((d: any) => { map[d.HT_MA] = String(d.DG_DONGIA ?? ''); });
    //             setSuggest(map);
    //         } catch { }
    //     })();
    // }, [open]);
    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                // 1) Lấy danh sách HT để render các ô input
                const htRes = await api
                    .get<HT[]>('/hinh-thuc-thue', { params: { take: 100 } })
                    .catch(() => ({ data: [] as HT[] }));
                setHtList(htRes.data || []);

                // 2) Lấy giá từ LP nguồn cố định (TD cơ bản)
                // Nếu BE hỗ trợ filter theo LP_MA:
                const srcRes = await api
                    .get<any[]>('/don-gia', {
                        params: { TD_MA: TD_BASE_MA, LP_MA: PRICE_SOURCE_LP_MA, take: 2000 },
                    })
                    .catch(() => ({ data: [] as any[] }));

                // Nếu BE CHƯA hỗ trợ LP_MA trong params, dùng filter FE:
                const rows = (srcRes.data || []).filter(
                    (d: any) =>
                        Number(d.LP_MA) === PRICE_SOURCE_LP_MA &&
                        Number(d.TD_MA) === TD_BASE_MA
                );

                const map: Record<number, string> = {};
                rows.forEach((d: any) => {
                    map[d.HT_MA] = String(d.DG_DONGIA ?? '');
                });
                setSuggest(map); // gợi ý giá đổ vào input
            } catch {
                setSuggest({});
            }
        })();
    }, [open]);


    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-3xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Thêm loại phòng mới</h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label className="mb-1 block text-sm">Tên loại phòng *</label>
                    <input
                        ref={nameRef}
                        value={ten}
                        onChange={(e) => setTen(e.target.value)}
                        placeholder="VD: Phòng đơn VIP"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm">Sức chứa *</label>
                    <input
                        type="number" min={1} step={1}
                        value={soNguoi}
                        onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); }}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v === '') { setSoNguoi(''); return; }
                            const n = Math.floor(Number(v));
                            setSoNguoi(n < 1 ? 1 : n);
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                    {soNguoi !== '' && !isSoNguoiValid && (
                        <p className="mt-1 text-xs text-red-500">Phải là số nguyên ≥ 1</p>
                    )}
                </div>

                <div className="sm:col-span-2 mt-2 rounded-lg border p-3">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={useBase}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>{
                                const checked = e.target.checked;
                                setUseBase(checked)
                                if (!checked) {
                                    // bỏ tick → xoá hết giá prefill để không bị lưu
                                    setSuggest({});
                                } else {
                                    // tick lại → có thể reload base để prefill (tuỳ bạn)
                                    // preloadBase(); // nếu bạn viết sẵn hàm nạp giá cơ bản
                                }
                            }} 
                        />
                        <span>Dùng giá cơ bản (TD = {TD_BASE_MA}) — có thể sửa trước khi lưu</span>
                    </label>

                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {htList.map((ht) => (
                            <div key={ht.HT_MA} className="flex items-center gap-2">
                                <div className="w-40 text-sm">{ht.HT_TEN}</div>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="1"
                                    className="w-full rounded border px-2 py-1 text-sm"
                                    placeholder="Nhập đơn giá"
                                    value={suggest[ht.HT_MA] ?? ''}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        let v = e.target.value.trim();
                                        if (v === '') {                         // cho phép để trống
                                            setSuggest(prev => ({ ...prev, [ht.HT_MA]: '' }));
                                            return;
                                        }
                                        // chuẩn hoá & chặn âm
                                        const num = Number(v);
                                        const safe = isNaN(num) ? '' : Math.max(0, num); // không âm
                                        // nếu muốn 2 chữ số thập phân:
                                        const formatted = safe === '' ? '' : String(safe);
                                        setSuggest(prev => ({ ...prev, [ht.HT_MA]: formatted }));
                                    }}
                                   
                                />
                            </div>
                        ))}
                    </div>

                    {/* Lưu ý: hệ thống sẽ tạo đơn giá cho TD cơ bản theo các giá bạn nhập ở trên */}
                </div>

                <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm">Ảnh loại phòng (tùy chọn)</label>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePickFiles}
                        className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 dark:file:border-slate-700 dark:file:bg-slate-800"
                    />
                    {previews.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {previews.map((src, i) => (
                                <div key={i} className="relative">
                                    <img src={src} className="h-16 w-24 rounded object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeAt(i)}
                                        className="absolute -right-2 -top-2 rounded-full bg-black/60 px-2 py-1 text-white text-xs"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Có thể chọn nhiều ảnh. Ảnh đầu sẽ đặt làm ảnh đại diện.</p>
                </div>

            </div>

            {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

            <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Bỏ qua</Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={onSave}>
                    {saving ? 'Đang lưu...' : 'Lưu'}
                </Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={onSaveAndNew}>
                    {saving ? '...' : 'Lưu & Thêm mới'}
                </Button>
            </div>
        </Modal>
    );
}
