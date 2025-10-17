import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import Button from '@/components/ui/button/Button';
import { FilterState } from './BookingToolbar';
import { BookingLite } from '@/app/admin/others-pages/dat-phong/page';

export default function ListView({ bookings }: { bookings: BookingLite[]; filters: FilterState }) {
    return (
        <div className="overflow-auto rounded-xl border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableCell isHeader>STT</TableCell>
                        <TableCell isHeader>Mã đặt phòng</TableCell>
                        <TableCell isHeader>Khách đặt</TableCell>
                        <TableCell isHeader>Lưu trú</TableCell>
                        <TableCell isHeader>Trạng thái</TableCell>
                        <TableCell isHeader className="text-right">Thao tác</TableCell>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {bookings.map((b, i) => (
                        <TableRow key={`${b.HDONG_MA}-${i}`}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell>DP{String(b.HDONG_MA).padStart(6, '0')}</TableCell>
                            <TableCell>{b.KH_TEN || 'Khách lẻ'}</TableCell>
                            <TableCell>{fmt(b.TU_LUC)} → {fmt(b.DEN_LUC)}</TableCell>
                            <TableCell>{b.TRANG_THAI}</TableCell>
                            <TableCell className="text-right">
                                <div className="inline-flex gap-2">
                                    <Button size="sm" variant="outline">Chi tiết</Button>
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
