'use client';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import { absUrl } from '@/lib/url';
type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
type Tang = { TANG_MA: number; TANG_TEN: string };
type LoaiPhong = { LP_MA: number; LP_TEN: string };
const TD_BASE_MA = 1;
type HT = { HT_MA: number; HT_TEN: string };
export default function PhongEditModal({
    open, id, onClose, onUpdated,
}: {
    open: boolean;
    id: number | null;
    onClose: () => void;
    onUpdated?: () => void;
}) {
    const [htList, setHtList] = useState<HT[]>([]);
    const [typePrices, setTypePrices] = useState<Record<number, string>>({});
    const [typeImages, setTypeImages] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // fields
    const [ten, setTen] = useState('');
    const [lpMa, setLpMa] = useState<number | ''>('');
    const [tangMa, setTangMa] = useState<number | ''>('');
    const [trangThai, setTrangThai] = useState<RoomStatus>('AVAILABLE');

    // options
    const [lpOptions, setLpOptions] = useState<LoaiPhong[]>([]);
    const [tangOptions, setTangOptions] = useState<Tang[]>([]);

    const firstRef = useRef<HTMLInputElement>(null);

    // load room + options
    useEffect(() => {
        if (!open || !id) return;
        (async () => {
            setLoading(true); setErr(null);
            try {
                // song song gọi info + options
                const [infoRes, lpRes] = await Promise.all([
                    api.get(`/phong/${id}`),
                    api.get(`/loai-phong`),                  // staffOrAdmin: OK
                ]);

                const r = infoRes.data;
                setTen(r.PHONG_TEN ?? '');
                setLpMa(r.LP_MA ?? '');
                setTangMa(r.TANG_MA ?? '');
                setTrangThai((r.PHONG_TRANGTHAI ?? 'AVAILABLE') as RoomStatus);

                setLpOptions(lpRes.data ?? []);

                // Tầng: BE của bạn đang onlyAdmin ở GET /tang
                // -> nếu 403 thì fallback để UI vẫn dùng giá trị hiện có
                try {
                    const t = await api.get('/tang');
                    setTangOptions(t.data ?? []);
                } catch {
                    // bỏ qua nếu không có quyền
                }

                // focus nhẹ
                setTimeout(() => firstRef.current?.focus(), 50);
            } catch (e: any) {
                setErr(e?.response?.data?.message || 'Không tải được dữ liệu phòng');
            } finally { setLoading(false); }
        })();
    }, [open, id]);
    useEffect(() => {
        if (!open || !lpMa) { setTypePrices({}); setTypeImages([]); return; }
        (async () => {
            try {
                const htRes = await api.get<HT[]>('/hinh-thuc-thue', { params: { take: 200 } }).catch(() => ({ data: [] as HT[] }));
                setHtList(htRes.data || []);

                const dgRes = await api.get<any[]>('/don-gia', { params: { LP_MA: lpMa, TD_MA: TD_BASE_MA, take: 2000 } })
                    .catch(() => ({ data: [] as any[] }));
                const map: Record<number, string> = {};
                (dgRes.data || []).forEach((d: any) => { map[d.HT_MA] = String(d.DG_DONGIA ?? ''); });
                setTypePrices(map);

                const imgRes = await api.get<any[]>(`/loai-phong/${lpMa}/images`).catch(() => ({ data: [] as any[] }));
                setTypeImages(imgRes.data || []);
            } catch {
                setTypePrices({}); setTypeImages([]);
            }
        })();
    }, [open, lpMa]);

    const canSave =
        ten.trim().length > 0 &&
        (lpMa === '' ? false : Number.isInteger(Number(lpMa))) &&
        (tangMa === '' ? false : Number.isInteger(Number(tangMa))) &&
        !saving;

    async function save() {
        if (!id || !canSave) return;
        setSaving(true); setErr(null);
        try {
            await api.put(`/phong/${id}`, {
                PHONG_TEN: ten.trim(),
                LP_MA: Number(lpMa),
                TANG_MA: Number(tangMa),
                PHONG_TRANGTHAI: trangThai,
            });
            onUpdated?.();
            onClose();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Cập nhật phòng thất bại');
        } finally { setSaving(false); }
    }

    async function hardDelete() {
        if (!id) return;
        if (!confirm('Xoá vĩnh viễn phòng này?')) return;
        try {
            await api.delete(`/phong/${id}`);
            onUpdated?.();
            onClose();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Xoá thất bại (có thể đang được sử dụng)');
        }
    }

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-3xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Sửa phòng</h3>

            {loading ? (
                <div className="p-6 text-slate-500">Đang tải…</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm">Tên phòng *</label>
                            <input
                                ref={firstRef}
                                className="w-full rounded-lg border px-3 py-2 text-sm"
                                value={ten}
                                onChange={e => setTen(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm">Loại phòng *</label>
                            <select
                                className="w-full rounded-lg border px-3 py-2 text-sm"
                                value={lpMa}
                                onChange={e => setLpMa(e.target.value === '' ? '' : Number(e.target.value))}
                            >
                                <option value="">— chọn —</option>
                                {lpOptions.map(op => (
                                    <option key={op.LP_MA} value={op.LP_MA}>{op.LP_TEN}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm">Tầng *</label>
                            <select
                                className="w-full rounded-lg border px-3 py-2 text-sm"
                                value={tangMa}
                                onChange={e => setTangMa(e.target.value === '' ? '' : Number(e.target.value))}
                            >
                                <option value="">— chọn —</option>
                                {tangOptions.map(t => (
                                    <option key={t.TANG_MA} value={t.TANG_MA}>{t.TANG_TEN}</option>
                                ))}
                            </select>
                            {/* Nếu không load được /tang (403), bạn vẫn có thể nhập số: */}
                            {tangOptions.length === 0 && (
                                <p className="mt-1 text-xs text-amber-600">
                                    Không lấy được danh sách tầng (cần quyền ADMIN?). Vẫn giữ tầng hiện tại.
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="mb-1 block text-sm">Trạng thái</label>
                            <select
                                className="w-full rounded-lg border px-3 py-2 text-sm"
                                value={trangThai}
                                onChange={e => setTrangThai(e.target.value as RoomStatus)}
                            >
                                <option value="AVAILABLE">Trống</option>
                                <option value="OCCUPIED">Đang ở</option>
                                <option value="MAINTENANCE">Bảo trì</option>
                            </select>
                        </div>
                        {/* Thông tin loại phòng đã chọn (chỉ hiển thị) */}
                        {lpMa && (
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

                    <div className="mt-6 flex flex-wrap justify-between gap-2">
                        <div className="flex gap-2">
                            <Button variant="danger" size="sm" onClick={hardDelete}>Xoá</Button>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="light" size="sm" onClick={onClose}>Đóng</Button>
                            <Button variant="primary" size="sm" disabled={!canSave} onClick={save}>
                                {saving ? 'Đang lưu…' : 'Cập nhật'}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </Modal>
    );
}
