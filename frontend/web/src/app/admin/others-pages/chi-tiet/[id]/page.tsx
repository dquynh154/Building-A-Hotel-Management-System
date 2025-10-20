'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import Button from '@/components/ui/button/Button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import router from 'next/router';
import { useParams } from 'next/navigation';

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

    return (
        <div className="space-y-4">
            {/* breadcrumb + tiêu đề */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs text-gray-500">
                        <Link href="/admin/others-pages/dat-phong" className="hover:underline">Đặt phòng</Link>
                        <span className="mx-2">/</span>
                        <span>Chi tiết</span>
                    </div>
                    <h1 className="mt-1 text-xl font-semibold">
                        Hợp đồng #{String(bookingId).padStart(6, '0')}
                    </h1>
                </div>
                <Link href="/admin/others-pages/dat-phong">
                    <Button variant="outline" size="sm">← Quay lại</Button>
                </Link>
            </div>

            {/* Header booking */}
            <div className="rounded-xl border p-4 dark:border-slate-700">
                {loading || !booking ? (
                    <div className="text-gray-500">Đang tải chi tiết…</div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div>
                            <div className="text-xs text-gray-500">Khách đặt</div>
                            <div className="text-sm font-medium">{booking.khach.ten || '—'}</div>
                            <div className="text-sm text-gray-500">{booking.khach.sdt || ''}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Thời gian</div>
                            <div className="text-sm">{fmt(booking.from)} → {fmt(booking.to)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Trạng thái / Hình thức</div>
                            <div className="text-sm">{booking.trang_thai} • {booking.htLabel}</div>
                        </div>
                        {!!booking.ghi_chu && (
                            <div className="md:col-span-3">
                                <div className="text-xs text-gray-500">Ghi chú</div>
                                <div className="text-sm">{booking.ghi_chu}</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 3 cột: danh mục DV | dòng phòng | dịch vụ đã chọn */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_1.1fr]">
                {/* LEFT: danh mục sản phẩm/dịch vụ */}
                <div className="rounded-xl border p-3 dark:border-slate-700">
                    <div className="mb-2 text-sm font-medium">Danh mục dịch vụ</div>
                    <input
                        className="mb-2 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        placeholder="Tìm theo tên/mã dịch vụ…"
                        value={pSearch}
                        onChange={(e) => setPSearch(e.target.value)}
                    />
                    <div className="max-h-[540px] overflow-auto rounded-lg border dark:border-slate-700">
                        {pLoading ? (
                            <div className="p-3 text-sm text-gray-500">Đang tải…</div>
                        ) : (products.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500">Không có dịch vụ.</div>
                        ) : (
                            <Table>
                                <TableBody>
                                    {products.map(p => (
                                        <TableRow
                                            key={p.DV_MA}
                                            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                                            onClick={() => setSelectedProd(p)}
                                        >
                                            <TableCell className="px-3 py-2">
                                                <div className="text-sm font-medium">{p.DV_TEN}</div>
                                                <div className="text-xs text-gray-500">{p.LDV_TEN || '—'}</div>
                                            </TableCell>
                                            <TableCell className="w-24 px-3 py-2 text-right text-sm">{vnd(p.PRICE)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ))}
                    </div>

                    {/* form thêm DV */}
                    <div className="mt-3 rounded-lg border p-3 text-sm dark:border-slate-700">
                        <div className="mb-2">
                            <div className="text-xs text-gray-500">Dòng phòng nhận</div>
                            <select
                                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                value={targetRoomKey}
                                onChange={(e) => setTargetRoomKey(e.target.value)}
                            >
                                {rooms.map(r => (
                                    <option
                                        key={`${r.PHONG_MA}-${r.lineId}`}
                                        value={`${r.PHONG_MA}#${r.lineId}`}
                                    >
                                        {r.roomName} • {r.donvi === 'NIGHT' ? fmtDate(r.ngay) : `${fmt(r.tu_gio)} → ${fmt(r.den_gio)}`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="mb-2">
                            <div className="text-xs text-gray-500">Dịch vụ</div>
                            <div className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700">
                                {selectedProd ? `${selectedProd.DV_TEN} • ${vnd(price)}` : '— Chưa chọn —'}
                            </div>
                        </div>

                        <div className="mb-2 grid grid-cols-2 gap-2">
                            <div>
                                <div className="text-xs text-gray-500">Số lượng</div>
                                <input
                                    type="number" min={1}
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                    value={qty}
                                    onChange={(e) => setQty(Math.max(1, Number(e.target.value || 1)))}
                                />
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Đơn giá</div>
                                <input
                                    type="number" min={0}
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                    value={price}
                                    onChange={(e) => setPrice(Math.max(0, Number(e.target.value || 0)))}
                                />
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
                </div>

                {/* MIDDLE: các dòng PHÒNG (CTSD) */}
                <div className="rounded-xl border p-3 dark:border-slate-700">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-medium">Phòng trong HĐ</div>
                        <div className="text-xs text-gray-500">
                            Tổng tiền phòng: <b>{vnd(totals.rooms)}</b>
                        </div>
                    </div>
                    <div className="overflow-auto rounded-lg border dark:border-slate-700">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500">Chọn</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500">Phòng</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500">Loại</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500">Khoảng</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500 text-right">Đơn giá</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500 text-right">Thành tiền</TableCell>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rooms.map(r => (
                                    <TableRow key={`${r.PHONG_MA}-${r.lineId}`}>
                                        <TableCell className="px-3 py-2">
                                            <input
                                                type="radio"
                                                name="target-room"
                                                checked={targetRoomKey === `${r.PHONG_MA}#${r.lineId}`}
                                                onChange={() => setTargetRoomKey(`${r.PHONG_MA}#${r.lineId}`)}
                                            />
                                        </TableCell>
                                        <TableCell className="px-3 py-2">{r.roomName}</TableCell>
                                        <TableCell className="px-3 py-2">{r.roomType || '—'}</TableCell>
                                        <TableCell className="px-3 py-2 text-sm">
                                            {r.donvi === 'NIGHT'
                                                ? fmtDate(r.ngay)
                                                : `${fmt(r.tu_gio)} → ${fmt(r.den_gio)}`
                                            }
                                        </TableCell>
                                        <TableCell className="px-3 py-2 text-right">{vnd(r.don_gia)}</TableCell>
                                        <TableCell className="px-3 py-2 text-right">{vnd(r.tong_tien)}</TableCell>
                                    </TableRow>
                                ))}
                                {rooms.length === 0 && (
                                    <TableRow><TableCell colSpan={6} className="px-3 py-6 text-center text-gray-500">Không có phòng.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* RIGHT: dịch vụ đã chọn (CTDV) */}
                <div className="rounded-xl border p-3 dark:border-slate-700">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-medium">Dịch vụ trong HĐ</div>
                        <div className="text-xs text-gray-500">
                            Tổng dịch vụ: <b>{vnd(totals.services)}</b> • Tổng cộng: <b>{vnd(totals.grand)}</b>
                        </div>
                    </div>

                    <div className="overflow-auto rounded-lg border dark:border-slate-700">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500">Phòng</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500">Dịch vụ</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500">Ngày</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500 text-right">SL</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500 text-right">Đơn giá</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500 text-right">Thành tiền</TableCell>
                                    <TableCell isHeader className="px-3 py-2 text-xs text-gray-500 text-right">Hành động</TableCell>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {services.map(s => (
                                    <TableRow
                                        key={`${s.PHONG_MA}-${s.ctsdLineId}-${s.DV_MA}-${s.lineStt}`}
                                    >
                                        <TableCell className="px-3 py-2">{s.roomName}</TableCell>
                                        <TableCell className="px-3 py-2">
                                            <div className="text-sm font-medium">{s.dvTen}</div>
                                            <div className="text-xs text-gray-500">{s.ghi_chu || ''}</div>
                                        </TableCell>
                                        <TableCell className="px-3 py-2">{fmtDate(s.ngay)}</TableCell>
                                        <TableCell className="px-3 py-2 text-right">
                                            <input
                                                type="number" min={0}
                                                className="w-16 rounded-md border px-2 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-800"
                                                value={s.so_luong}
                                                onChange={(e) =>
                                                    updateServiceLine(s, { so_luong: Math.max(0, Number(e.target.value || 0)) })
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="px-3 py-2 text-right">
                                            <input
                                                type="number" min={0}
                                                className="w-24 rounded-md border px-2 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-800"
                                                value={s.don_gia}
                                                onChange={(e) =>
                                                    updateServiceLine(s, { don_gia: Math.max(0, Number(e.target.value || 0)) })
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="px-3 py-2 text-right">{vnd(s.thanh_tien)}</TableCell>
                                        <TableCell className="px-3 py-2 text-right">
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                onClick={() => removeServiceLine(s)}
                                            >
                                                Xoá
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {services.length === 0 && (
                                    <TableRow><TableCell colSpan={7} className="px-3 py-6 text-center text-gray-500">Chưa có dịch vụ.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>
        </div>
    );
}
