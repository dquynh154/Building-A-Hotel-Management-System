import Badge from '@/components/ui/badge/Badge';
import { FilterState } from './BookingToolbar';
import type { Phong, BookingLite } from '@/app/admin/others-pages/dat-phong/page';
import Button from '@/components/ui/button/Button';

const statusColor: Record<string, any> = {
    AVAILABLE: 'success', OCCUPIED: 'warning', MAINTENANCE: 'dark', CHUA_DON: 'error'
};

// const fmt = (iso: string) => {
//     const d = new Date(iso); return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
// };

const vnd = (n?: number | null) => (Number(n || 0)).toLocaleString('vi-VN');

const fmt = (iso: string) => {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
        hour12: false,
    }).format(d);
};

export default function BoardView({
    floors, bookings, filters, onQuickBook
}: {
    floors: { TANG_MA: number; floorLabel: string; items: Phong[] }[];
    bookings: BookingLite[];
    filters: FilterState;
    onQuickBook?: (room: Phong) => void; // ✅
}) {
    const bookingByRoom = new Map<number, BookingLite[]>();
    bookings.forEach(b => {
        const arr = bookingByRoom.get(b.PHONG_MA) || [];
        arr.push(b); bookingByRoom.set(b.PHONG_MA, arr);
    });

    return (
        <div className="space-y-6">
            {floors.map(f => (
                <section key={f.TANG_MA}>
                    <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-base font-medium">{f.floorLabel}</h3>
                        <span className="text-xs text-gray-500">({f.items.length})</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {f.items.map(r => {
                            const bs = bookingByRoom.get(r.PHONG_MA) || [];
                            if (!filters.statuses.available && r.PHONG_TRANGTHAI === 'AVAILABLE' && bs.length === 0) return null;

                            return (
                                <div key={r.PHONG_MA} className="rounded-xl border p-4 hover:shadow-sm dark:border-white/10">
                                    <div className="mb-2 flex items-center justify-between">
                                        <div className="text-sm font-medium">{r.PHONG_TEN}</div>
                                        <Badge variant="light" color={statusColor[r.PHONG_TRANGTHAI]} size="sm">
                                            {r.PHONG_TRANGTHAI === 'AVAILABLE' ? 'Phòng trống'
                                                : r.PHONG_TRANGTHAI === 'OCCUPIED' ? 'Đang ở'
                                                    : r.PHONG_TRANGTHAI === 'CHUA_DON' ? 'Chưa dọn' : 'Bảo trì'}
                                        </Badge>
                                    </div>
                                    <div className="text-xs text-gray-500">{r.LOAI_PHONG?.LP_TEN ?? '—'}</div>
                                    {(r.PRICE_HOUR != null || r.PRICE_DAY != null) && (
                                        <div className="mt-1 text-xs text-gray-600">
                                            {r.PRICE_HOUR != null ? `${r.PRICE_HOUR.toLocaleString('vi-VN')}/Giờ` : '—/Giờ'}
                                            {'  ·  '}
                                            {r.PRICE_DAY != null ? `${r.PRICE_DAY.toLocaleString('vi-VN')}/Ngày` : '—/Ngày'}
                                        </div>
                                    )}
                                    
                                    
                                    {/* hiện booking active trong ô */}
                                    <div className="mt-3 space-y-2">
                                        {bs.map(b => (
                                            <div key={`${b.HDONG_MA}-${b.PHONG_MA}`} className="rounded-lg border bg-gray-50 px-3 py-2 text-xs dark:bg-white/5">
                                                <div className="font-medium">{b.KH_TEN || 'Khách lẻ'}</div>
                                                <div>{fmt(b.TU_LUC)} → {fmt(b.DEN_LUC)}</div>
                                                <div className="mt-1 text-[11px] text-gray-500">{b.TRANG_THAI}</div>
                                            </div>
                                        ))}
                                        {bs.length === 0 && <div className="text-xs text-gray-400">Không có đặt phòng.</div>}
                                    </div>

                                    {/* ✅ nút đặt nhanh phòng này */}
                                    <div className="mt-3 flex justify-end">
                                        <Button
                                            size="sm"
                                            variant="primary"
                                            onClick={() => onQuickBook?.(r)}
                                            disabled={r.PHONG_TRANGTHAI !== 'AVAILABLE' && (bs?.length ?? 0) > 0}
                                            // title={r.PHONG_TRANGTHAI === 'AVAILABLE' ? 'Đặt phòng này' : 'Phòng đang bận'}
                                        >
                                            Đặt nhanh
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}

