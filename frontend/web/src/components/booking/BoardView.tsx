import Badge from '@/components/ui/badge/Badge';
import { FilterState } from './BookingToolbar';
import type { Phong, BookingLite } from '@/app/admin/(noSidebar)/others-pages/dat-phong/page';
import Button from '@/components/ui/button/Button';
import { useState } from 'react';
import api from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { BaCham } from '@/icons';
import RoomDetailModal from '../ui/modal/RoomDetailModal';
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@/components/ui/popover";

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


    const [selectedRoom, setSelectedRoom] = useState<Phong | null>(null);
    const [openModal, setOpenModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
    const handleOpenModal = (room: Phong) => {
        setSelectedRoom(room);
        setOpenModal(true);
    };

    const handleSetClean = async () => {
        if (!selectedRoom) return;
        try {
            setLoading(true);
            await api.post(`/rooms/${selectedRoom.PHONG_MA}/set-clean`);
            setOpenModal(false);
            setSelectedRoom(null);
            // Reload danh sách hoặc refetch dữ liệu phòng
            window.location.reload();
        } catch (e) {
            alert('Không đổi được trạng thái phòng');
        } finally {
            setLoading(false);
        }
    };

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
                            const bsAll = bookingByRoom.get(r.PHONG_MA) || [];
                            let bs: BookingLite[] = [];

                            if (r.PHONG_TRANGTHAI === 'OCCUPIED') {
                                // 🔹 Nếu phòng đang có người ở → lấy hợp đồng đang ở
                                const active = bsAll.find(b =>
                                    ['IN_PROGRESS', 'CHECKED_IN', 'ONGOING'].includes(b.TRANG_THAI)
                                );
                                if (active) bs = [active];
                            } else {
                                // 🔹 Nếu phòng trống hoặc đã dọn → lấy booking sắp tới gần nhất
                                const now = new Date().getTime();
                                const future = bsAll
                                    .filter(b => new Date(b.TU_LUC).getTime() >= now)
                                    .sort((a, b) => new Date(a.TU_LUC).getTime() - new Date(b.TU_LUC).getTime());
                                if (future.length > 0) bs = [future[0]];
                            }
                            const now = Date.now();

                            // Tìm booking gần nhất (để xác định “sắp đến”)
                            const future = bsAll
                                .filter(b => ['CONFIRMED', 'PENDING'].includes(b.TRANG_THAI))
                                .filter(b => new Date(b.TU_LUC).getTime() > now)
                                .sort((a, b) => new Date(a.TU_LUC).getTime() - new Date(b.TU_LUC).getTime());
                            const upcoming = future[0];

                            // Xác định class màu theo trạng thái
                            let statusClass = '';
                            if (r.PHONG_TRANGTHAI === 'CHUA_DON') {
                                statusClass = 'bg-yellow-50 border-yellow-300'; // 🟨 Chưa dọn
                            } else if (r.PHONG_TRANGTHAI === 'OCCUPIED') {
                                statusClass = 'bg-green-50 border-green-300';   // 🟩 Đang sử dụng
                            } else if (upcoming) {
                                statusClass = 'bg-orange-50 border-orange-300'; // 🟧 Sắp đến
                            } else {
                                statusClass = 'bg-gray-50 border-gray-300';     // ⬜ Phòng trống
                            }
                            if (!filters.statuses.available && r.PHONG_TRANGTHAI === 'AVAILABLE' && bs.length === 0) return null;

                            return (
                                <div key={r.PHONG_MA}
                                    className={`relative rounded-xl border p-4 hover:shadow-sm dark:border-white/10 transition ${statusClass}`}

                                >
                                    <div className="mb-2 flex items-center justify-between">
                                        <div
                                            className={`px-2 py-1 text-sm font-semibold rounded-md text-white
    ${r.PHONG_TRANGTHAI === 'CHUA_DON'
                                                    ? 'bg-yellow-500 border border-yellow-600 text-black'
                                                    : r.PHONG_TRANGTHAI === 'OCCUPIED'
                                                        ? 'bg-green-600 border border-green-700'
                                                        : upcoming
                                                            ? 'bg-orange-500 border border-orange-600'
                                                            : 'bg-gray-400 border border-gray-500'
                                                }`}
                                        >
                                            {r.PHONG_TEN}
                                        </div>

                                        <button
                                            className="text-gray-900 hover:text-gray-700"
                                            onClick={() => handleOpenModal(r)}
                                            title="Thay đổi trạng thái phòng"
                                        >
                                            {<BaCham />}
                                        </button>

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
                                    {/* <div className="mt-3 space-y-2">
                                        {bs.map(b => (
                                            
                                            <div key={`${b.HDONG_MA}-${b.PHONG_MA}`} onClick={() => setSelectedBooking(b)}
 className="rounded-lg border bg-gray-50 px-3 py-2 text-xs dark:bg-white/5">
                                                <div className="font-medium">{b.KH_TEN || 'Khách lẻ'}</div>
                                                <div>{fmt(b.TU_LUC)} → {fmt(b.DEN_LUC)}</div>
                                                <div className="mt-1 text-[11px] text-gray-500">{b.TRANG_THAI}</div>
                                            </div>
                                        ))}
                                        {bs.length === 0 && <div className="text-xs text-gray-400">Không có đặt phòng.</div>}
                                    </div> */}


                                    <div className="mt-3 space-y-2">
                                        {bs.map(b => (
                                            <Popover key={`${b.HDONG_MA}-${b.PHONG_MA}`}>
                                                <PopoverTrigger asChild>
                                                    <div
                                                        className="cursor-pointer rounded-lg border bg-gray-50 px-3 py-2 text-xs hover:bg-gray-100 dark:bg-white/5"
                                                    >
                                                        <div className="font-medium">{b.KH_TEN || 'Khách lẻ'}</div>
                                                        <div>{fmt(b.TU_LUC)} → {fmt(b.DEN_LUC)}</div>
                                                        {/* <div className="mt-1 text-[11px] text-gray-500">{b.TRANG_THAI}</div> */}
                                                    </div>
                                                </PopoverTrigger>

                                                <PopoverContent
                                                    align="center"
                                                    side="bottom"
                                                    className="w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
                                                >
                                                    <div className="space-y-1 text-sm text-slate-700">
                                                        <div className="flex justify-between items-center">
                                                            <div className="font-semibold">
                                                                {`${b.PHONG_TEN}`}
                                                            </div>
                                                            <span className="text-xs text-green-600 font-medium">
                                                                {b.TRANG_THAI}
                                                            </span>
                                                        </div>

                                                        <div><b>Khách:</b> {b.KH_TEN || "Khách lẻ"}</div>
                                                        <div><b>Thời gian:</b> {fmt(b.TU_LUC)} → {fmt(b.DEN_LUC)}</div>
                                                        <div><b>Giá:</b> {vnd(b.HDONG_MA)}</div>

                                                        <div className="flex justify-end gap-2 pt-3">
                                                            <button
                                                                className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
                                                                onClick={() => alert("Gọi API trả phòng")}
                                                            >
                                                                Trả phòng
                                                            </button>
                                                            <button
                                                                className="rounded-md bg-amber-500 px-2 py-1 text-xs text-white hover:bg-amber-600"
                                                                onClick={() => alert("Gọi API đổi phòng")}
                                                            >
                                                                Đổi phòng
                                                            </button>
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        ))}

                                        {bs.length === 0 && (
                                            <div className="text-xs text-gray-400">Không có đặt phòng.</div>
                                        )}
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

            <Modal
                isOpen={openModal}
                onClose={() => setOpenModal(false)}
                className="max-w-sm p-6"
            >
                <h3 className="mb-3 text-base font-medium">Chuyển trạng thái phòng</h3>

                <p className="text-sm text-gray-700 mb-6">
                    Chuyển trạng thái <b>{selectedRoom?.PHONG_TEN}</b> thành
                    <span className="text-green-600 font-medium"> Sạch</span>?
                </p>

                {/* nút hành động - góc dưới phải */}
                <div className="mt-6 flex justify-end gap-3">
                    <button
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
                        onClick={() => setOpenModal(false)}
                    >
                        Bỏ qua
                    </button>
                    <button
                        disabled={loading}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                        onClick={handleSetClean}
                    >
                        Đồng ý
                    </button>
                </div>
            </Modal>




        </div>


    );
}

