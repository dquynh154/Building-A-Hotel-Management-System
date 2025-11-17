import React from 'react';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import Button from '@/components/ui/button/Button';

export type DanhGiaRow = {
    DG_MA: number;
    KH_MA: number;
    HDONG_MA: number;
    CTDP_ID?: number | null;

    DG_SAO: number;
    DG_TIEU_DE: string;
    DG_NOI_DUNG?: string | null;

    DG_TRANG_THAI: 'PUBLISHED' | 'ARCHIVED';
    DG_TAO_LUC: string;

    KHACH_HANG?: { KH_HOTEN?: string | null, KH_SDT?: string | null } | null;
    DINH_KEMS?: { DKDG_MA: number; DKDG_LOAI: 'IMAGE' | 'VIDEO'; DKDG_URL: string; DKDG_CHUTHICH?: string | null }[];
    PHAN_HOI?: { PH_MA: number; NV_MA: number; PH_NOIDUNG: string; PH_TRANG_THAI: string; PH_TAO_LUC: string; PH_SUA_LUC: string } | null;
};

const dateVi = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN');
};

export default function DanhGiaTable({
    rows,
    onReply,
    onToggleStatus,
    onView,
}: {
    rows: DanhGiaRow[];
    onReply?: (row: DanhGiaRow) => void;
    onToggleStatus?: (row: DanhGiaRow) => void;
    onView?: (row: DanhGiaRow) => void;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
                <div className="min-w-[1100px]">
                    <Table>
                        <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                            <TableRow>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500">#</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500">Thời gian</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500">Khách</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500">HĐ</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500">Sao</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500">Tiêu đề & Nội dung</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500">Ảnh</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500">Phản hồi</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-end   text-theme-xs font-medium text-gray-500">Thao tác</TableCell>
                            </TableRow>
                        </TableHeader>

                        <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                            {rows.map((r) => {
                                const imgCount = (r.DINH_KEMS || []).filter(k => k.DKDG_LOAI === 'IMAGE').length;
                                return (
                                    <TableRow key={r.DG_MA} className="hover:bg-gray-50 dark:hover:bg-white/5">
                                        <TableCell className="px-5 py-3 text-theme-sm">{r.DG_MA}</TableCell>
                                        <TableCell className="px-5 py-3 text-theme-sm">{dateVi(r.DG_TAO_LUC)}</TableCell>
                                        <TableCell className="px-5 py-3 text-theme-sm">
                                            {r.KHACH_HANG?.KH_HOTEN || '—'}
                                        </TableCell>
                                        <TableCell className="px-5 py-3 text-theme-sm">#{r.HDONG_MA}</TableCell>
                                        <TableCell className="px-5 py-3 text-theme-sm">{'★'.repeat(r.DG_SAO)}</TableCell>
                                        <TableCell className="px-5 py-3 text-theme-sm">
                                            <div className="font-medium">{r.DG_TIEU_DE}</div>
                                            <div className="text-gray-600 line-clamp-2">{r.DG_NOI_DUNG || '—'}</div>
                                        </TableCell>
                                        <TableCell className="px-5 py-3 text-theme-sm">
                                            {imgCount ? `${imgCount} ảnh` : '—'}
                                        </TableCell>
                                        <TableCell className="px-5 py-3 text-theme-sm">
                                            {r.PHAN_HOI ? 'Đã phản hồi' : 'Chưa phản hồi'}
                                        </TableCell>
                                        <TableCell className="px-5 py-3 text-theme-sm text-right">
                                            <div className="inline-flex items-center gap-2">
                                                <Button size="sm" variant="outline" onClick={() => onView?.(r)}>Xem</Button>
                                                <Button size="sm" variant="primary" onClick={() => onReply?.(r)}>
                                                    {r.PHAN_HOI ? 'Sửa phản hồi' : 'Phản hồi'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    // variant={r.DG_TRANG_THAI === 'PUBLISHED' ? 'danger' : 'success'}
                                                    onClick={() => onToggleStatus?.(r)}
                                                >
                                                    {r.DG_TRANG_THAI === 'PUBLISHED' ? 'Ẩn' : 'Hiện'}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}

                            {rows.length === 0 && (
                                <TableRow>
                                    <td colSpan={9} className="px-5 py-8 text-center text-gray-500">Chưa có đánh giá</td>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
