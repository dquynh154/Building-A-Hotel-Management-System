import { useState } from 'react';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import Button from '@/components/ui/button/Button';
import { FilterState } from './BookingToolbar';
import { BookingLite } from '@/app/admin/(noSidebar)/others-pages/dat-phong/page';
import Link from 'next/link';
export default function ListView({
    bookings
}: {
    bookings: BookingLite[];
    filters: FilterState
}) {
    const [openId, setOpenId] = useState<number | null>(null);
    return (
        <div className="overflow-auto rounded-xl border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">STT</TableCell>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Mã đặt phòng</TableCell>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Khách đặt</TableCell>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Lưu trú</TableCell>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Trạng thái</TableCell>
                        <TableCell isHeader className="px-5 py-3 text-medium   text-theme-xs font-medium text-gray-500 dark:text-gray-400">Thao tác</TableCell>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {bookings.map((b, i) => (
                        <TableRow key={`${b.HDONG_MA}-${i}`}>
                            <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{i + 1}</TableCell>
                            <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">DP{String(b.HDONG_MA).padStart(6, '0')}</TableCell>
                            <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{b.KH_TEN || 'Khách lẻ'}</TableCell>
                            <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{fmt(b.TU_LUC)} → {fmt(b.DEN_LUC)}</TableCell>
                            <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{b.TRANG_THAI}</TableCell>
                            <TableCell className="px-5 py-3 text-theme-sm text-right">
                                <div className="inline-flex items-center gap-2">
                                    <Button size="sm" variant="outline">
                                        <Link href={`/admin/others-pages/chi-tiet/${b.HDONG_MA}`}>Chi tiết</Link>
                                    </Button>
                                    <Button size="sm" variant="danger">Huỷ</Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                    {bookings.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="py-8 text-center text-gray-500">Không có dữ liệu.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { hour12: false });
