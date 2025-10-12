'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Button from '@/components/ui/button/Button';
import ThoiDiemCreateModal from '@/components/ui/modal/ThoiDiemSpecialCreateModal';
import { PlusIcon } from '@/icons';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';

type TD = {
    TD_MA: number;
    TD_TEN?: string | null;
    THOI_DIEM_SPECIAL?: {
        TD_NGAY_BAT_DAU: string;
        TD_NGAY_KET_THUC: string;
        TD_MOTA_CHIENDICH?: string | null;
    } | null;
    THOI_DIEM_BASE?: { TD_MOTA_CHUNG?: string | null } | null;
};

export default function TimesPage() {
    const [rows, setRows] = useState<TD[]>([]);
    const [loading, setLoading] = useState(true);
    const [openCreate, setOpenCreate] = useState(false);
    const [editItem, setEditItem] = useState<TD | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const reload = async () => {
        setLoading(true);
        try {
            const res = await api.get('/thoi-diem', { params: { take: 500 } });
            setRows(res.data || []);
        } finally { setLoading(false); }
    };

    useEffect(() => { reload(); }, []);

    const fmt = (d?: string) => {
        if (!d) return '';
        const t = new Date(d);
        return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
    };

    const onDelete = async (td: TD) => {
        if (!confirm(`Xoá thời điểm "${td.TD_TEN ?? ''}"? Hành động này cũng xoá toàn bộ đơn giá của thời điểm.`)) return;
        setErr(null);
        try {
            await api.delete(`/thoi-diem/${td.TD_MA}`);
            await reload();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Xoá thất bại');
        }
    };

    return (
        <div>
             <PageBreadcrumb pageTitle="Quản lý thời điểm" />
        <div className="space-y-4">
            <div className="flex items-center justify-between">
               
                <div className="flex gap-2">
                    <Button size="sm" startIcon={<PlusIcon />} variant="add" onClick={() => setOpenCreate(true)}>Thêm thời điểm</Button>
                </div>
            </div>

            {err && <p className="text-sm text-red-500">{err}</p>}

            {loading ? (
                <div className="p-4 text-slate-500">Đang tải…</div>
            ) : rows.length === 0 ? (
                <div className="p-4 text-slate-500 border rounded">Chưa có thời điểm.</div>
            ) : (
                <div className="overflow-auto rounded border bg-white">
                    <table className="min-w-[800px] w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 bg-white">
                                <th className="p-2 border">Tên</th>
                                <th className="p-2 border w-60">Khoảng ngày</th>
                                <th className="p-2 border">Mô tả</th>
                                <th className="p-2 border">Loại</th>
                                <th className="p-2 border w-60">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(td => {
                                const sp = td.THOI_DIEM_SPECIAL;
                                const isBase = !!td.THOI_DIEM_BASE && !sp;
                                return (
                                    <tr key={td.TD_MA} className="border-t">
                                        <td className="p-2 border">{td.TD_TEN ?? '—'}</td>
                                        <td className="p-2 border">
                                            {sp ? `${fmt(sp.TD_NGAY_BAT_DAU)} – ${fmt(sp.TD_NGAY_KET_THUC)}` : '—'}
                                        </td>
                                        <td className="p-2 border">
                                            {sp?.TD_MOTA_CHIENDICH ?? td.THOI_DIEM_BASE?.TD_MOTA_CHUNG ?? '—'}
                                        </td>
                                        <td className="p-2 border">{isBase ? 'BASE' : (sp ? 'SPECIAL' : '—')}</td>
                                        <td className="p-2 border">
                                            <div className="flex gap-2">
                                                <Button size='sm' variant="outline" onClick={() => setEditItem(td)}>Sửa</Button>
                                                <Button size='sm' variant="danger" onClick={() => onDelete(td)}>Xoá</Button>
                                                <a
                                                    className="inline-flex items-center rounded border px-2 py-1 text-ms"
                                                    href={`/admin/others-pages/gia-dat-biet?td=${td.TD_MA}`} // link qua trang nhập giá
                                                >
                                                    Nhập giá
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal thêm */}
            <ThoiDiemCreateModal
                open={openCreate}
                onClose={() => setOpenCreate(false)}
                onCreated={() => reload()}
            />

            {/* Modal sửa: tái dùng component, truyền initial và dùng PUT */}
            {editItem && (
                <ThoiDiemCreateModal
                    open={!!editItem}
                    onClose={() => setEditItem(null)}
                    // @ts-ignore: thêm prop initial & mode vào component (xem đoạn dưới)
                    initial={{
                        TD_TEN: editItem.TD_TEN ?? '',
                        start: editItem.THOI_DIEM_SPECIAL?.TD_NGAY_BAT_DAU ?? '',
                        end: editItem.THOI_DIEM_SPECIAL?.TD_NGAY_KET_THUC ?? '',
                        desc: editItem.THOI_DIEM_SPECIAL?.TD_MOTA_CHIENDICH
                            ?? editItem.THOI_DIEM_BASE?.TD_MOTA_CHUNG ?? '',
                        type: editItem.THOI_DIEM_SPECIAL ? 'SPECIAL' : 'BASE',
                        TD_MA: editItem.TD_MA,
                    }}
                    mode="edit"
                    onCreated={() => reload()}
                />
            )}
        </div>
        </div>
    );
}
