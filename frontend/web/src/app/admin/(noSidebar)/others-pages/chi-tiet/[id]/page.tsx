'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import Button from '@/components/ui/button/Button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import router from 'next/router';
import { useParams } from 'next/navigation';
import PageBreadcrumb_ct from '@/components/common/PageBreadCrumb_ct';
import ComponentCard from '@/components/common/ComponentCard';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { DownloadIcon, PencilIcon, PlusIcon, Print, Search, TrashBinIcon } from '@/icons';
import OccupantsModal, { Occupant } from '@/components/ui/modal/OccupantsModal';
import KhachHangCreateModal from '@/components/ui/modal/KhachHangCreateModal';
import PaymentModal, { PaymentPayload } from '@/components/ui/modal/PaymentModal';
import AddRoomModal from '@/components/ui/modal/AddRoomModal';
import AddRoomCheckInModal from '@/components/ui/modal/AddRoomCheckInModal';
import SuaXoaDichVuHopDongModal from "@/components/ui/modal/SuaXoaDichVuHopDongModal";

type StaffMe = { NV_MA: number; NV_HOTEN: string; NV_CHUCVU: string | null };
type BookingHeader = {
    id: number;
    khach: { ten: string; sdt: string };
    htLabel: string;
    from: string; // ISO
    to: string;   // ISO
    trang_thai: string;
    ghi_chu: string | null;
    tien_coc: number | null;
    thuc_nhan: string | null;
    thuc_tra: string | null;
};

type RoomLine = {
    lineId: number;     // CTSD_STT
    PHONG_MA: number;
    roomName: string;
    roomType: string;
    donvi: 'NIGHT' | 'HOUR';
    ngay: string | null;    // Date ISO or null
    tu_gio: string | null;  // Date ISO or null
    den_gio: string | null; // Date ISO or null
    so_luong: number;
    don_gia: number;
    tong_tien: number;
    CTSD_TRANGTHAI?: string;
};

type ServiceLine = {
    lineStt: number;      // CTDV_STT
    PHONG_MA: number;
    roomName: string;
    ctsdLineId: number;   // CTSD_STT (gắn vào dòng phòng)
    DV_MA: number;
    dvTen: string;
    ngay: string;         // ISO
    so_luong: number;
    don_gia: number;
    ghi_chu: string | null;
    thanh_tien: number;
};

type Product = {
    DV_MA: number;
    DV_TEN: string;
    PRICE: number;
    LDV_TEN: string | null;
};

// --- Guests of booking (LUU_TRU_KHACH) ---
type GuestRow = {
    KH_MA: number;
    KH_HOTEN: string;
    KH_SDT: string | null;
    KH_CCCD: string | null;
    KH_DIACHI: string | null;
    LA_KHACH_CHINH: boolean;
    LA_KHACH_DAT: boolean;
};

const fetchGuestsOfBooking = async (bookingId: number): Promise<GuestRow[]> => {
    const r = await api.get(`/bookings/${bookingId}/guests`);
    // DEBUG nếu cần: console.log('guests response', r.data);
    // Nếu BE trả {items: [...]}, đổi dòng dưới thành: return r.data?.items ?? [];
    return r.data ?? [];
};


const vnd = (n: number) => (Number(n) || 0).toLocaleString('vi-VN');
const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('vi-VN', { hour12: false }) : '—';
const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('vi-VN') : '—';


type Option = { value: number; label: string };
function SearchCombo({
    placeholder, value, onChange, fetcher, rightAddon, className
}: {
    placeholder: string; value: Option | null; onChange: (v: Option | null) => void;
    fetcher: (q: string) => Promise<Option[]>; rightAddon?: React.ReactNode; className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [opts, setOpts] = useState<Option[]>([]);
    const [loading, setLoading] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const deb = useRef<any>(null);

    // Đóng khi click/touch ra ngoài (dùng mousedown để chạy sớm)
    useEffect(() => {
        const onDown = (e: MouseEvent | TouchEvent) => {
            const el = ref.current;
            if (!el) return;
            const target = e.target as Node | null;
            if (target && !el.contains(target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('touchstart', onDown);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('touchstart', onDown);
        };
    }, []);

    // Đóng khi nhấn ESC
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    // Load options có debounce
    useEffect(() => {
        if (!open) return;
        clearTimeout(deb.current);
        deb.current = setTimeout(async () => {
            setLoading(true);
            try { setOpts(await fetcher(q.trim())); } finally { setLoading(false); }
        }, 220);
    }, [q, open, fetcher]);

    const displayText = value ? value.label : q;

    return (
        <div ref={ref} className={`relative ${className || ''}`}>
            <div className="flex">
                <div className="inline-flex w-full items-center rounded-l-lg border px-2 dark:border-slate-700 dark:bg-slate-800">
                    <Search className="mr-2 size-4 opacity-60" />
                    <input
                        className="h-[36px] w-full bg-transparent text-sm outline-none"
                        placeholder={placeholder}
                        value={displayText}
                        onChange={(e) => { onChange(null); setQ(e.target.value); }}
                        onFocus={() => setOpen(true)}
                        aria-expanded={open}
                    />
                </div>
                {rightAddon ? (
                    <div className="rounded-r-lg border border-l-0 dark:border-slate-700">{rightAddon}</div>
                ) : (
                    <button
                        type="button"
                        className="rounded-r-lg border border-l-0 px-3 text-sm dark:border-slate-700 dark:bg-slate-800"
                        onClick={() => setOpen(v => !v)}
                    >
                        ▼
                    </button>
                )}
            </div>

            {open && (
                <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white p-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {loading ? (
                        <div className="px-3 py-2 text-gray-500">Đang tải…</div>
                    ) : (
                        (opts.length === 0
                            ? <div className="px-3 py-2 text-gray-500">Không có kết quả</div>
                            : opts.map(o => (
                                <div
                                    key={o.value}
                                    className="cursor-pointer rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/10"
                                    onClick={() => { onChange(o); setQ(''); setOpen(false); }}
                                >
                                    {o.label}
                                </div>
                            ))
                        )
                    )}
                </div>
            )}
        </div>
    );
}

export default function BookingDetailPage() {
    const params = useParams();                 // ✅ lấy params trong client
    const idParam = (params?.id ?? '') as string;
    const bookingId = Number(idParam);

    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState<BookingHeader | null>(null);
    const [rooms, setRooms] = useState<RoomLine[]>([]);
    const [services, setServices] = useState<ServiceLine[]>([]);
    const [totals, setTotals] = useState<{ rooms: number; services: number; grand: number }>({
        rooms: 0, services: 0, grand: 0
    });

    // cột trái: danh mục DV
    const [pSearch, setPSearch] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [pLoading, setPLoading] = useState(false);

    // “điểm nhận” – dòng phòng được chọn để add DV
    const [targetRoomKey, setTargetRoomKey] = useState<string>(''); // `${PHONG_MA}#${CTSD_STT}`
    // const target = useMemo(() => {
    //     if (!targetRoomKey) return null;
    //     const [pm, stt] = targetRoomKey.split('#').map(Number);
    //     const r = rooms.find(x => x.PHONG_MA === pm && x.lineId === stt);
    //     return r ? { PHONG_MA: r.PHONG_MA, CTSD_STT: r.lineId, roomName: r.roomName } : null;
    // }, [targetRoomKey, rooms]);

    // form thêm DV
    const [selectedProd, setSelectedProd] = useState<Product | null>(null);
    const [qty, setQty] = useState<number>(1);
    const [price, setPrice] = useState<number>(0);
    const [note, setNote] = useState<string>('');
    // const canAdd = !!target && !!selectedProd && qty > 0 && booking?.trang_thai === 'CHECKED_IN';
    // trạng thái HĐ để kiểm soát quyền thêm DV
    const isCheckedIn = booking?.trang_thai === 'CHECKED_IN';
    const isOverdue = useMemo(() => {
        if (!booking?.to) return false;
        return new Date() > new Date(booking.to);
    }, [booking?.to]);

    // target: chỉ cần PHONG_MA (CTSD_STT để BE tự xác định)
    const target = useMemo(() => {
        if (!targetRoomKey) return null;
        const [pm] = targetRoomKey.split('#').map(Number); // bỏ lineId
        const r = rooms.find(x => x.PHONG_MA === pm);
        return r ? { PHONG_MA: r.PHONG_MA, roomName: r.roomName } : null;
    }, [targetRoomKey, rooms]);

    // khoá form thêm DV nếu không đủ điều kiện
    const addDisabled = !isCheckedIn || isOverdue || !target || !selectedProd || qty <= 0;


    // --- load chi tiết ---
    const loadFull = async () => {
        setLoading(true);
        try {
            const r = await api.get(`/bookings/${bookingId}/full`);
            setBooking(r.data?.booking || null);
            setRooms(r.data?.rooms || []);
            setServices(r.data?.services || []);
            setTotals(r.data?.totals || { rooms: 0, services: 0, grand: 0 });

            // mặc định chọn dòng phòng đầu tiên để thêm DV
            const first = (r.data?.rooms || [])[0];
            setSelectedRoomId(first ? first.PHONG_MA : null);
        } finally {
            setLoading(false);
        }
    };

    const [invStatus, setInvStatus] = useState<{
        hasInvoice: boolean; invoiceId: number | null;
        status: string; total: number; paid: number; due: number;
    } | null>(null);

    async function loadInvoiceStatus() {
        try {
            const r = await api.get(`/bookings/${bookingId}/invoice-status`);
            setInvStatus(r.data);
        } catch { }
    }

    // gọi cùng lúc với loadFull:
    useEffect(() => { loadFull(); loadInvoiceStatus(); /* eslint-disable-next-line */ }, [bookingId]);


    // --- search products ---
    useEffect(() => {
        let alive = true;
        (async () => {
            setPLoading(true);
            try {
                const r = await api.get('/products', { params: { search: pSearch, take: 100 } });
                if (!alive) return;
                setProducts(r.data || []);
            } finally { if (alive) setPLoading(false); }
        })();
        return () => { alive = false; };
    }, [pSearch]);

    // khi chọn product -> set price mặc định
    useEffect(() => {
        setPrice(selectedProd ? Number(selectedProd.PRICE || 0) : 0);
    }, [selectedProd]);

    async function addService() {
        if (addDisabled || !selectedProd || !target) return;

        const body = {
            DV_MA: selectedProd.DV_MA,
            PHONG_MA: target.PHONG_MA,
            CTDV_SOLUONG: qty,
            CTDV_DONGIA: price,
            CTDV_GHICHU: note || null,
            // KHÔNG gửi CTSD_STT – BE tự xác định đúng CTSD theo thời điểm hiện tại
        };

        try {
            await api.post(`/bookings/${bookingId}/services`, body);
            setQty(1);
            setNote('');
            await loadFull();
            await loadInvoiceStatus();
        } catch (e: any) {
            const status = e?.response?.status;
            const msg = e?.response?.data?.message || 'Thêm dịch vụ thất bại';
            // 409: không CHECKED_IN / quá hạn / không tìm thấy CTSD bao phủ now
            if (status === 409) { alert(msg); } else { alert(msg); }
        }
    }


    // Gom theo PHONG_MA: 1 thẻ/phòng; thời gian hiển thị dùng booking.from → booking.to
    const roomGroups = useMemo(() => {
        // Lấy danh sách phòng duy nhất
        const uniq = new Map<number, { PHONG_MA: number; roomName: string; roomType: string; tong_tien: number; CTSD_TRANGTHAI?: string; }>();
        for (const r of rooms) {
            const cur = uniq.get(r.PHONG_MA);
            if (!cur) {
                uniq.set(r.PHONG_MA, {
                    PHONG_MA: r.PHONG_MA,
                    roomName: r.roomName,
                    roomType: r.roomType,
                    tong_tien: Number(r.tong_tien || 0),
                    CTSD_TRANGTHAI: r.CTSD_TRANGTHAI,
                });
            } else {
                cur.tong_tien += Number(r.tong_tien || 0); // cộng tiền phòng nếu có nhiều CTSD dòng
                if (r.CTSD_TRANGTHAI === "DOI_PHONG") {
                    cur.CTSD_TRANGTHAI = "DOI_PHONG";
                }
            }
        }

        // Gắn service theo PHONG_MA (bỏ qua ctsdLineId khi hiển thị list)
        const groups = Array.from(uniq.values()).map(info => ({
            key: String(info.PHONG_MA),
            room: info,
            services: services.filter(s => s.PHONG_MA === info.PHONG_MA),
        }));
        return groups;
    }, [rooms, services]);


    async function updateServiceLine(s: ServiceLine, patch: Partial<ServiceLine>) {
        // cần đủ khoá: PHONG_MA, CTSD_STT, DV_MA, :ctdvStt
        await api.patch(`/bookings/${bookingId}/services/${s.lineStt}`, {
            PHONG_MA: s.PHONG_MA,
            CTSD_STT: s.ctsdLineId,
            DV_MA: s.DV_MA,
            ...(patch.so_luong != null ? { CTDV_SOLUONG: patch.so_luong } : {}),
            ...(patch.don_gia != null ? { CTDV_DONGIA: patch.don_gia } : {}),
            ...(patch.ghi_chu !== undefined ? { CTDV_GHICHU: patch.ghi_chu } : {}),
        });
        await loadFull();
    }

    async function removeServiceLine(s: ServiceLine) {
        await api.delete(`/bookings/${bookingId}/services/${s.lineStt}`, {
            data: { PHONG_MA: s.PHONG_MA, CTSD_STT: s.ctsdLineId, DV_MA: s.DV_MA },
        });
        await loadFull();
    }
    const [kh, setKh] = useState<Option | null>(null);
    const [occupants, setOccupants] = useState<Occupant[]>([]);
    const toOccupant = (rec: any): Occupant => ({
        khId: rec?.KH_MA ?? null,
        fullName: rec?.KH_HOTEN ?? '',
        phone: rec?.KH_SDT ?? '',
        idNumber: rec?.KH_CCCD ?? '',
        address: rec?.KH_DIACHI ?? '',
        isChild: false,
    });
    const fetchCustomers = async (search: string): Promise<Option[]> => {
        const r = await api.get('/khach-hang', { params: { take: 20, withTotal: 0, search } });
        return (r.data?.items ?? r.data ?? []).map((x: any) => ({ value: x.KH_MA, label: `${x.KH_HOTEN}${x.KH_SDT ? ` (${x.KH_SDT})` : ''}` }));
    };

    const [openCreateKH, setOpenCreateKH] = useState(false);

    const [occOpen, setOccOpen] = useState(false);
    const occAdults = Math.max(1, occupants.filter(o => !o.isChild).length);
    const occChildren = occupants.filter(o => o.isChild).length;
    const occDocs = occupants.filter(o => (o.idNumber || '').trim()).length;
    const occAppendRef = useRef<null | ((o: Occupant) => void)>(null);
    const [occCreateOpen, setOccCreateOpen] = useState(false);
    type DraftLine = {
        id: string;           // temp id
        PHONG_MA: number;
        DV_MA: number;
        dvTen: string;
        so_luong: number;
        don_gia: number;
        ghi_chu?: string | null;
    };

    const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
    // roomId -> DraftLine[]
    const [drafts, setDrafts] = useState<Record<number, DraftLine[]>>({});
    function addDraft(roomId: number, dv: Product) {
        setDrafts(prev => {
            const list = prev[roomId] ?? [];
            const idx = list.findIndex(x => x.DV_MA === dv.DV_MA);

            let nextList: DraftLine[];
            if (idx >= 0) {
                // tạo item mới thay vì chỉnh sửa item cũ (tránh mutate)
                const oldItem = list[idx];
                const updated: DraftLine = { ...oldItem, so_luong: oldItem.so_luong + 1 };
                nextList = [...list.slice(0, idx), updated, ...list.slice(idx + 1)];
            } else {
                const created: DraftLine = {
                    id: `${roomId}-${dv.DV_MA}-${Date.now()}`,
                    PHONG_MA: roomId,
                    DV_MA: dv.DV_MA,
                    dvTen: dv.DV_TEN,
                    so_luong: 1,
                    don_gia: Number(dv.PRICE || 0),
                    ghi_chu: null,
                };
                nextList = [...list, created];
            }

            return { ...prev, [roomId]: nextList };
        });
    }


    function updateDraft(roomId: number, id: string, patch: Partial<DraftLine>) {
        setDrafts(prev => {
            const list = (prev[roomId] ?? []).map(x => x.id === id ? { ...x, ...patch } : x);
            return { ...prev, [roomId]: list };
        });
    }

    function removeDraft(roomId: number, id: string) {
        setDrafts(prev => {
            const list = (prev[roomId] ?? []).filter(x => x.id !== id);
            return { ...prev, [roomId]: list };
        });
    }

    // Gộp CHỈ các dịch vụ đã lưu (services) theo phòng + (DV_MA, đơn giá).
    // Gộp CHỈ các dịch vụ đã lưu (services) theo phòng + (DV_MA, đơn giá, NGÀY - bỏ giờ)
    type PersistedUiRow = {
        PHONG_MA: number;
        DV_MA: number;
        dvTen: string;
        price: number;
        qty: number;      // tổng đã lưu
        day: string;      // 'YYYY-MM-DD' (chỉ ngày)
    };

    // helper: chuẩn hóa về 'YYYY-MM-DD' để gộp theo ngày
    function normalizeDay(iso: string) {
        const d = new Date(iso);
        if (isNaN(+d)) return iso;
        return d.toISOString().slice(0, 10); // chỉ lấy phần ngày
    }

    const persistedByRoom = useMemo(() => {
        const byRoom: Record<number, PersistedUiRow[]> = {};
        services.forEach(s => {
            const roomId = s.PHONG_MA;
            const arr = byRoom[roomId] ||= [];

            const day = normalizeDay(s.ngay);   // 👈 chỉ lấy ngày, bỏ giờ

            const found = arr.find(
                x => x.DV_MA === s.DV_MA && x.price === s.don_gia && x.day === day
            );

            if (found) {
                // cùng phòng + cùng DV + cùng đơn giá + cùng NGÀY -> cộng số lượng
                found.qty += s.so_luong;
            } else {
                arr.push({
                    PHONG_MA: roomId,
                    DV_MA: s.DV_MA,
                    dvTen: s.dvTen,
                    price: s.don_gia,
                    qty: s.so_luong,
                    day,    // lưu lại key ngày đã chuẩn hóa
                });
            }
        });
        return byRoom;
    }, [services]);


    // Load occupants mỗi khi mở modal
    useEffect(() => {
        if (!occOpen) return;      // chỉ chạy khi modal mở
        if (loading) return;       // đợi loadFull() xong để có booking header (fallback)
        let alive = true;

        (async () => {
            try {
                const rows = await fetchGuestsOfBooking(bookingId);
                if (!alive) return;

                if (Array.isArray(rows) && rows.length > 0) {
                    setOccupants(rows.map(toOccupant));
                } else {
                    // Fallback: nếu chưa có LUU_TRU_KHACH, seed tạm khách đặt từ header
                    if (booking?.khach?.ten) {
                        setOccupants([{
                            khId: null,
                            fullName: booking.khach.ten,
                            phone: booking.khach.sdt || '',
                            idNumber: '',
                            address: '',
                            isChild: false,
                        }]);
                    } else {
                        setOccupants([]);
                    }
                }
            } catch (err) {
                console.error('Fetch guests failed', err);
                // giữ nguyên occupants hiện có nếu lỗi
            }
        })();

        return () => { alive = false; };
    }, [occOpen, bookingId, loading, booking]);


    // --- Main guest (LA_KHACH_CHINH = 1) ---
    const [mainGuest, setMainGuest] = useState<{ name: string; phone?: string } | null>(null);

    // chọn khách chính: ưu tiên LA_KHACH_CHINH, nếu không có thì LA_KHACH_DAT, rồi đến phần tử đầu
    const pickMainGuest = (rows: GuestRow[] | null | undefined) => {
        if (!rows || rows.length === 0) return null;
        return rows.find(r => r.LA_KHACH_CHINH) || rows.find(r => r.LA_KHACH_DAT) || rows[0];
    };

    // load khách chính khi booking đã load xong
    const loadMainGuest = async () => {
        try {
            const rows = await fetchGuestsOfBooking(bookingId);
            const m = pickMainGuest(rows);
            setMainGuest(m ? { name: m.KH_HOTEN || '', phone: m.KH_SDT || '' } : null);
        } catch (e) {
            // giữ nguyên nếu lỗi
        }
    };

    // khi dữ liệu booking đã có (loading=false) thì lấy khách chính
    useEffect(() => {
        if (!loading) { loadMainGuest(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookingId, loading]);

    // sau khi đóng OccupantsModal (có thể user vừa chỉnh danh sách) -> reload khách chính
    useEffect(() => {
        if (!occOpen && !loading) { loadMainGuest(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [occOpen, loading]);
    const [payOpen, setPayOpen] = useState(false);
    const [payGuests, setPayGuests] = useState<GuestRow[]>([]);
    const [payForCheckout, setPayForCheckout] = useState(false);

    useEffect(() => {
        if (!payOpen) return;
        (async () => {
            try {
                const rows = await fetchGuestsOfBooking(bookingId);
                setPayGuests(rows);
            } catch { }
        })();
    }, [payOpen, bookingId]);

    const mainGuestName =
        (payGuests.find(g => g.LA_KHACH_CHINH)?.KH_HOTEN) ||
        booking?.khach?.ten || '—';

    const dpCode = `HD${String(bookingId).padStart(6, '0')}`;
    const paymentDetails = (
        <div className="space-y-4">
            {/* Thông tin phòng */}
            <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b dark:bg-slate-900/90 dark:border-slate-800">
                <div className="px-3 py-2">
                    <div className="text-mi font-semibold">
                        Đặt phòng {dpCode} – {mainGuestName}
                        <span className="ml-2 align-middle rounded-full bg-emerald-50 px-2 py-[2px] text-sm font-medium text-emerald-700 dark:bg-emerald-500/10">
                            Khách chính
                        </span>
                    </div>
                </div>
            </div>
            <div className="rounded-lg border dark:border-slate-700">
                <div className="border-b px-3 py-2 text-sm font-medium dark:border-slate-700">
                    Thông tin phòng
                </div>
                <div className="divide-y dark:divide-slate-700">
                    {roomGroups.map((g, idx) => (
                        <div key={g.key} className="px-3 py-2 text-sm">
                            <div className="flex items-center justify-between">
                                <div className="font-medium">{idx + 1}. {g.room.roomName}
                                    {g.room.CTSD_TRANGTHAI === "DOI_PHONG" && (
                                        <span className="rounded bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                                            Đã đổi phòng
                                        </span>
                                    )}
                                </div>
                                <div className="text-right text-gray-600">{vnd(g.room.tong_tien)}</div>
                            </div>
                            <div className="text-sm text-gray-500">
                                {g.room.roomType || '—'} • {fmt(booking?.from)} → {fmt(booking?.to)}
                            </div>
                        </div>
                    ))}
                    {roomGroups.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-500">Chưa có phòng.</div>
                    )}
                </div>
            </div>

            {/* Sản phẩm / Dịch vụ */}
            <div className="rounded-lg border dark:border-slate-700">
                <div className="border-b px-3 py-2 text-sm font-medium dark:border-slate-700">
                    Sản phẩm/Dịch vụ
                </div>
                <div className="divide-y dark:divide-slate-700">
                    {roomGroups.map((g) => (
                        <div key={`S-${g.key}`} className="px-3 py-2">
                            <div className="mb-1 text-sm font-medium text-gray-500">{g.room.roomName}</div>
                            {(persistedByRoom[g.room.PHONG_MA] || []).map(row => (
                                <div key={`${row.PHONG_MA}-${row.DV_MA}-${row.price}`}
                                    className="flex items-center justify-between text-sm">
                                    <div>{row.dvTen} × {row.qty}</div>
                                    <div className="text-right">{vnd(row.qty * row.price)}</div>
                                </div>
                            ))}
                            {(persistedByRoom[g.room.PHONG_MA] || []).length === 0 && (
                                <div className="text-sm text-gray-500">—</div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
    const [me, setMe] = useState<StaffMe | null>(null);

    // fetch 1 lần khi mount
    useEffect(() => {
        (async () => {
            try {
                const r = await api.get('/auth/staff/me');
                setMe(r.data?.staff ?? null);
            } catch { }
        })();
    }, []);


    // Trong BookingDetailPage
    const handleConfirmPayment = async (p: PaymentPayload) => {
        const staffId = p.staffId ?? me?.NV_MA;  // fallback từ người đăng nhập
        if (staffId == null || staffId === '') {
            alert('Không xác định được nhân viên đang đăng nhập.');
            return;
        }
        try {
            // 1) TẠO (hoặc lấy lại) HÓA ĐƠN từ hợp đồng
            // BE của bạn: nếu đã tồn tại hoá đơn link với hợp đồng thì trả lại hoá đơn cũ
            const invRes = await api.post(`/hoadon/from-booking/${bookingId}`, {
                discount: p.discount,
                fee: p.extra,
                overrideDeposit: booking?.tien_coc ?? 0,
                inputPaid: p.inputPaid,
            });
            const inv = invRes.data;            // { HDON_MA, HDON_THANH_TIEN, ... , _payment: { paid, due } }

            // 2) TÍNH SỐ CẦN THU (để không thu quá phần còn thiếu)
            const due = Number(inv?._payment?.due ?? inv?.HDON_THANH_TIEN ?? 0);
            const amountToCharge = Math.max(0, Math.min(Number(p.inputPaid || 0), due));

            // Nếu người dùng chưa nhập tiền thì không tạo payment
            // if (amountToCharge <= 0) {
            //     alert('Vui lòng nhập số tiền khách thanh toán.');
            //     return;
            // }
            // Nếu người dùng chưa nhập hoặc nhập thiếu số tiền cần trả -> chặn
            const dueTotal = Math.max(0, Number(totals.grand) - Number(booking?.tien_coc ?? 0));
            if (Number(p.inputPaid || 0) < dueTotal) {
                alert(`Cần nhập đủ ${dueTotal.toLocaleString('vi-VN')} VND để thanh toán.2`);
                return;
            }


            // 3) GHI NHẬN THANH TOÁN
            const methodMap = { cash: 'CASH', card: 'CARD', transfer: 'TRANSFER' } as const;
            const body: any = {
                HDON_MA: inv.HDON_MA,
                TT_PHUONG_THUC: methodMap[p.method],
                TT_SO_TIEN: amountToCharge,     // số thực sự hạch toán
                TT_GHI_CHU: p.note ?? null,
                // TT_NHA_CUNG_CAP, TT_MA_GIAO_DICH: nếu có form nhập thêm thì map vào đây
            };

            // CASH: truyền thêm TT_SO_TIEN_KHACH_DUA để BE tính tiền thừa (change)
            if (p.method === 'cash') {
                body.TT_SO_TIEN_KHACH_DUA = Number(p.inputPaid || 0); // KH đưa (có thể > amountToCharge)
            }

            const payRes = await api.post('/thanhtoan', body);
            const pay = payRes.data; // { TT_MA, TT_TRANG_THAI_GIAO_DICH, _payment: { paid, due } }

            // 4) Thông báo & refresh
            const paidAll = Number(pay?._payment?.due ?? 0) <= 1e-6;
            alert(
                `Đã ghi nhận thanh toán ${Number(pay.TT_TIEN_THUA).toLocaleString('vi-VN')}\n` +
                (p.method === 'cash' && pay?.TT_TIEN_THUA ? `Tiền thừa: ${amountToCharge.toLocaleString('vi-VN')}.\n` : '') +
                (paidAll ? 'Hóa đơn đã đủ tiền.' : `Còn thiếu: ${Number(pay?._payment?.due || 0).toLocaleString('vi-VN')}`)
            );

            setPayOpen(false);
            await loadInvoiceStatus();
            await loadFull();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Thanh toán thất bại');
        }
    }
    // --- Check-in sớm (Early check-in) ---
    const [checkingIn, setCheckingIn] = useState(false);

    async function handleEarlyCheckIn() {
        if (!booking) return;
        if (booking.trang_thai !== 'CONFIRMED') {
            alert('Chỉ nhận phòng khi hợp đồng đang ở trạng thái CONFIRMED.');
            return;
        }

        if (!confirm('Xác nhận nhận phòng ngay bây giờ?')) return;

        setCheckingIn(true);
        try {
            const at = new Date().toISOString();
            // BE sẽ kiểm tra trống phòng tại thời điểm `at` cho tất cả phòng thuộc HĐ,
            // nếu hợp lệ sẽ cập nhật HDONG_NGAYTHUCNHAN = at và chuyển trạng thái.
            await api.post(`/bookings/${bookingId}/checkin1`, { at });

            alert(`Đã nhận phòng lúc ${new Date(at).toLocaleString('vi-VN', { hour12: false })}`);
            await loadFull(); // refresh header/rooms/services/totals, trạng thái sẽ thành CHECKED_IN
        } catch (e: any) {
            const status = e?.response?.status;
            const data = e?.response?.data || {};
            // BE nên trả 409 khi phòng bận, kèm mảng conflicts: [{ PHONG_MA, roomName, from, to }, ...]
            if (status === 409) {
                const details = (data.conflicts || [])
                    .map((c: any) =>
                        `${c.roomName || `Phòng ${c.PHONG_MA}`} bận: ${new Date(c.from).toLocaleString('vi-VN', { hour12: false })} → ${new Date(c.to).toLocaleString('vi-VN', { hour12: false })}`
                    )
                    .join('\n');
                alert((data.message || 'Phòng đang bận, không thể nhận phòng.') + (details ? `\n\n${details}` : ''));
            } else {
                alert(data.message || 'Nhận phòng thất bại.');
            }
        } finally {
            setCheckingIn(false);
        }
    }


    async function doCheckout() {
        if (!booking) return;
        try {
            await api.post(`/bookings/${bookingId}/checkout`, { at: new Date().toISOString() });
            alert('Đã trả phòng thành công');
            await loadInvoiceStatus();
            await loadFull();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Trả phòng thất bại');
        } finally {
            setPayForCheckout(false);
        }
    }

    const steps = [
        { key: 'PENDING', text: 'Đặt' },
        { key: 'CONFIRMED', text: 'Xác nhận' },
        { key: 'CHECKED_IN', text: 'Nhận phòng' },
        { key: 'CHECKED_OUT', text: 'Trả phòng' },
    ];

    function Stepper({ status }: { status?: string }) {
        const upper = (status || '').toUpperCase();

        // Nếu trạng thái là CANCELLED → hiện badge đỏ, không render step
        if (upper === 'CANCELLED') {
            return (
                <span className="rounded-full bg-rose-100 text-rose-700 ring-1 ring-rose-300 px-3 py-1 text-sm font-medium">
                    Đã hủy đặt phòng
                </span>
            );
        }

        const idx = Math.max(steps.findIndex(s => s.key === (status || '').toUpperCase()), 0);
        return (
            <div className="flex items-center gap-2 text-sm">
                {steps.map((s, i) => (
                    <div key={s.key} className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 ring-1
            ${i < idx ? 'bg-emerald-600 text-white ring-emerald-600'
                                : i === idx ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                                    : 'bg-slate-100 text-slate-500 ring-slate-200'}`}>
                            {s.text}
                        </span>
                        {i < steps.length - 1 && <span className="text-slate-300">—</span>}
                    </div>
                ))}
            </div>
        );
    }
    const status = booking?.trang_thai;
    const isCheckedOut = status === 'CHECKED_OUT';

    // (nếu bạn đã có các biến này thì giữ nguyên)
    const hasInvoice = !!invStatus?.hasInvoice;
    const total = Number(hasInvoice ? invStatus?.total : totals?.grand ?? 0);
    const paid = Number(invStatus?.paid ?? 0);
    const due = Math.max(0, total - paid);
    const canCheckoutByStatus = status === 'CHECKED_IN';

    const [openAddRoomModal, setOpenAddRoomModal] = useState(false);
    const [openAddRoomCheckInModal, setOpenAddRoomCheckInModal] = useState(false);
    const STATUS_MAP: Record<string, { text: string; className: string }> = {
        ACTIVE: { text: "Đang sử dụng", className: "text-green-600" },
        CANCELLED: { text: "Đã hủy", className: "text-gray-500" },
        INVOICED: { text: "Đã tính tiền", className: "text-blue-600" },
        DOI_PHONG: { text: "Đã đổi phòng", className: "text-orange-500 font-medium" },
    };
    // Modal sửa/xóa dịch vụ
    const [serviceModalOpen, setServiceModalOpen] = useState(false);
    const [serviceModalData, setServiceModalData] = useState(null as any);


    return (
        <div className="min-h-screen">
            <PageBreadcrumb_ct pageTitle={`Hợp đồng HD${String(bookingId).padStart(6, '0')}`} />
            <div>

                {/* 2 cột: danh mục DV | chi tiết HĐ gộp */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">

                    {/* LEFT: Danh mục dịch vụ (giữ nguyên phần bạn đang dùng) */}
                    <ComponentCard title="Danh mục dịch vụ">
                        {/* Search */}
                        <Input
                            placeholder="Tìm theo tên/mã dịch vụ…"
                            value={pSearch}
                            onChange={(e: any) => setPSearch(e.target.value)}
                            className=""
                        />

                        {/* List */}
                        <div className="max-h-[500px] overflow-auto rounded-lg border dark:border-slate-700">
                            {pLoading ? (
                                <div className="p-3 text-sm text-gray-500">Đang tải…</div>
                            ) : products.length === 0 ? (
                                <div className="p-3 text-sm text-gray-500">Không có dịch vụ.</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableCell isHeader className="px-3 py-2 text-sm text-gray-500">Tên</TableCell>
                                            <TableCell isHeader className="px-3 py-2 text-sm text-gray-500">Giá</TableCell>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {products.map((p) => (
                                            <TableRow
                                                key={p.DV_MA}
                                                className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 ${selectedProd?.DV_MA === p.DV_MA ? "bg-slate-50 dark:bg-white/5" : ""
                                                    }`}
                                                onClick={() => {
                                                    if (!selectedRoomId) {
                                                        alert('Hãy chọn một phòng ở bên phải trước khi thêm dịch vụ.');
                                                        return;
                                                    }
                                                    addDraft(selectedRoomId, p);
                                                }}
                                            >
                                                <TableCell className="px-3 py-2">
                                                    <div className="text-sm font-medium">{p.DV_TEN}</div>
                                                    <div className="text-sm text-gray-500">{p.LDV_TEN || "—"}</div>
                                                </TableCell>
                                                <TableCell className="w-24 px-3 py-2 text-center text-sm">{vnd(p.PRICE)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>


                        {/* form thêm DV */}

                    </ComponentCard>

                    {/* RIGHT: Chi tiết HĐ (gộp Phòng + Dịch vụ) */}
                    <ComponentCard title="Chi tiết hợp đồng" right={<Stepper status={status} />} >
                        {/* {(!isCheckedIn || isOverdue) && (
                            <div className="mb-2 rounded-md border border-amber-400 bg-amber-50 p-2 text-sm text-amber-700">
                                {!isCheckedIn
                                    ? 'Chỉ có thể thêm dịch vụ khi khách hàng đã NHẬN PHÒNG.'
                                    : 'Hợp đồng đã quá hạn trả phòng. Vui lòng gia hạn để thêm dịch vụ.'}
                            </div>
                        )} */}
                        <div className="mb-3 flex flex-wrap items-end gap-3">
                            <div className="inline-flex w-fit flex-col gap-1 self-end">
                                <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 leading-none text-center">
                                    KHÁCH CHÍNH
                                </span>
                                <Input
                                    className="w-80 h-9"           // ép cùng chiều cao
                                    placeholder="Khách chính"
                                    value={
                                        mainGuest ? `${mainGuest.name}${mainGuest.phone ? ` (${mainGuest.phone})` : ''}` : ''
                                    }
                                    onChange={() => { }}
                                    disabled
                                />

                            </div>

                            <div className="inline-flex w-fit flex-col gap-1 self-end">
                                <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 leading-none text-center">
                                    LƯU TRÚ
                                </span>

                                <button
                                    type="button"
                                    onClick={() => setOccOpen(true)}
                                    className="inline-flex h-11 items-center gap-3 rounded-lg border px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                                    title="Khách lưu trú"
                                >
                                    <span className="inline-flex items-center gap-1">
                                        <span>👤</span><b>{occAdults}</b>
                                    </span>
                                    <span className="opacity-40">|</span>
                                    <span className="inline-flex items-center gap-1">
                                        <span>🧒</span><b>{occChildren}</b>
                                    </span>
                                    <span className="opacity-40">|</span>
                                    <span className="inline-flex items-center gap-1">
                                        <span>🪪</span><b>{occDocs}</b>
                                    </span>
                                </button>
                            </div>


                            <div className="grid w-fit justify-items-center gap-1 self-end">
                                <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 leading-none text-center">
                                    DỰ KIẾN: NGÀY ĐẶT - NGÀY TRẢ
                                </span>

                                <div className="inline-flex h-11 items-center gap-2 rounded-lg border bg-white/60 px-3 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-200 backdrop-blur-[2px] dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:ring-white/10">
                                    <time className="tabular-nums">{fmt(booking?.from)}</time>
                                    <span className="mx-1 text-gray-400">→</span>
                                    <time className="tabular-nums">{fmt(booking?.to)}</time>
                                </div>
                            </div>
                            {/* CỤM: NGÀY NHẬN PHÒNG */}
                            {(() => {
                                const actualCheckIn = booking?.thuc_nhan || null;
                                const hasCheckIn = !!actualCheckIn;
                                const base =
                                    'inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium ring-1';
                                const onCls =
                                    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800';
                                const offCls =
                                    'bg-white/60 text-gray-800 ring-gray-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:ring-white/10';

                                return (
                                    <div className="inline-flex w-fit flex-col gap-1 self-end">
                                        <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 leading-none text-center">
                                            NGÀY NHẬN PHÒNG
                                        </span>

                                        <div className={`${base} ${hasCheckIn ? onCls : offCls}`}>
                                            {hasCheckIn ? (
                                                <time className="tabular-nums">{fmt(actualCheckIn)}</time>
                                            ) : (
                                                <span className="opacity-60">Chưa nhận</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                            {(() => {
                                const actualCheckOut = booking?.thuc_tra || null;
                                const hasCheckOut = !!actualCheckOut;
                                const base =
                                    'inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium ring-1';
                                const onCls =
                                    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800';
                                const offCls =
                                    'bg-white/60 text-gray-800 ring-gray-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:ring-white/10';

                                return (
                                    <div className="inline-flex w-fit flex-col gap-1 self-end">
                                        <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 leading-none text-center">
                                            NGÀY TRẢ PHÒNG
                                        </span>

                                        <div className={`${base} ${hasCheckOut ? onCls : offCls}`}>
                                            {hasCheckOut ? (
                                                <time className="tabular-nums">{fmt(actualCheckOut)}</time>
                                            ) : (
                                                <span className="opacity-60">Chưa trả</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-semibold text-base">Danh sách phòng</h3>
                            {(booking?.trang_thai === 'CONFIRMED') && (
                                <button
                                    onClick={() => setOpenAddRoomModal(true)}
                                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                                >
                                    + Thêm phòng
                                </button>
                            )}
                            {(booking?.trang_thai === 'CHECKED_IN') && (
                                <button
                                    onClick={() => setOpenAddRoomCheckInModal(true)}
                                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
                                >
                                    + Thêm phòng
                                </button>
                            )}
                        </div>

                        {/* danh sách theo phòng */}
                        <div className="space-y-3">
                            {roomGroups.map((g, idx) => {
                                const isSelected = selectedRoomId === g.room.PHONG_MA;
                                return (
                                    <div key={g.key}
                                        className={`rounded-xl border p-3 dark:border-slate-700 ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-400/60' : ''
                                            }`}>
                                        {/* Header phòng */}
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                {booking?.trang_thai === 'CONFIRMED' && (
                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm(`Xóa ${g.room.roomName} khỏi hợp đồng?`)) return;
                                                            try {
                                                                await api.delete(`/bookings/${booking.id}/rooms/${g.room.PHONG_MA}`);
                                                                await loadFull();
                                                            } catch (e: any) {
                                                                alert(e?.response?.data?.message || 'Xóa phòng thất bại.');
                                                            }
                                                        }}
                                                        className="ml-2 text-sm px-2 py-1 rounded-md bg-red-600 text-white hover:bg-red-700"
                                                    >
                                                        {<TrashBinIcon />}
                                                    </button>
                                                )}

                                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border text-sm font-medium dark:border-slate-700">
                                                    {idx + 1}
                                                </span>
                                                <div>
                                                    <div className="text-m font-semibold">{g.room.roomName}
                                                        {g.room.CTSD_TRANGTHAI === "DOI_PHONG" && (
                                                            <span className="rounded bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                                                                Đã đổi phòng
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        {g.room.roomType || "—"} • {fmt(booking?.from)} → {fmt(booking?.to)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <div className="text-sm text-gray-500">Tiền phòng</div>
                                                <div className="text-sm font-medium">{vnd(g.room.tong_tien)}</div>
                                            </div>
                                        </div>

                                        {/* Dịch vụ của phòng */}
                                        <div className="mt-3 space-y-2">
                                            {/* 2.1) CÁC DỊCH VỤ ĐÃ LƯU – ĐÃ GỘP (chỉ hiển thị, không sửa) */}
                                            {(persistedByRoom[g.room.PHONG_MA] || []).map(row => (
                                                <div
                                                    key={`P-${row.PHONG_MA}-${row.DV_MA}-${row.price}`}
                                                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2 dark:border-slate-700"
                                                >
                                                    <div className="min-w-[180px] flex-1">
                                                        <div className="text-sm font-medium">{row.dvTen}</div>
                                                        <div className="text-[11px] text-gray-500">đã lưu</div>
                                                    </div>

                                                    <div className="text-sm text-gray-500">
                                                        {fmtDate(row.day)}
                                                    </div>

                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm text-gray-500">SL</span>
                                                        <Input

                                                            type="number"
                                                            className="w-16 text-right opacity-70"
                                                            value={row.qty}
                                                            onChange={() => { }}
                                                        />
                                                    </div>

                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm text-gray-500">ĐG</span>
                                                        <Input

                                                            type="number"
                                                            className="w-24 text-right opacity-70"
                                                            value={row.price}
                                                            onChange={() => { }}
                                                        />
                                                    </div>

                                                    <div className="text-right min-w-[80px] font-medium">{vnd(row.qty * row.price)}</div>

                                                    {/* không có nút Xoá cho dòng gộp */}
                                                   <div>
                                                        {status === 'CHECKED_IN' && (
                                                            <>
                                                                <button
                                                                    className="text-blue-600 hover:underline text-xs"
                                                                    onClick={() => {
                                                                        // Lấy tất cả record thô của dịch vụ này trong phòng này
                                                                        const rawRecords = services.filter(
                                                                            (sv) =>
                                                                                sv.PHONG_MA === g.room.PHONG_MA &&  // phòng hiện tại
                                                                                sv.DV_MA === row.DV_MA              // cùng dịch vụ
                                                                        );

                                                                        setServiceModalData({
                                                                            roomName: g.room.roomName,
                                                                            serviceName: row.dvTen,
                                                                            records: rawRecords,
                                                                        });
                                                                        setServiceModalOpen(true);
                                                                    }}
                                                                >
                                                                    <PencilIcon />
                                                                </button>
                                                            </>
                                                        )}                                                      
                                                    </div>

                                                    <div />
                                                </div>
                                            ))}

                                            {/* Draft (chưa lưu) của phòng */}
                                            {(drafts[g.room.PHONG_MA] ?? []).map(d => (
                                                <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-2 dark:border-slate-700">
                                                    <div className="min-w-[200px] flex-1">
                                                        <div className="text-sm font-medium">
                                                            {d.dvTen}
                                                            <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                                                                chưa lưu
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="text-sm text-gray-500">{new Date().toLocaleDateString('vi-VN')}</div>

                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm text-gray-500">SL</span>
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            className="w-16 text-right"
                                                            value={d.so_luong}
                                                            onChange={(e: any) => updateDraft(d.PHONG_MA, d.id, { so_luong: Math.max(1, Number(e.target.value || 1)) })}
                                                        />
                                                    </div>

                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm text-gray-500">ĐG</span>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            className="w-24 text-right"
                                                            value={d.don_gia}
                                                            onChange={(e: any) => updateDraft(d.PHONG_MA, d.id, { don_gia: Math.max(0, Number(e.target.value || 0)) })}
                                                        />
                                                    </div>

                                                    <div className="text-right min-w-[80px] font-medium">
                                                        {vnd(d.so_luong * d.don_gia)}
                                                    </div>

                                                    <div>
                                                        <Button size="sm" variant="danger" onClick={() => removeDraft(d.PHONG_MA, d.id)}>Xoá</Button>
                                                    </div>
                                                </div>
                                            ))}


                                            {g.services.length === 0 && (
                                                <div className="rounded-md border p-2 text-sm text-gray-500 dark:border-slate-700">
                                                    Chưa có dịch vụ cho phòng này.
                                                </div>
                                            )}
                                        </div>

                                        {/* chọn phòng để thêm DV nhanh */}
                                        <div className="mt-3">
                                            <Button
                                                size="sm"
                                                variant={targetRoomKey === g.key ? "primary" : "outline"}
                                                onClick={() => setSelectedRoomId(g.room.PHONG_MA)}
                                                disabled={g.room.CTSD_TRANGTHAI === "DOI_PHONG"} // 👈 khóa nút nếu phòng đã đổi
                                            >
                                                {g.room.CTSD_TRANGTHAI === "DOI_PHONG"
                                                    ? "Phòng đã đổi, không thể thêm dịch vụ"
                                                    : selectedRoomId === g.room.PHONG_MA
                                                        ? "Đang thêm vào phòng này"
                                                        : "Chọn để thêm dịch vụ"}
                                            </Button>
                                        </div>

                                    </div>
                                );
                            })}


                            {roomGroups.length === 0 && (
                                <div className="rounded-xl border p-6 text-center text-gray-500 dark:border-slate-700">
                                    Chưa có phòng trong HĐ.
                                </div>
                            )}
                        </div>
                        {!!booking?.ghi_chu && (
                            <ComponentCard title="Ghi chú đặt phòng" className=''>
                                <div className="text-sm">{booking.ghi_chu}</div>
                            </ComponentCard>
                        )}


                        {loading || !booking ? (
                            <div className="text-gray-500">Đang tải chi tiết…</div>
                        ) : (
                            <div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
                                    <div className="md:col-start-3 md:justify-self-end">
                                        <div className="text-xl md:text-xl font-extrabold">
                                            <span className="text-red-600 dark:text-red-400">Tổng cộng:</span>{' '}
                                            <span className="text-black dark:text-white">{vnd(totals.grand)}</span>

                                            {invStatus?.hasInvoice && (
                                                invStatus.due <= 0 ? (
                                                    <span className="ml-3 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-medium text-emerald-700">
                                                        ĐÃ XUẤT HÓA ĐƠN & ĐÃ THANH TOÁN
                                                    </span>
                                                ) : (
                                                    <span className="ml-3 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-700">
                                                        Đã thanh toán {vnd(Number(invStatus.paid || 0))}
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-2">
                            {booking?.trang_thai === 'CHECKED_OUT' && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            const invoiceId = invStatus?.invoiceId;
                                            if (!invoiceId) { alert('Chưa có hóa đơn để in'); return; }
                                            window.open(`/admin/others-pages/hoa-don/${invoiceId}/print`, '_blank', 'noopener');
                                        }}
                                    >
                                        Xuất hóa đơn <DownloadIcon />
                                    </Button>
                                </>
                            )}
                            {status === 'CONFIRMED' && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        window.location.href = `/admin/others-pages/dat-phong/${bookingId}/print`;
                                    }}
                                    className=""
                                >
                                    In phiếu đặt phòng
                                </Button>
                            )}

                            {status === 'CHECKED_IN' && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        disabled={isCheckedOut}
                                        onClick={async () => {
                                            // gom tất cả draft thành một mảng lệnh
                                            const all: DraftLine[] = Object.values(drafts).flat();
                                            if (all.length === 0) { alert('Không có thay đổi để lưu.'); return; }

                                            try {
                                                // gọi tuần tự (hoặc Promise.all theo batch nhỏ)
                                                for (const d of all) {
                                                    await api.post(`/bookings/${bookingId}/services`, {
                                                        DV_MA: d.DV_MA,
                                                        PHONG_MA: d.PHONG_MA,
                                                        CTDV_SOLUONG: d.so_luong,
                                                        CTDV_DONGIA: d.don_gia,
                                                        CTDV_GHICHU: d.ghi_chu ?? null,
                                                        // CTDV_NGAY: new Date().toISOString()
                                                    });
                                                }
                                                // clear draft & reload
                                                setDrafts({});
                                                await loadFull();
                                                await loadInvoiceStatus();
                                                alert('Đã lưu dịch vụ.');
                                            } catch (e: any) {
                                                alert(e?.response?.data?.message || 'Lưu thất bại');
                                            }
                                        }}
                                    >
                                        Lưu
                                    </Button>
                                </>
                            )}
                            
                           

                            {status === 'CHECKED_IN' && (
                                <>
                                   
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        disabled={isCheckedOut}
                                        onClick={() => {
                                            // chỉ cho CHECKED_IN; nếu muốn chặt hơn, bạn có thể disable luôn khi chưa CHECKED_IN
                                            if ((booking?.trang_thai || '').toUpperCase() !== 'CHECKED_IN') {
                                                alert('Chỉ trả phòng khi hợp đồng đang CHECKED_IN');
                                                return;
                                            }
                                            setPayForCheckout(true);   // bật chế độ trả phòng sau khi thu
                                            setPayOpen(true);          // mở modal thu tiền
                                        }}
                                    >
                                        Thanh toán & trả phòng
                                    </Button>


                                </>
                            )}
                            {booking?.trang_thai === 'CONFIRMED' && (
                                <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={handleEarlyCheckIn}
                                    disabled={checkingIn}
                                >
                                    {checkingIn ? 'Đang nhận…' : 'Nhận phòng'}
                                </Button>
                            )}
                        </div>

                    </ComponentCard>
                </div>
                <OccupantsModal
                    key={occOpen ? `open-${bookingId}` : 'closed'}
                    open={occOpen}
                    onClose={() => setOccOpen(false)}
                    value={occupants}
                    onChange={(list) => setOccupants(list)}
                    onAddAdultViaCreate={(append) => {
                        // nhận callback append từ modal con và mở modal tạo KH
                        occAppendRef.current = append;
                        setOccCreateOpen(true);
                    }}
                    bookingId={bookingId}
                    editable
                />
                <KhachHangCreateModal
                    open={occCreateOpen}
                    onClose={() => setOccCreateOpen(false)}
                    onCreated={async (id, label, rec) => {
                        setOccCreateOpen(false);

                        // 1) Ghi vào bảng LUU_TRU_KHACH của hợp đồng hiện tại
                        try {
                            await api.post(`/bookings/${bookingId}/guests`, {
                                KH_MA: id,
                                LA_KHACH_CHINH: false, // đổi true nếu bạn muốn set người vừa tạo là khách chính
                                LA_KHACH_DAT: false,   // hoặc true nếu là người đặt
                                GHI_CHU: null,
                            });
                        } catch (e: any) {
                            console.error('Add guest to LUU_TRU_KHACH failed', e?.response?.data || e);
                            alert(e?.response?.data?.message || 'Thêm khách vào hợp đồng thất bại');
                            // vẫn tiếp tục add vào UI để user không mất dữ liệu nhập
                        }

                        // 2) Cập nhật UI occupants (giữ nguyên logic cũ)
                        const newAdult = toOccupant(rec);
                        if (occAppendRef.current) {
                            occAppendRef.current(newAdult);
                            occAppendRef.current = null;
                        } else {
                            setOccupants(prev => [...prev, newAdult]);
                        }

                        // 3) (tuỳ chọn) refresh danh sách từ BE cho chắc
                        // const rows = await fetchGuestsOfBooking(bookingId);
                        // setOccupants(rows.map(toOccupant));
                    }}
                />

                <PaymentModal
                    open={payOpen}
                    onClose={() => setPayOpen(false)}
                    total={totals.grand}
                    deposit={Number(booking?.tien_coc ?? 0)}
                    //paid={Number(invStatus?.paid ?? 0)}       // ✅ đã trả
                    paid={Math.max(0, Number(invStatus?.paid ?? 0) - Number(booking?.tien_coc ?? 0))}
                    due={Number(invStatus?.due ?? 0)}
                    currentStaff={me ? { id: me.NV_MA, name: me.NV_HOTEN } : { id: '', name: '—' }}
                    details={paymentDetails}          // 👈 slot chi tiết bên trái
                    onSubmit={async (p) => {
                        try {
                            // ✅ 1️⃣ Ghi hóa đơn & thanh toán ngay
                            const pay = await api.post(`/hoadon/from-booking/${bookingId}`, p);
                            if (!pay || pay.status !== 201) {
                                alert('Không tạo được hóa đơn / ghi thanh toán.');
                                return;
                            }

                            const paidAll = Number(pay.data?._payment?.due ?? 0) <= 1e-6;
                            const amountPaid = Number(pay.data?._payment?.paid ?? 0);
                            const due = Number(pay.data?._payment?.due ?? 0);
                            const over = Number(pay.data?.TT_TIEN_THUA ?? 0); // nếu có tiền thừa

                            // ✅ 2️⃣ Hiển thị thông báo rõ ràng
                            let msg = `Đã ghi nhận thanh toán ${amountPaid.toLocaleString('vi-VN')} VND.\n`;
                            if (over > 0) msg += `Tiền thừa: ${over.toLocaleString('vi-VN')} VND.\n`;
                            msg += paidAll
                                ? '💰 Hóa đơn đã đủ tiền.'
                                : `Còn thiếu: ${due.toLocaleString('vi-VN')} VND.`;

                            alert(msg);

                            // ✅ 3️⃣ Nếu còn thiếu tiền, dừng lại
                            if (!paidAll) return;

                            // ✅ 4️⃣ Nếu trả phòng kèm thanh toán → checkout
                            if (payForCheckout) {
                                setPayOpen(false);
                                await doCheckout();
                            } else {
                                setPayOpen(false);
                            }
                        } catch (e: any) {
                            alert(e?.response?.data?.message || 'Lỗi khi xử lý thanh toán.');
                        }


                    }}
                />

                <AddRoomModal
                    open={openAddRoomModal}
                    onClose={() => setOpenAddRoomModal(false)}
                    booking={booking}
                    bookingId={booking?.id}
                    onAdded={loadFull}
                />
                <AddRoomCheckInModal
                    open={openAddRoomCheckInModal}
                    onClose={() => setOpenAddRoomCheckInModal(false)}
                    booking={booking}
                    bookingId={booking?.id}
                    onAdded={loadFull}
                />

                {serviceModalData && (
                    <SuaXoaDichVuHopDongModal
                        open={serviceModalOpen}
                        bookingId={bookingId}
                        roomName={serviceModalData.roomName}
                        serviceName={serviceModalData.serviceName}
                        records={serviceModalData.records}
                        onClose={() => setServiceModalOpen(false)}
                        onChanged={async () => {
                            await loadFull();          // reload lại phòng + dịch vụ
                            await loadInvoiceStatus(); // reload trạng thái hóa đơn (nếu có)
                        }}
                    />
                )}


            </div>
        </div>

    );
}
