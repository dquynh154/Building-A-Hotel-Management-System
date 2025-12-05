'use client';

import { useEffect, useMemo, useState } from 'react';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import Button from '@/components/ui/button/Button';
import { Search, PlusIcon } from '@/icons';
import api from '@/lib/api';
import BookingToolbar, { ViewMode, FilterState } from '@/components/booking/BookingToolbar';
import BoardView from '@/components/booking/BoardView';
import ListView from '@/components/booking/ListView';
import TimelineView from '@/components/booking/TimelineView';
import ComponentCard from '@/components/common/ComponentCard';
import BookingCreateModal from '@/components/ui/modal/BookingCreateModal';
import BookingCreateToolBarModal from '@/components/ui/modal/BookingCreateToolBarModal';
export type Phong = {
    PHONG_MA: number;
    PHONG_TEN: string;
    PHONG_TRANGTHAI: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'CHUA_DON';
    TANG_MA: number;
    TANG?: { TANG_TEN?: string | null; TANG_SO?: number | null } | null;
    LOAI_PHONG?: {
        LP_TEN?: string | null;
        LP_MA?: number | null;
    } | null; // thêm LP_MA nếu BE trả
    PRICE_HOUR?: number | null;
    PRICE_DAY?: number | null;
};

export type BookingLite = {
    HDONG_MA: number;
    KH_TEN?: string | null;
    PHONG_MA: number;
    PHONG_TEN: string;
    HT_MA: number;
    TU_LUC: string; DEN_LUC: string; // ISO
    TRANG_THAI: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';
    HDONG_NGAYTHUCNHAN: string;
    HDONG_NGAYTHUCTRA: string;
    HDONG_TONGTIENDUKIEN: string;
};

export default function BookingPage() {
    const [mode, setMode] = useState<ViewMode>('board');
    const [filters, setFilters] = useState<FilterState>({
        statuses: { prebook: true, inuse: true, checkout: true, available: true },
        search: '',
        range: { from: null, to: null },
    });

    const [rooms, setRooms] = useState<Phong[]>([]);
    const [bookings, setBookings] = useState<BookingLite[]>([]);
    const [loading, setLoading] = useState(true);

    // 👉 state cho “tạo nhanh”
    const [openCreate, setOpenCreate] = useState(false);
    const [initialForCreate, setInitialForCreate] = useState<any>(undefined);
    const [openBulk, setOpenBulk] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>(''); // '' = tất cả
    const filteredBookings = useMemo(() => {
        if (!statusFilter) return bookings;
        return bookings.filter(b => b.TRANG_THAI === statusFilter);
    }, [bookings, statusFilter]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Rooms
            const r1 = await api.get('/phong', { params: { take: 500, withTotal: 0 } });
            setRooms(r1.data?.items ?? r1.data ?? []);

            // Bookings (lite)
            const params: any = { take: 1000 };
            if (filters.range.from && filters.range.to) {
                params.from = filters.range.from.toISOString();
                params.to = filters.range.to.toISOString();
            }
            if (filters.search.trim()) params.search = filters.search.trim();
            const r2 = await api.get('/bookings/lite', { params });
            setBookings(Array.isArray(r2.data) ? r2.data : (r2.data?.items ?? []));
        } finally { setLoading(false); }
    };

    useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);
    useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [filters.range.from?.getTime?.(), filters.range.to?.getTime?.()]);

    // Nhóm phòng theo tầng cho BoardView
    const roomsByFloor = useMemo(() => {
        const map = new Map<number, { floorLabel: string; items: Phong[] }>();
        rooms.forEach(r => {
            const key = r.TANG_MA;
            const label = r.TANG?.TANG_TEN ?? (r.TANG?.TANG_SO != null ? `Tầng ${r.TANG?.TANG_SO}` : `Tầng #${key}`);
            if (!map.has(key)) map.set(key, { floorLabel: label, items: [] });
            map.get(key)!.items.push(r);
        });
        return Array.from(map.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([k, v]) => ({ TANG_MA: k, ...v }));
    }, [rooms]);

    // 👉 callback: khi bấm 1 phòng trên Board → mở modal và khoá sẵn phòng
    const handleQuickBookRoom = (room: Phong) => {
        setInitialForCreate({
            selectedLP: room.LOAI_PHONG?.LP_MA ?? undefined,
            selectedRoomId: room.PHONG_MA,
            selectedRoomName: room.PHONG_TEN,
            lockSelectedRoom: true,
        });
        setOpenCreate(true);
    };
    const handleBooked = () => {
        setOpenCreate(false);
        setInitialForCreate(undefined);
        loadData();
    };
    return (
        <>
            <title>Đặt phòng</title>
        <div>
            <PageBreadcrumb pageTitle="Đặt phòng" />

            <BookingToolbar
                mode={mode}
                onModeChange={setMode}
                filters={filters}
                onFiltersChange={setFilters}
                onSearch={() => loadData()}
                onOpenBulk={() => setOpenBulk(true)}
                onBooked={handleBooked}
            />

            <ComponentCard title={
                mode === 'board' ? 'Sơ đồ phòng (Board)' : mode === 'list' ? 'Danh sách đặt phòng' : 'Lịch đặt phòng'
            }>
                {mode === 'list' && (
                    <div className="mb-4 flex items-center gap-3">
                        <label className="text-sm font-medium text-slate-700">Lọc theo trạng thái:</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="border rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-rose-500"
                        >
                            <option value="">Tất cả</option>
                            <option value="PENDING">Chờ cọc</option>
                            <option value="CONFIRMED">Đã cọc</option>
                            <option value="CHECKED_IN">Đang ở</option>
                            <option value="CHECKED_OUT">Đã trả</option>
                            <option value="CANCELLED">Đã huỷ</option>
                            <option value="NO_SHOW">Vắng mặt</option>
                        </select>
                    </div>
                )}

                {loading ? (
                    <div className="p-6 text-gray-500">Đang tải…</div>
                ) : mode === 'board' ? (
                    <BoardView
                        floors={roomsByFloor}
                        bookings={bookings}
                        filters={filters}
                        onQuickBook={handleQuickBookRoom} // ✅ truyền callback
                    />
                ) : mode === 'list' ? (
                    <ListView bookings={filteredBookings} filters={filters} />
                ) : (
                    <TimelineView rooms={rooms} bookings={bookings} filters={filters} />
                )}
            </ComponentCard>
            <BookingCreateToolBarModal
                open={openBulk}
                onClose={() => setOpenBulk(false)}
                onConfirm={({ ht, fromDate, fromTime, toDate, toTime, selections }) => {
                    setOpenBulk(false);

                    // map ht text -> HT_MA (DB)
                    const HT_MAP: Record<'DAY' | 'HOUR', number> = { DAY: 1, HOUR: 2 };
                    const prefillHT = HT_MAP[ht];

                    // build ISO
                    const toIso = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString();

                    setInitialForCreate({
                        prefillHT,
                        prefillFromISO: toIso(fromDate, fromTime),
                        prefillToISO: toIso(toDate, toTime),
                        bulkSelections: selections, // nếu muốn dùng ở Modal #2
                    });
                    setOpenCreate(true); // mở Modal #2
                }}
            />
            {/* Modal tạo HĐ (có prefill phòng) */}
            <BookingCreateModal
                open={openCreate}
                onClose={() => { setOpenCreate(false); setInitialForCreate(undefined); }}
                onCreated={() => { setOpenCreate(false); setInitialForCreate(undefined); loadData(); }}
                initial={initialForCreate}
                rooms={rooms} // ✅ để modal có danh sách phòng nếu muốn đổi
            />
        </div>
        </>
    );
}
