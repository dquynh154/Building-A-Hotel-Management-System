'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import DatePicker from '@/components/form/date-picker';
import Input from '@/components/form/input/InputField';
import { PlusIcon, Search } from '@/icons';
import type { Phong } from '@/app/admin/others-pages/dat-phong/page';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import KhachHangCreateModal from '@/components/ui/modal/KhachHangCreateModal';
import OccupantsModal, { Occupant } from '@/components/ui/modal/OccupantsModal';

type Option = { value: number; label: string };
type QuoteItem = { date: string; price: number };

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (v: any) => {
    const d = Array.isArray(v) ? v[0] : v;
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(+x)) return '';
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
};
function parseKHLabel(label: string) {
    const m = label?.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    return { name: (m ? m[1] : label || '').trim(), phone: (m ? m[2] : '').trim() };
}



// ========== SearchCombo (typeahead) KH ==========
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


// ========== MAIN ==========
export default function BookingCreateModal({
    open, onClose, onCreated, initial, rooms,
}: {
    open: boolean; onClose: () => void; onCreated?: (bookingId?: number) => void;
    initial?: { selectedLP?: number; selectedRoomId?: number; selectedRoomName?: string };
    rooms?: Phong[];
}) {
    // KH
    const [kh, setKh] = useState<Option | null>(null);
    const [openCreateKH, setOpenCreateKH] = useState(false);

    // dữ liệu phòng
    const [allRooms, setAllRooms] = useState<Phong[]>([]);
    const [hireTypes, setHireTypes] = useState<Option[]>([]);

    // chọn
    const [lp, setLp] = useState<number | ''>('');            // LP_MA (để hiển thị)
    const [lpLabel, setLpLabel] = useState<string>('');     // LP_TEN
    const [roomId, setRoomId] = useState<number | ''>('');
    const [ht, setHt] = useState<number | ''>('');

    // ngày
    const [fromDate, setFromDate] = useState<string>('');      // auto hôm nay
    const [toDate, setToDate] = useState<string>('');          // auto ngày mai

    // báo giá
    const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
    const [quoteTotal, setQuoteTotal] = useState<number>(0);
    const [quoting, setQuoting] = useState(false);

    const [payInput, setPayInput] = useState<string>('0');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [fromTime, setFromTime] = useState<string>('14:00'); // mặc định 14:00
    const [toTime, setToTime] = useState<string>('12:00'); 
    const [note, setNote] = useState<string>('');  
    const [occOpen, setOccOpen] = useState(false);
    const [occupants, setOccupants] = useState<Occupant[]>([]);
    const occAdults = Math.max(1, occupants.filter(o => !o.isChild).length);
    const occChildren = occupants.filter(o => o.isChild).length;
    const occDocs = occupants.filter(o => (o.idNumber || '').trim()).length;

    // mở modal tạo KH từ nút + Người lớn
    const [occCreateOpen, setOccCreateOpen] = useState(false);
    // nơi để lưu callback append do OccupantsModal truyền lên
    const occAppendRef = useRef<null | ((o: Occupant) => void)>(null);
    const toIsoDateTime = (dateStr: string, timeStr: string) => {
        if (!dateStr) return '';
        const t = timeStr && /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '00:00';
        return new Date(`${dateStr}T${t}:00`).toISOString();
    };

    // === helpers xác định hình thức & thời lượng ===
    function hoursBetween(dateStr1: string, timeStr1: string, dateStr2: string, timeStr2: string) {
        if (!(dateStr1 && dateStr2)) return 0;
        const d1 = new Date(`${dateStr1}T${timeStr1 || '00:00'}:00`);
        const d2 = new Date(`${dateStr2}T${timeStr2 || '00:00'}:00`);
        return Math.max(0, (d2.getTime() - d1.getTime()) / 36e5); // ms -> hours
    }
    function isSameYmd(a: string, b: string) { return !!a && !!b && a === b; }
    function findHourHTId(opts: Option[]) {
        const x = opts.find(o => /giờ/i.test(o.label));    // HT_TEN chứa "giờ"
        return x?.value;
    }
    function findNightHTId(opts: Option[]) {
        const x = opts.find(o => /đêm|ngày/i.test(o.label)); // HT_TEN chứa "đêm" hoặc "ngày"
        return x?.value;
    }

    // cờ: user đã đổi HT thủ công -> không auto switch nữa
    const [userTouchedHT, setUserTouchedHT] = useState(false);

    // cache id HT theo giờ/đêm sau khi load
    const [hourHTId, setHourHTId] = useState<number | undefined>(undefined);
    const [nightHTId, setNightHTId] = useState<number | undefined>(undefined);

    // Load lists + default dates mỗi lần mở
    useEffect(() => {
        if (!open) return;
        setErr(null); setSaving(false); setPayInput('0');

        // auto set from=today, to=tomorrow
        const today = startOfToday(); const tomorrow = addDays(today, 1);
        setFromDate(ymd(today));
        setToDate(ymd(tomorrow));
        setFromTime('14:00');
        setToTime('12:00');
        (async () => {
            try {
                if (!rooms) {
                    const r = await api.get('/phong', { params: { take: 500, withTotal: 0, includeLP: 1 } });
                    setAllRooms(r.data?.items ?? r.data ?? []);
                } else setAllRooms(rooms);
            } catch { }

            try {
                const htRes = await api.get('/hinh-thuc-thue', { params: { take: 200, withTotal: 0 } });
                const list: Option[] = (htRes.data?.items ?? htRes.data ?? [])
                    .map((x: any) => ({ value: x.HT_MA, label: x.HT_TEN }));

                setHireTypes(list);
                setHourHTId(findHourHTId(list));
                setNightHTId(findNightHTId(list));
                // 👇 nếu chưa chọn, tự chọn "Ngày" (ưu tiên tên có 'ngày' hoặc 'đêm')
                setHt(prev => {
                    if (prev) return prev;
                    const day = list.find(o => /ngày|đêm/i.test(o.label)) || list[0];
                    return day ? Number(day.value) : '';
                });
            } catch { }

            // prefill từ initial
            const initRoom = initial?.selectedRoomId || '';
            setRoomId(initRoom);
            if (initRoom) {
                const r = (rooms ?? allRooms).find((x: any) => x.PHONG_MA === initRoom);
                const lpma = (r as any)?.LP_MA ?? (r as any)?.LOAI_PHONG?.LP_MA;
                const lpten = (r as any)?.LOAI_PHONG?.LP_TEN ?? '';
                if (lpma) { setLp(lpma); setLpLabel(lpten || `Loại #${lpma}`); }
            } else {
                setLp(initial?.selectedLP ?? ''); setLpLabel('');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // khi chọn phòng thì set lại LP label
    useEffect(() => {
        if (!roomId) return;
        const r: any = allRooms.find((x: any) => x.PHONG_MA === roomId);
        if (!r) return;
        const lpma = r?.LP_MA ?? r?.LOAI_PHONG?.LP_MA;
        const lpten = r?.LOAI_PHONG?.LP_TEN ?? '';
        if (lpma) { setLp(lpma); setLpLabel(lpten || `Loại #${lpma}`); }
    }, [roomId, allRooms]);

    // danh sách phòng thuộc LP đã chọn
    const roomOptions = useMemo<Option[]>(() => {
        const filtered = lp ? allRooms.filter((r: any) => (r?.LP_MA === lp) || (r?.LOAI_PHONG?.LP_MA === lp)) : allRooms;
        return filtered.map(r => ({ value: r.PHONG_MA, label: r.PHONG_TEN }));
    }, [allRooms, lp]);

    // nights để hiển thị “Dự kiến”
    const nights = useMemo(() => {
        if (!(fromDate && toDate)) return 0;
        const s = new Date(fromDate + 'T00:00:00'); const e = new Date(toDate + 'T00:00:00');
        return Math.max(0, Math.round((+e - +s) / 86400000));
    }, [fromDate, toDate]);

    useEffect(() => {
        if (!fromDate || !toDate) return;
        if (!hourHTId && !nightHTId) return;
        if (userTouchedHT) return; // người dùng đã tự chọn -> không auto

        const hrs = hoursBetween(fromDate, fromTime, toDate, toTime);
        const sameDay = isSameYmd(fromDate, toDate);

        if (sameDay && hrs > 0 && hrs <= 6) {
            if (hourHTId && ht !== hourHTId) setHt(hourHTId);
        } else {
            if (nightHTId && ht !== nightHTId) setHt(nightHTId);
        }
    }, [fromDate, fromTime, toDate, toTime, hourHTId, nightHTId, userTouchedHT, ht]);

    // fetch KH
    const fetchCustomers = async (search: string): Promise<Option[]> => {
        const r = await api.get('/khach-hang', { params: { take: 20, withTotal: 0, search } });
        return (r.data?.items ?? r.data ?? []).map((x: any) => ({ value: x.KH_MA, label: `${x.KH_HOTEN}${x.KH_SDT ? ` (${x.KH_SDT})` : ''}` }));
    };

    const canQuote = useMemo(() => {
        if (!(roomId && ht && fromDate && toDate)) return false;
        const s = new Date(`${fromDate}T${fromTime || '00:00'}:00`);
        const e = new Date(`${toDate}T${toTime || '00:00'}:00`);
        return e.getTime() > s.getTime();
    }, [roomId, ht, fromDate, toDate, fromTime, toTime]);

    const canSave = !!kh?.value && !!roomId && !!ht && !!fromDate && !!toDate && !saving;

    // báo giá (thành tiền)
    useEffect(() => {
        (async () => {
            if (!open) return;
            if (!canQuote) { setQuoteItems([]); setQuoteTotal(0); return; }
            setQuoting(true); setErr(null);
            try {
                const isoFrom = new Date(`${fromDate}T${fromTime}:00`).toISOString();
                const isoTo = new Date(`${toDate}T${toTime}:00`).toISOString();
                const htLabel = hireTypes.find(o => o.value === ht)?.label || '';

                const q = await api.get('/pricing/quote', {
                    params: {
                        PHONG_MA: Number(roomId),
                        HT_MA: Number(ht),
                        from: isoFrom,
                        to: isoTo,
                        htLabel
                    }
                });

                console.log('QUOTE RESP:', q.data); // <-- tạm thời để debug
                const totalFromApi =
                    (q.data?.total ?? q.data?.data?.total ?? q.data?.sum ?? 0);

                setQuoteTotal(Number(totalFromApi));

                if (q.data?.mode === 'DAY' && Array.isArray(q.data?.daysArr)) {
                    setQuoteItems(q.data.daysArr.map((d: any) => ({
                        date: String(d.date),
                        price: Number(d.price || 0)
                    })));
                } else {
                    // theo giờ (<= 6h): chỉ có tổng, không tách theo ngày
                    setQuoteItems([]);
                }
            } catch (e) {
                setQuoteItems([]); setQuoteTotal(0);
            } finally { setQuoting(false); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, roomId, ht, fromDate, toDate, fromTime, toTime, canQuote]);


    // lưu
    const save = async (action: 'dat_truoc' | 'nhan_phong') => {
        if (!canSave) return;
        setSaving(true); setErr(null);
        try {
            const fromISO = toIsoDateTime(fromDate, fromTime);
            const toISO = toIsoDateTime(toDate, toTime);
            if (!fromISO || !toISO || +new Date(toISO) <= +new Date(fromISO)) {
                setErr('Khoảng thời gian nhận/trả không hợp lệ'); setSaving(false); return;
            }
            // 1) hợp đồng
            const hd = await api.post('/bookings', {
                KH_MA: Number(kh!.value),
                HT_MA: Number(ht),
                HDONG_TRANG_THAI: action === 'nhan_phong' ? 'CHECKED_IN' : 'CONFIRMED',
                HDONG_NGAYDAT: fromISO,
                HDONG_NGAYTRA: toISO,
                ...(note.trim() ? { HDONG_GHICHU: note.trim() } : {}), 
            });
            const toNoonISO = (ymd: string) => {
                const [y, m, d] = ymd.split('-').map(Number);
                return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
            };
            const bookingId = hd.data?.HDONG_MA;
            // 2) Tạo CTSD theo logic Giờ/Ngày
            const htLabel = hireTypes.find(o => o.value === ht)?.label || '';
            const isHourForm = /giờ/i.test(htLabel);
            const diffMs = (+new Date(toISO)) - (+new Date(fromISO));
            const hours = Math.ceil(diffMs / 3600000);

            if (hourHTId && ht === hourHTId) {
                // === THEO GIỜ ===
                await api.post(`/bookings/${bookingId}/items`, {
                    PHONG_MA: Number(roomId),
                    DONVI: 'HOUR',
                    TU_GIO: new Date(`${fromDate}T${fromTime}:00`).toISOString(),
                    DEN_GIO: new Date(`${toDate}T${toTime}:00`).toISOString(),
                    SO_LUONG: 1,
                    DON_GIA: Number(quoteTotal || 0),
                });
            } else {
                // CTSD theo ĐÊM (mỗi ngày 1 dòng)
                const toNoonISO = (ymd: string) => {
                    const [y, m, d] = ymd.split('-').map(Number);
                    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
                };

                const daysItems = quoteItems.length
                    ? quoteItems
                    : (() => {
                        const days = Math.ceil(diffMs / 86400000);
                        const pricePerDay = days > 0 ? (quoteTotal / days) : 0;
                        const arr = [];
                        for (let i = 0; i < days; i++) {
                            const d = new Date(fromDate + 'T00:00:00');
                            d.setDate(d.getDate() + i);
                            arr.push({ date: d.toISOString().slice(0, 10), price: pricePerDay });
                        }
                        return arr;
                    })();

                for (const it of daysItems) {
                    await api.post(`/bookings/${bookingId}/items`, {
                        PHONG_MA: Number(roomId),
                        DONVI: 'NIGHT',
                        NGAY: toNoonISO(it.date),
                        SO_LUONG: 1,
                        DON_GIA: Number(it.price || 0),
                    });
                }
            }

            const guestsPayload = (occupants || [])
                .filter(o => Number.isFinite(o.khId)) // bỏ trẻ em/dòng chưa có KH_MA
                .map((o, idx) => ({
                    KH_MA: Number(o.khId),
                    LA_KHACH_CHINH: idx === 0 && !o.isChild,        // người lớn đầu tiên làm khách chính
                    // GHI_CHU: o.note ?? null,                        // nếu bạn có field note; không có thì bỏ
                }));

            try {
                await api.put(`/bookings/${bookingId}/guests`, {
                    guests: guestsPayload,
                    KHACH_DAT_ID: Number(kh!.value),                // người đặt ở ô tìm khách
                });
            } catch (e) {
                // không chặn flow; bạn có thể setErr nếu muốn
                // console.error('Lưu khách lưu trú lỗi:', e?.response?.data || e);
            }

            onCreated?.(bookingId);
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Tạo đặt phòng thất bại');
        } finally { setSaving(false); }
    };

    const remain = Math.max(0, quoteTotal - Number(payInput || 0));
    // Khi mở modal, nếu danh sách trống → mặc định 1 người lớn (placeholder)
    useEffect(() => {
        if (!open) return;
        setOccupants(prev => {
            if (prev && prev.length > 0) return prev;
            return [{ khId: null, fullName: '', phone: '', idNumber: '', address: '', isChild: false }];
        });
    }, [open]);

    return (
        <Modal isOpen={open} onClose={onClose} className="w-full max-w-[1400px] p-4 sm:p-6">
            <h3 className="mb-3 text-base font-medium">Đặt/Nhận phòng nhanh</h3>

            {/* Hàng trên: tìm khách (nhỏ, trái) + nút + */}
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
                                    if (cp.length === 0) {
                                        cp.push({
                                            khId: o.value,
                                            fullName: khRow.KH_HOTEN || o.label,
                                            phone: khRow.KH_SDT || '',
                                            idNumber: khRow.KH_CMND || khRow.KH_CCCD || '',
                                            isChild: false,
                                        });
                                    } else {
                                        // ghi đè người lớn đầu tiên
                                        const idx = cp.findIndex(x => !x.isChild);
                                        const i = idx >= 0 ? idx : 0;
                                        cp[i] = {
                                            khId: o.value,
                                            fullName: khRow.KH_HOTEN || o.label,
                                            phone: khRow.KH_SDT || '',
                                            idNumber: khRow.KH_CMND || khRow.KH_CCCD || '',
                                            isChild: false,
                                        };
                                    }
                                    return cp;
                                });
                            } catch {
                                // fallback: vẫn set tên từ label
                                setOccupants(prev => {
                                    const cp = [...(prev || [])];
                                    if (cp.length === 0) {
                                        cp.push({ khId: o.value, fullName: o.label, isChild: false });
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

            {/* Bảng 7 cột */}
            <div className="rounded-xl border p-3 dark:border-slate-700">
                <div className="mb-2 grid grid-cols-[1.4fr_1fr_1fr_1.2fr_1.2fr_.9fr_.9fr_auto] items-end gap-3">

                    {/* Hạng phòng (chỉ hiển thị) */}
                    <div>
                        <div className="mb-1 text-xs text-gray-500">Hạng phòng</div>
                        <div className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700">
                            {lpLabel || (lp ? `Loại #${lp}` : '—')}
                        </div>
                    </div>

                    {/* Phòng (select theo hạng phòng) */}
                    <div>
                        <div className="mb-1 text-xs text-gray-500">Phòng</div>
                        <select
                            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : '')}
                        >
                            <option value="">— Chọn phòng —</option>
                            {roomOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Hình thức (trong bảng) */}
                    <div>
                        <div className="mb-1 text-xs text-gray-500">Hình thức</div>
                        <select
                            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            value={ht}
                            onChange={(e) => { setHt(e.target.value ? Number(e.target.value) : ''); setUserTouchedHT(true); } }
                        >
                            <option value="">— Chọn hình thức —</option>
                            {hireTypes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>

                    {/* Nhận */}
                    <div>
                        <div className="mb-1 text-xs text-gray-500">Nhận *</div>
                        <div className="grid grid-cols-[170px_110px] gap-2">
                            
                            <Flatpickr
                                value={fromDate}                                // ✅ luôn là string
                                options={{ dateFormat: 'Y-m-d', allowInput: false }}
                                onChange={(dates: Date[]) => setFromDate(ymd(dates))}
                                className="h-[40px] w-[170px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            />

                            <Flatpickr
                                value={fromTime} // '14:00'
                                options={{
                                    enableTime: true,
                                    noCalendar: true,
                                    dateFormat: 'H:i',    // HH:mm
                                    time_24hr: true,
                                    minuteIncrement: 5,
                                    // defaultDate: fromTime, // không bắt buộc vì đã có value
                                }}
                                onChange={(_, str) => setFromTime(str || '14:00')}
                                className="h-[40px] w-[110px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            />
                        </div>
                    </div>

                    {/* Trả phòng */}
                    <div>
                        <div className="mb-1 text-xs text-gray-500">Trả phòng *</div>
                        <div className="grid grid-cols-[170px_110px] gap-2">
                            
                            <Flatpickr
                                value={toDate}                                  // ✅ luôn là string
                                options={{ dateFormat: 'Y-m-d', allowInput: false }}
                                onChange={(dates: Date[]) => setToDate(ymd(dates))}
                                className="h-[40px] w-[170px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            />

                            <Flatpickr
                                value={toTime} // '12:00'
                                options={{
                                    enableTime: true,
                                    noCalendar: true,
                                    dateFormat: 'H:i',
                                    time_24hr: true,
                                    minuteIncrement: 5,
                                }}
                                onChange={(_, str) => setToTime(str || '12:00')}
                                className="h-[40px] w-[110px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            />
                        </div>
                    </div>



                    {/* Dự kiến */}
                    <div className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700">
                        {(hourHTId && ht === hourHTId)
                            ? `${hoursBetween(fromDate, fromTime, toDate, toTime)} giờ`
                            : `${nights} đêm`
                        }
                    </div>


                    {/* Thành tiền */}
                    <div>
                        <div className="mb-1 text-xs text-gray-500">Thành tiền</div>
                        <div className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700">
                            {quoting ? '...' : quoteTotal.toLocaleString('vi-VN')}
                        </div>
                    </div>

                    
                </div>
            </div>

            {err && <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/30">{err}</div>}

            {/* Thẻ thanh toán bên phải */}
            {/* <div className="mt-4 justify-self-end">
                <div className="w-[240px] rounded-xl border bg-gray-50 p-3 text-sm dark:border-slate-700 dark:bg-white/5">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-gray-600">Khách cần trả</span>
                        <b>{quoteTotal.toLocaleString('vi-VN')}</b>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-600">Khách thanh toán</span>
                        <input type="number" min="0"
                            className="w-[110px] rounded-md border px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-800"
                            value={payInput} onChange={(e) => setPayInput(e.target.value)} />
                    </div>
                    <div className="mt-2 text-right text-xs text-gray-500">Còn lại: <b>{Math.max(0, remain).toLocaleString('vi-VN')}</b></div>
                </div>
            </div> */}


            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">

                {/* LEFT: Chọn thêm phòng + Ghi chú */}
                <div className="space-y-3 max-w-2xl">
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                        onClick={() => {
                            // TODO: mở modal chọn thêm phòng/ hoặc gọi callback
                            // tạm thời chỉ log:
                            console.log('Chọn thêm phòng');
                        }}
                    >
                        <span className="text-emerald-600">＋</span> Chọn thêm phòng
                    </button>

                    <div>
                        <label className="mb-1 block text-sm text-gray-600">Ghi chú</label>
                        <textarea
                            rows={2}
                            placeholder="Nhập ghi chú..."
                            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                </div>

                {/* RIGHT: Thẻ thanh toán */}
                <div className="mt-4 justify-self-end">
                    <div className="w-[340px] rounded-xl border bg-gray-50 p-3 text-sm dark:border-slate-700 dark:bg-white/5">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-gray-600">Khách cần trả</span>
                            <b>{quoteTotal.toLocaleString('vi-VN')}</b>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-600">Khách thanh toán</span>
                            <input type="number" min="0"
                                className="w-[110px] rounded-md border px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-800"
                                value={payInput} onChange={(e) => setPayInput(e.target.value)} />
                        </div>
                        <div className="mt-2 text-right text-xs text-gray-500">Còn lại: <b>{Math.max(0, remain).toLocaleString('vi-VN')}</b></div>
                    </div>
                </div>
            </div>


            <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Đóng</Button>
                <Button variant="primary" size="sm" disabled={!canSave} onClick={() => save('nhan_phong')}>
                    {saving ? 'Đang xử lý…' : 'Nhận phòng'}
                </Button>
                <Button variant="add" size="sm" disabled={!canSave} onClick={() => save('dat_truoc')}>
                    {saving ? 'Đang xử lý…' : 'Đặt trước'}
                </Button>
            </div>

            <KhachHangCreateModal
                open={openCreateKH}
                onClose={() => setOpenCreateKH(false)}
                onCreated={(id, label) => {
                    setOpenCreateKH(false);
                    // gán lại chọn khách cho SearchCombo
                    setKh({ value: id, label });
                }}
            />

            
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
            {/* Modal tạo KH khi bấm + Người lớn trong OccupantsModal */}
            <KhachHangCreateModal
                open={occCreateOpen}
                onClose={() => setOccCreateOpen(false)}
                onCreated={(id, label) => {
                    setOccCreateOpen(false);
                    // Đẩy 1 người lớn mới sang bảng lưu trú
                    const { name, phone } = parseKHLabel(label);
                    const newAdult: Occupant = {
                        khId: id,
                        fullName: name,
                        phone: phone,
                        idNumber: '',
                        address: '',
                        isChild: false,
                    };
                    if (occAppendRef.current) {
                        occAppendRef.current(newAdult);
                        occAppendRef.current = null;
                    } else {
                        // fallback: nếu vì lý do gì không có callback thì vẫn tự thêm vào state
                        setOccupants(prev => [...prev, newAdult]);
                    }
                }}
            />


        </Modal>
    );
}
