import { useMemo } from 'react';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import Button from '@/components/ui/button/Button';
// Nếu bạn có type BookingLite đã export ở page.tsx thì import lại:
import { BookingLite } from '@/app/admin/(noSidebar)/others-pages/dat-phong/page';
import { FilterState } from './BookingToolbar';
import api from '@/lib/api';

type GroupedBooking = BookingLite & { count: number };

function fmt(iso?: string) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(+d)) return '—';
    return d.toLocaleString('vi-VN', { hour12: false });
}

function stayRange(b: BookingLite) {
    const plannedFrom = b.TU_LUC;
    const plannedTo = b.DEN_LUC;
    const actualFrom = b.HDONG_NGAYTHUCNHAN || null;
    const actualTo = b.HDONG_NGAYTHUCTRA || null;

    // Logic theo trạng thái
    if (b.TRANG_THAI === 'CONFIRMED') {
        return { from: plannedFrom, to: plannedTo, label: 'dự kiến' as const };
    }
    if (b.TRANG_THAI === 'CHECKED_IN') {
        return { from: actualFrom ?? plannedFrom, to: actualTo ?? plannedTo, label: 'thực' as const };
    }
    // CHECKED_OUT / CANCELLED / ...
    const usedFrom = actualFrom ?? plannedFrom;
    const usedTo = actualTo ?? plannedTo;
    const label = actualFrom ? ('thực' as const) : ('dự kiến' as const);
    return { from: usedFrom, to: usedTo, label };
}

export default function ListView({
    bookings,
}: {
    bookings: BookingLite[];
    filters: FilterState;
}) {
    // Gộp theo HDONG_MA để chỉ hiển thị 1 dòng/hợp đồng
    const grouped = useMemo<GroupedBooking[]>(() => {
        const map = new Map<number, GroupedBooking>();
        for (const b of bookings) {
            const ex = map.get(b.HDONG_MA);
            if (!ex) {
                map.set(b.HDONG_MA, { ...b, count: 1 });
            } else {
                ex.count += 1;
                // Lấy khoảng thời gian bao trùm để list nhìn hợp lý
                if (new Date(b.TU_LUC) < new Date(ex.TU_LUC)) ex.TU_LUC = b.TU_LUC;
                if (new Date(b.DEN_LUC) > new Date(ex.DEN_LUC)) ex.DEN_LUC = b.DEN_LUC;
            }
        }
        return Array.from(map.values());
    }, [bookings]);
    const STATUS_META: Record<string, { text: string; cls: string }> = {
        PENDING: { text: 'CHỜ CỌC', cls: 'bg-amber-100 text-amber-700' },
        CONFIRMED: { text: 'ĐÃ XÁC NHẬN', cls: 'bg-sky-100 text-sky-700' },
        CHECKED_IN: { text: 'ĐANG LƯU TRÚ', cls: 'bg-emerald-100 text-emerald-700' },
        CHECKED_OUT: { text: 'ĐÃ TRẢ PHÒNG', cls: 'bg-slate-200 text-slate-700' },
        CANCELLED: { text: 'ĐÃ HỦY ĐẶT PHÒNG', cls: 'bg-rose-100 text-rose-700' },
        NO_SHOW: { text: 'NO SHOW', cls: 'bg-zinc-100 text-zinc-700' },
        DEFAULT: { text: 'UNKNOWN', cls: 'bg-gray-100 text-gray-600' },
    };

    function StatusPill({ status }: { status?: string }) {
        const key = (status || '').toUpperCase();
        const meta = STATUS_META[key] ?? STATUS_META.DEFAULT;
        return (
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
                {meta.text}
            </span>
        );
    }

    return (
        <div className="overflow-auto rounded-xl border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                            STT
                        </TableCell>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                            Mã đặt phòng
                        </TableCell>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                            Khách đặt
                        </TableCell>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                            Lưu trú
                        </TableCell>
                        <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                            Trạng thái
                        </TableCell>
                        <TableCell isHeader className="px-5 py-3 text-medium text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                            Thao tác
                        </TableCell>
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {grouped.map((b, i) => {
                        const r = stayRange(b);
                        return (
                            <TableRow key={b.HDONG_MA}>
                                <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{i + 1}</TableCell>
                                <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                    {`DP${String(b.HDONG_MA).padStart(6, '0')}`}
                                </TableCell>
                                <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                    {b.KH_TEN || 'Khách lẻ'}
                                </TableCell>
                                <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                    <div className="flex items-center gap-2">
                                        <span>
                                            {fmt(r.from)} → {fmt(r.to)}
                                        </span>
                                        {/* <span
                                            className={
                                                r.label === 'thực'
                                                    ? 'rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
                                                    : 'rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600'
                                            }
                                        >
                                            {r.label}
                                        </span> */}
                                    </div>
                                </TableCell>
                                <TableCell className="px-5 py-3 text-theme-sm">
                                    <StatusPill status={b.TRANG_THAI} />
                                </TableCell>

                                <TableCell className="px-5 py-3 text-theme-sm text-right">
                                    <div className="inline-flex items-center gap-2">
                                        <Button size="sm" variant="outline">
                                            <Link href={`/admin/others-pages/chi-tiet/${b.HDONG_MA}`}>Chi tiết</Link>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            disabled={['CHECKED_OUT', 'CANCELLED','CHECKED_IN'].includes(b.TRANG_THAI)}
                                            onClick={async () => {
                                                if (['CHECKED_OUT', 'CANCELLED'].includes(b.TRANG_THAI)) return;

                                                const confirmMsg =
                                                    b.TRANG_THAI === 'CONFIRMED'
                                                        ? 'Huỷ hợp đồng này sẽ giữ lại tiền cọc. Bạn có chắc muốn huỷ không?'
                                                        : 'Bạn có chắc chắn muốn huỷ hợp đồng này?';
                                                if (!confirm(confirmMsg)) return;

                                                const reason = prompt('Nhập lý do huỷ hợp đồng (bắt buộc):', '');
                                                if (!reason || !reason.trim()) {
                                                    alert('Vui lòng nhập lý do huỷ hợp đồng.');
                                                    return;
                                                }

                                                try {
                                                    const res = await api.post(`/bookings/${b.HDONG_MA}/cancel`, { reason });
                                                    alert('Đã huỷ hợp đồng thành công.');
                                                    window.location.reload();
                                                } catch (err: any) {
                                                    const msg = err.response?.data?.message || 'Không thể huỷ hợp đồng.';
                                                    alert(msg);
                                                }

                                            }}
                                        >
                                            Huỷ
                                        </Button>


                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}

                    {grouped.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} className="py-8 text-center text-gray-500">
                                Không có dữ liệu.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
