'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import Button from '@/components/ui/button/Button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import router from 'next/router';
import { useParams } from 'next/navigation';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import ComponentCard from '@/components/common/ComponentCard';
import Input from '@/components/form/input/InputField';
import Select from '@/components/form/Select';
import { PlusIcon, Search } from '@/icons';
import OccupantsModal, { Occupant } from '@/components/ui/modal/OccupantsModal';

type BookingHeader = {
    id: number;
    khach: { ten: string; sdt: string };
    htLabel: string;
    from: string; // ISO
    to: string;   // ISO
    trang_thai: string;
    ghi_chu: string | null;
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
    const target = useMemo(() => {
        if (!targetRoomKey) return null;
        const [pm, stt] = targetRoomKey.split('#').map(Number);
        const r = rooms.find(x => x.PHONG_MA === pm && x.lineId === stt);
        return r ? { PHONG_MA: r.PHONG_MA, CTSD_STT: r.lineId, roomName: r.roomName } : null;
    }, [targetRoomKey, rooms]);

    // form thêm DV
    const [selectedProd, setSelectedProd] = useState<Product | null>(null);
    const [qty, setQty] = useState<number>(1);
    const [price, setPrice] = useState<number>(0);
    const [note, setNote] = useState<string>('');
    const canAdd = !!target && !!selectedProd && qty > 0;

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
            if (first) setTargetRoomKey(`${first.PHONG_MA}#${first.lineId}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadFull(); /* eslint-disable-next-line */ }, [bookingId]);

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
        if (!canAdd || !selectedProd) return;
        const body = {
            DV_MA: selectedProd.DV_MA,
            PHONG_MA: target!.PHONG_MA,
            CTSD_STT: target!.CTSD_STT,
            CTDV_SOLUONG: qty,
            CTDV_DONGIA: price,
            CTDV_GHICHU: note || null,
        };
        await api.post(`/bookings/${bookingId}/services`, body);
        // reset nhẹ
        setQty(1);
        setNote('');
        // reload
        await loadFull();
    }
    // group services theo phòng + dòng phòng
    const groups = useMemo(() => {
        return rooms.map(r => ({
            key: `${r.PHONG_MA}#${r.lineId}`,
            room: r,
            services: services.filter(s => s.PHONG_MA === r.PHONG_MA && s.ctsdLineId === r.lineId),
        }));
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
    return (
        <div className="min-h-screen">
            <PageBreadcrumb pageTitle={`Hợp đồng DP${String(bookingId).padStart(6, '0')}`} />
            <div className="mx-auto w-full max-w-screen-2xl rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
                {/* breadcrumb + tiêu đề
                <div className="mb-4 flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                        <Link href="/admin/others-pages/dat-phong" className="hover:underline">Đặt phòng</Link>
                        <span className="mx-2">/</span>
                        <span>Chi tiết</span>
                    </div>
                    <Button variant="outline" size="sm">
                        <Link href="/admin/others-pages/dat-phong">← Quay lại</Link>
                    </Button>
                </div> */}

                {/* Header booking */}


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
                        <div className="max-h-[300px] overflow-auto rounded-lg border dark:border-slate-700">
                            {pLoading ? (
                                <div className="p-3 text-sm text-gray-500">Đang tải…</div>
                            ) : products.length === 0 ? (
                                <div className="p-3 text-sm text-gray-500">Không có dịch vụ.</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableCell isHeader className="px-3 py-2 text-xs text-gray-500">Tên</TableCell>
                                            <TableCell isHeader className="px-3 py-2 text-xs text-gray-500">Giá</TableCell>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {products.map((p) => (
                                            <TableRow
                                                key={p.DV_MA}
                                                className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 ${selectedProd?.DV_MA === p.DV_MA ? "bg-slate-50 dark:bg-white/5" : ""
                                                    }`}
                                                onClick={() => setSelectedProd(p)}
                                            >
                                                <TableCell className="px-3 py-2">
                                                    <div className="text-sm font-medium">{p.DV_TEN}</div>
                                                    <div className="text-xs text-gray-500">{p.LDV_TEN || "—"}</div>
                                                </TableCell>
                                                <TableCell className="w-24 px-3 py-2 text-center text-sm">{vnd(p.PRICE)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>

                        {/* form thêm DV */}
                        <div className="mt-3 rounded-lg border p-3 dark:border-slate-700">
                            <div className="mb-2">
                                <div className="text-xs text-gray-500">Dòng phòng nhận</div>
                                <select
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                    value={targetRoomKey}
                                    onChange={(e) => setTargetRoomKey(e.target.value)}
                                >
                                    {rooms.map((r) => (
                                        <option key={`${r.PHONG_MA}-${r.lineId}`} value={`${r.PHONG_MA}#${r.lineId}`}>
                                            {r.roomName} • {r.donvi === "NIGHT" ? fmtDate(r.ngay) : `${fmt(r.tu_gio)} → ${fmt(r.den_gio)}`}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="mb-2">
                                <div className="text-xs text-gray-500">Dịch vụ</div>
                                <div className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700">
                                    {selectedProd ? `${selectedProd.DV_TEN} • ${vnd(price)}` : "— Chưa chọn —"}
                                </div>
                            </div>

                            <div className="mb-2 grid grid-cols-2 gap-2">
                                <div>
                                    <div className="text-xs text-gray-500">Số lượng</div>
                                    <Input type="number" min="1" value={qty} onChange={(e: any) => setQty(Math.max(1, Number(e.target.value || 1)))} />
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Đơn giá</div>
                                    <Input type="number" min="0" value={price} onChange={(e: any) => setPrice(Math.max(0, Number(e.target.value || 0)))} />
                                </div>
                            </div>

                            <div className="mb-2">
                                <div className="text-xs text-gray-500">Ghi chú</div>
                                <textarea
                                    rows={2}
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                            </div>

                            <Button size="sm" variant="primary" disabled={!canAdd} onClick={addService}>
                                Thêm vào HĐ
                            </Button>
                        </div>
                    </ComponentCard>

                    {/* RIGHT: Chi tiết HĐ (gộp Phòng + Dịch vụ) */}
                    <ComponentCard title="Chi tiết hợp đồng">
                        <div className="mb-3 flex items-center gap-2">
                            <SearchCombo
                                className="w-80"
                                placeholder="Tìm khách hàng…"
                                value={kh}
                                onChange={async (o) => {
                                    setKh(o);

                                    // nếu chọn KH → load chi tiết (nếu muốn đầy đủ)
                                    if (o?.value) {
                                        try {
                                            const r = await api.get(`/khach-hang/${o.value}`);
                                            const khRow = r.data || {};
                                            setOccupants(prev => {
                                                const cp = [...(prev || [])];
                                                const occ = toOccupant(khRow); // <-- gồm: khId, fullName, phone, idNumber, address
                                                if (cp.length === 0) {
                                                    cp.push(occ);
                                                } else {
                                                    const idx = cp.findIndex(x => !x.isChild);
                                                    const i = idx >= 0 ? idx : 0;
                                                    cp[i] = occ;
                                                }
                                                return cp;
                                            });
                                        } catch {
                                            // fallback: không có rec đầy đủ thì ít nhất vẫn set tên
                                            setOccupants(prev => {
                                                const cp = [...(prev || [])];
                                                if (cp.length === 0) {
                                                    cp.push({ khId: o.value, fullName: o.label, phone: '', idNumber: '', address: '', isChild: false });
                                                } else {
                                                    const idx = cp.findIndex(x => !x.isChild);
                                                    const i = idx >= 0 ? idx : 0;
                                                    cp[i] = { ...(cp[i] || {}), khId: o.value, fullName: o.label, isChild: false };
                                                }
                                                return cp;
                                            });
                                        }
                                    }
                                }}
                                fetcher={fetchCustomers}
                                rightAddon={
                                    <button
                                        type="button"
                                        className="inline-flex h-[36px] items-center justify-center px-3 text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/10"
                                        title="Thêm khách hàng"
                                        onClick={() => setOpenCreateKH(true)}
                                    >
                                        <PlusIcon className="size-4" />
                                    </button>
                                }
                            />
                            <button
                                type="button"
                                onClick={() => setOccOpen(true)}
                                className="inline-flex h-[36px] items-center gap-3 rounded-lg border px-3 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
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
                        {/* danh sách theo phòng */}
                        <div className="space-y-3">
                            {groups.map((g, idx) => (
                                <div key={g.key} className="rounded-xl border p-3 dark:border-slate-700">
                                    {/* Header phòng */}
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs font-medium dark:border-slate-700">
                                                {idx + 1}
                                            </span>
                                            <div>
                                                <div className="text-sm font-semibold">{g.room.roomName}</div>
                                                <div className="text-xs text-gray-500">
                                                    {g.room.roomType || "—"} • {g.room.donvi === "NIGHT" ? fmtDate(g.room.ngay) : `${fmt(g.room.tu_gio)} → ${fmt(g.room.den_gio)}`}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className="text-xs text-gray-500">Tiền phòng</div>
                                            <div className="text-sm font-medium">{vnd(g.room.tong_tien)}</div>
                                        </div>
                                    </div>

                                    {/* Dịch vụ của phòng */}
                                    <div className="mt-3 space-y-2">
                                        {g.services.map((s) => (
                                            <div
                                                key={`${s.PHONG_MA}-${s.ctsdLineId}-${s.DV_MA}-${s.lineStt}`}
                                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2 dark:border-slate-700"
                                            >
                                                {/* tên + ghi chú */}
                                                <div className="min-w-[180px] flex-1">
                                                    <div className="text-sm font-medium">{s.dvTen}</div>
                                                    <div className="text-xs text-gray-500">{s.ghi_chu || ""}</div>
                                                </div>

                                                {/* ngày */}
                                                <div className="text-xs text-gray-500">{fmtDate(s.ngay)}</div>

                                                {/* SL */}
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-gray-500">SL</span>
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        className="w-16 text-right"
                                                        value={s.so_luong}
                                                        onBlur={(e: any) => updateServiceLine(s, { so_luong: Math.max(1, Number(e.target.value || 1)) })}
                                                        onChange={() => { }}
                                                    />
                                                </div>

                                                {/* Đơn giá */}
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-gray-500">ĐG</span>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        className="w-24 text-right"
                                                        value={s.don_gia}
                                                        onBlur={(e: any) => updateServiceLine(s, { don_gia: Math.max(0, Number(e.target.value || 0)) })}
                                                        onChange={() => { }}
                                                    />
                                                </div>

                                                {/* Thành tiền */}
                                                <div className="text-right min-w-[80px] font-medium">{vnd(s.thanh_tien)}</div>

                                                {/* Xoá */}
                                                <div>
                                                    <Button size="sm" variant="danger" onClick={() => removeServiceLine(s)}>
                                                        Xoá
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}

                                        {g.services.length === 0 && (
                                            <div className="rounded-md border p-2 text-xs text-gray-500 dark:border-slate-700">
                                                Chưa có dịch vụ cho phòng này.
                                            </div>
                                        )}
                                    </div>

                                    {/* chọn dòng phòng để thêm DV nhanh */}
                                    <div className="mt-3">
                                        <Button
                                            size="sm"
                                            variant={targetRoomKey === g.key ? "primary" : "outline"}
                                            onClick={() => setTargetRoomKey(g.key)}
                                        >
                                            {targetRoomKey === g.key ? "Đang thêm vào phòng này" : "Chọn để thêm dịch vụ"}
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            {groups.length === 0 && (
                                <div className="rounded-xl border p-6 text-center text-gray-500 dark:border-slate-700">
                                    Chưa có phòng trong HĐ.
                                </div>
                            )}
                        </div>

                        {/* tổng tiền gọn gàng */}
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                            <div>Phòng: <b>{vnd(totals.rooms)}</b></div>
                            <div>Dịch vụ: <b>{vnd(totals.services)}</b></div>
                            <div className="text-gray-700">Tổng cộng: <b>{vnd(totals.grand)}</b></div>
                        </div>

                        {loading || !booking ? (
                            <div className="text-gray-500">Đang tải chi tiết…</div>
                        ) : (
                            <div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3 mb-4">
                                    <ComponentCard title="Khách đặt">
                                        <div className="text-sm font-medium">{booking?.khach.ten || '—'}</div>
                                        <div className="text-sm text-gray-500">{booking?.khach.sdt || ''}</div>
                                    </ComponentCard>

                                    <ComponentCard title="Thời gian">
                                        <div className="text-sm">{fmt(booking?.from)} → {fmt(booking?.to)}</div>
                                    </ComponentCard>

                                    <ComponentCard title="Tổng cộng">
                                        <div className="text-lg font-semibold">{vnd(totals.grand)}</div>
                                        <div className="text-xs text-gray-500">
                                            Phòng: <b>{vnd(totals.rooms)}</b> • DV: <b>{vnd(totals.services)}</b>
                                        </div>
                                    </ComponentCard>
                                </div>
                                {!!booking?.ghi_chu && (
                                    <ComponentCard title="Ghi chú">
                                        <div className="text-sm">{booking.ghi_chu}</div>
                                    </ComponentCard>
                                )}
                            </div>
                        )}
                    </ComponentCard>
                </div>
                <OccupantsModal
                    open={occOpen}
                    onClose={() => setOccOpen(false)}
                    value={occupants}
                    onChange={(list) => setOccupants(list)}
                    onAddAdultViaCreate={(append) => {
                        // nhận callback append từ modal con và mở modal tạo KH
                        occAppendRef.current = append;
                        setOccCreateOpen(true);
                    }}
                />

            </div>
        </div>

    );
}
