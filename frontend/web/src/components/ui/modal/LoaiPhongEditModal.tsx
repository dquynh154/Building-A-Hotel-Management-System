'use client';
import { useEffect, useState, useRef } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import { absUrl } from '@/lib/url';
export default function LoaiPhongEditModal({
    open, id, onClose, onUpdated,
}: {
    open: boolean;
    id: number | null;
    onClose: () => void;
    onUpdated?: () => void;
}) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [ten, setTen] = useState('');
    const [soNguoi, setSoNguoi] = useState<number | ''>('');
    const [trangThai, setTrangThai] = useState<'DANG_KINH_DOANH' | 'NGUNG_KINH_DOANH'>('DANG_KINH_DOANH');

    // ảnh (đơn giản: chỉ hiển thị, nâng cấp sau)
    const [images, setImages] = useState<any[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!open || !id) return;
        (async () => {
            setLoading(true); setErr(null);
            try {
                const [info, imgs] = await Promise.all([
                    api.get(`/loai-phong/${id}`),
                    api.get(`/loai-phong/${id}/images`).catch(() => ({ data: [] })),
                ]);
                console.log('LP images =', imgs.data);
                const r = info.data;
                setTen(r.LP_TEN ?? '');
                setSoNguoi(r.LP_SONGUOI ?? '');
                setTrangThai(r.LP_TRANGTHAI ?? 'DANG_KINH_DOANH');
                setImages(imgs.data ?? []);
            } catch (e: any) {
                setErr(e?.response?.data?.message || 'Không tải được dữ liệu');
            } finally { setLoading(false); }
        })();
    }, [open, id]);

    const canSave = ten.trim().length > 0 && (soNguoi === '' || (Number.isInteger(Number(soNguoi)) && Number(soNguoi) >= 1)) && !saving;

    const save = async () => {
        if (!id || !canSave) return;
        setSaving(true); setErr(null);
        try {
            await api.put(`/loai-phong/${id}`, {
                LP_TEN: ten.trim(),
                ...(soNguoi === '' ? { LP_SONGUOI: null } : { LP_SONGUOI: Number(soNguoi) }),
                LP_TRANGTHAI: trangThai,
            });
            onUpdated?.();
            onClose();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Cập nhật thất bại');
        } finally { setSaving(false); }
    };

    // Soft delete / ngừng kinh doanh
    const toggleKinhDoanh = async () => {
        if (!id) return;
        const next = trangThai === 'DANG_KINH_DOANH' ? 'NGUNG_KINH_DOANH' : 'DANG_KINH_DOANH';
        await api.put(`/loai-phong/${id}`, { LP_TRANGTHAI: next });
        setTrangThai(next);
        onUpdated?.();
    };

    // Xoá cứng (chỉ nếu không có phòng nào tham chiếu)
    const hardDelete = async () => {
        if (!id) return;
        if (!confirm('Xoá vĩnh viễn loại phòng này?')) return;
        try {
            await api.delete(`/loai-phong/${id}`);
            onUpdated?.();
            onClose();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Xoá thất bại (có thể đang được sử dụng)');
        }
    };
    // tải lại danh sách ảnh sau các thao tác
    async function reloadImages() {
        if (!id) return;
        const imgs = await api.get(`/loai-phong/${id}/images`).catch(() => ({ data: [] }));
        setImages(imgs.data || []);
    }

    // upload thêm ảnh (chọn nhiều file)
    // async function uploadMore(e: React.ChangeEvent<HTMLInputElement>) {
    //     const files = Array.from(e.target.files || []);
    //     e.currentTarget.value = ''; // cho phép chọn lại cùng file
    //     if (!files.length || !id) return;

    //     const fd = new FormData();
    //     files.forEach((f) => fd.append('files', f)); // field name: 'files'
    //     const up = await api.post('/upload/loai-phong', fd);
    //     const urls: string[] = up.data?.urls || [];

    //     if (urls.length) {
    //         await api.post(`/loai-phong/${id}/images`, { urls });
    //         await reloadImages();
    //     }
    // }

    async function uploadMore(e: React.ChangeEvent<HTMLInputElement>) {
        const picked = Array.from(e.target.files || []);
        e.currentTarget.value = ''; // cho chọn lại cùng file lần sau
        if (!picked.length || !id) return;

        try {
            // 1) upload file lên server
            const fd = new FormData();
            picked.forEach(f => fd.append('files', f)); // field: 'files'

            const up = await api.post('/upload/loai-phong', fd, {
                // QUAN TRỌNG: để axios tự set multipart boundary
                headers: { 'Content-Type': undefined },
                withCredentials: true,
            });

            const urls: string[] = up.data?.urls || [];
            if (!urls.length) {
                setErr('Upload không trả về URL hợp lệ');
                return;
            }

            // 2) ghi record ảnh vào DB
            const resp = await api.post(`/loai-phong/${id}/images`, { urls });
            // nếu route này đang onlyAdmin mà bạn login lễ tân => 403
            // -> đổi BE thành staffOrAdmin hoặc login ADMIN

            // 3) reload danh sách ảnh
            await reloadImages();
        } catch (err: any) {
            console.error('UPLOAD_MORE_ERR', err?.response?.status, err?.response?.data || err);
            setErr(err?.response?.data?.message || 'Thêm ảnh thất bại');
        }
    }


    // đặt ảnh đại diện
    async function setMain(imgId: number) {
        await api.put(`/loai-phong/images/${imgId}/main`);
        await reloadImages();
    }

    // xoá ảnh
    async function removeImg(imgId: number) {
        if (!confirm('Xoá ảnh này?')) return;
        await api.delete(`/loai-phong/images/${imgId}`);
        await reloadImages();
    }

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-4xl p-5 sm:p-6">
            <h3 className="mb-4 text-base font-medium">Sửa loại phòng</h3>

            {loading ? (
                <div className="p-6 text-slate-500">Đang tải…</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm">Tên loại phòng *</label>
                            <input className="w-full rounded-lg border px-3 py-2 text-sm" value={ten} onChange={e => setTen(e.target.value)} />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm">Sức chứa</label>
                            <input
                                type="number" min={1} step={1}
                                value={soNguoi}
                                onChange={e => setSoNguoi(e.target.value === '' ? '' : Math.max(1, Math.floor(Number(e.target.value))))}
                                className="w-full rounded-lg border px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm">Trạng thái</label>
                            <select className="w-full rounded-lg border px-3 py-2 text-sm" value={trangThai} onChange={e => setTrangThai(e.target.value as any)}>
                                <option value="DANG_KINH_DOANH">Đang kinh doanh</option>
                                <option value="NGUNG_KINH_DOANH">Ngừng kinh doanh</option>
                            </select>
                        </div>
                    </div>

                    {/* ảnh xem nhanh */}
                        <div className="mt-6 rounded-xl border p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <div className="text-sm text-slate-500">
                                    Ảnh đầu tiên/ảnh đánh dấu sẽ là ảnh đại diện.
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={uploadMore}
                                    />
                                    <Button size="sm" variant="primary" onClick={() => fileRef.current?.click()}>
                                        Thêm ảnh
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                                {images.map((img: any) => (
                                    <div key={img.IMG_ID} className="group relative rounded-lg border p-2">
                                        <img
                                            src={absUrl(img.URL)}  
                                            className="h-36 w-full rounded object-cover"
                                        />
                                        {img.IS_MAIN && (
                                            <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
                                                Đại diện
                                            </span>
                                        )}
                                        <div className="mt-2 flex justify-between gap-2">
                                            <button
                                                className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
                                                onClick={() => setMain(img.IMG_ID)}
                                                disabled={!!img.IS_MAIN}
                                            >
                                                Đặt đại diện
                                            </button>
                                            <button
                                                className="rounded border border-red-500 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                                onClick={() => removeImg(img.IMG_ID)}
                                            >
                                                Xoá
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {!images.length && (
                                    <div className="col-span-full rounded-lg border p-6 text-center text-slate-500">
                                        Chưa có ảnh
                                    </div>
                                )}
                            </div>
                        </div>

                    {err && <p className="mt-3 text-sm text-red-500">{err}</p>}

                    <div className="mt-6 flex flex-wrap justify-between gap-2">
                        <div className="flex gap-2">
                            <Button variant="danger" size="sm" onClick={hardDelete}>Xoá</Button>
                            <Button variant="warning" size="sm" onClick={toggleKinhDoanh}>
                                {trangThai === 'DANG_KINH_DOANH' ? 'Ngừng kinh doanh' : 'Bật kinh doanh'}
                            </Button>
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
