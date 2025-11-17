'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import DatePicker from '@/components/form/date-picker';
import Input from '@/components/form/input/InputField';
import { PlusIcon, Search, TrashBinIcon } from '@/icons';
import type { Phong } from '@/app/admin/(noSidebar)/others-pages/dat-phong/page';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import KhachHangCreateModal from '@/components/ui/modal/KhachHangCreateModal';
import OccupantsModal, { Occupant } from '@/components/ui/modal/OccupantsModal';
import { Vietnamese } from 'flatpickr/dist/l10n/vn';
type Line = {
    id: string;                 // để key
    lp: number | '';            // LP_MA
    lpLabel: string;            // LP_TEN (để hiển thị)
    roomId: number | '';        // PHONG_MA chọn cho dòng này
    price: number;              // tổng tiền đã quote cho dòng này
    quoting?: boolean;          // đang quote
};
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

const ymdLocal = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toNumber = (s: string) => {
    const n = Number((s || '').replace(/[^\d]/g, ''));
    return Number.isFinite(n) ? n : 0;
};
const formatVND = (n: number) => (Number(n) || 0).toLocaleString('vi-VN');

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

// ==== Time helpers (copy cả block này) ====
const toDateObj = (dateStr: string, timeStr: string) => new Date(`${dateStr}T${timeStr}:00`);
const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60000);
const fmtYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtHHMM = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const diffMinutes = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

// ========== MAIN ==========
export default function BookingCreateModal({
    open, onClose, onCreated, initial, rooms, initialMulti,
}: {
    open: boolean; onClose: () => void; onCreated?: (bookingId?: number) => void;
    initial?: { selectedLP?: number; selectedRoomId?: number; selectedRoomName?: string };
    rooms?: Phong[];
    initialMulti?: {
        ht: 'DAY' | 'HOUR',
        fromDate: string, fromTime: string,
        toDate: string, toTime: string,
        selections: { LP_MA: number; LP_TEN: string; qty: number; price: number }[]
    };
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

    // Helper mặc định theo NGÀY: hôm nay 14:00 -> ngày mai 12:00
    const defaultDayRange = () => {
        const pad = (n: number) => String(n).padStart(2, '0');
        const now = new Date();
        const fromDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const fromTime = '14:00';
        const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
        const toDate = `${tmr.getFullYear()}-${pad(tmr.getMonth() + 1)}-${pad(tmr.getDate())}`;
        const toTime = '12:00';
        return { fromDate, fromTime, toDate, toTime };
    };
    // GỘP các setState vào 1 hàm reset
    function resetForm() {
        const d = defaultDayRange();
        setUserTouchedHT(false);
        setHt('');
        setKh(null);             // KH_MA rỗng (tuỳ bạn: null / '' / { value:'', label:''})
        setFromDate(d.fromDate);
        setFromTime(d.fromTime);
        setToDate(d.toDate);
        setToTime(d.toTime);
        setLines([{ id: '1', lp: '', lpLabel: '', roomId: '', price: 0, quoting: false }]); // nếu bạn có mảng dòng
        setErr('');
        setNote('')
    }
    useEffect(() => {
        if (open) {
            resetForm();
        }
    }, [open]);

    // mở modal tạo KH từ nút + Người lớn
    const [occCreateOpen, setOccCreateOpen] = useState(false);
    // nơi để lưu callback append do OccupantsModal truyền lên
    const occAppendRef = useRef<null | ((o: Occupant) => void)>(null);
    const toIsoDateTime = (dateStr: string, timeStr: string) => {
        if (!dateStr) return '';
        const t = timeStr && /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '00:00';
        return new Date(`${dateStr}T${t}:00`).toISOString();
    };

    const [lines, setLines] = useState<Line[]>([]);

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
    // Hiển thị "x giờ y phút" từ số giờ thập phân
    function formatHoursHM(decHours: number) {
        const totalMin = Math.max(0, Math.round((Number(decHours) || 0) * 60)); // chống NaN & làm tròn phút
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return m ? `${h} giờ ${m} phút` : `${h} giờ`;
    }

    // Làm tròn tiền về NGHÌN gần nhất (>= .5 nghìn thì lên)
    function roundToNearestThousand(amount: number) {
        const n = Number(amount) || 0;
        return Math.round(n / 1000) * 1000;
    }



    // cache id HT theo giờ/đêm sau khi load
    const [hourHTId, setHourHTId] = useState<number | undefined>(undefined);
    const [nightHTId, setNightHTId] = useState<number | undefined>(undefined);


    const [depositPercent, setDepositPercent] = useState<number>(10); // % cọc, mặc định 10
    const depositRequired = useMemo(() => {
        const p = Math.max(0, Math.min(100, depositPercent || 0));
        return Math.round((quoteTotal * p) / 100);
    }, [quoteTotal, depositPercent]);
    const remain = Math.max(0, quoteTotal - toNumber(payInput));

    // === cấu hình bước 30 phút ===
    const STEP_MIN = 30;

    // HH:mm -> tổng phút
    function minutesOf(hhmm: string) {
        const [h, m] = (hhmm || "00:00").split(":").map((x) => Number(x) || 0);
        return h * 60 + m;
    }

    // Date -> "YYYY-MM-DD"
    function fmtYmd(date: Date) {
        const p = (n: number) => String(n).padStart(2, "0");
        return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
    }

    // Date -> "HH:mm"
    function fmtHm(date: Date) {
        const p = (n: number) => String(n).padStart(2, "0");
        return `${p(date.getHours())}:${p(date.getMinutes())}`;
    }

    function toDateObj(d?: string, t?: string) {
        return new Date(`${d || ""}T${(t || "00:00")}:00`);
    }

    // làm tròn LÊN về bội số step phút cho chuỗi "HH:mm"
    function roundUpHHMM(hhmm: string, step = STEP_MIN) {
        const p = (n: number) => String(n).padStart(2, "0");
        const min = minutesOf(hhmm);
        const rounded = Math.ceil(min / step) * step;
        const H = Math.floor((rounded % (24 * 60)) / 60);
        const M = rounded % 60;
        return `${p(H)}:${p(M)}`;
    }

    // from không được < now (giữ CHÍNH XÁC phút hiện tại, không làm tròn)
    function ensureFromNotPastExact(fd: string, ft: string) {
        const from = toDateObj(fd, ft);
        const now = new Date();
        if (from < now) {
            const d = now;
            return { fromDate: fmtYmd(d), fromTime: fmtHm(d) };
        }
        return { fromDate: fd, fromTime: ft };
    }

    // to phải >= from + 60' (giữ CHÍNH XÁC, không làm tròn)
    function ensureToAtLeast1h(fd: string, ft: string, td: string, tt: string) {
        const from = toDateObj(fd, ft);
        const to = toDateObj(td, tt);
        const minTo = new Date(from.getTime() + 60 * 60_000);
        if (to < minTo) {
            const d = minTo;
            return { toDate: fmtYmd(d), toTime: fmtHm(d) };
        }
        return { toDate: td, toTime: tt };
    }
    const fromTimeRoundedOnce = useRef(false);
    useEffect(() => {
        if (open) {
            fromTimeRoundedOnce.current = false;
        }
    }, [open]);

    // Load lists + default dates mỗi lần mở
    useEffect(() => {
        if (!open) return;
        setErr(null); setSaving(false); setPayInput('');

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
                // // 👇 nếu chưa chọn, tự chọn "Ngày" (ưu tiên tên có 'ngày' hoặc 'đêm')
                // setHt(prev => {
                //     if (prev) return prev;
                //     const day = list.find(o => /ngày|đêm/i.test(o.label)) || list[0];
                //     return day ? Number(day.value) : '';
                // });
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
        if (!(ht && fromDate && toDate)) return false;
        // chỉ cần có ÍT NHẤT 1 dòng đã chọn phòng để quote
        const hasRoom = lines.some(l => !!l.roomId);
        if (!hasRoom) return false;
        const s = new Date(`${fromDate}T${fromTime || '00:00'}:00`);
        const e = new Date(`${toDate}T${toTime || '00:00'}:00`);
        return e.getTime() > s.getTime();
    }, [lines.map(l => l.roomId).join(','), ht, fromDate, toDate, fromTime, toTime]);

    const canSave = !!kh?.value
        && !!ht && !!fromDate && !!toDate
        && lines.every(l => !!l.roomId)   // tất cả dòng đều đã chọn phòng
        && !saving;


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

                setQuoteTotal(roundToNearestThousand(Number(totalFromApi)));

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
    }, [open, roomId, ht, fromDate, toDate, fromTime, toTime, lines.map(l => l.roomId).join(',')]);


    // lưu
    const save = async (action: 'dat_truoc' | 'nhan_phong') => {
        if (!canSave) return;
        setSaving(true); setErr(null);
        try {
            const fromISO = toIsoDateTime(fromDate, fromTime);
            const toISO = toIsoDateTime(toDate, toTime);
            const now = new Date();
            const nowISO = now.toISOString();
            const isHourMode = Boolean(hourHTId && Number(ht) === Number(hourHTId));
            // const totalRounded = isHourMode ? roundToNearestThousand(total) : total;

            let realFromISO = fromISO;
            let realToISO = toISO;

            // // Nếu người dùng bấm "Nhận phòng" và đang ở chế độ NGÀY → ép from = NOW
            // if (action === 'nhan_phong' && !isHourMode) {
            //     realFromISO = nowISO;
            // }

            // if (!fromISO || !toISO || +new Date(toISO) <= +new Date(fromISO)) {
            //     setErr('Khoảng thời gian nhận/trả không hợp lệ'); setSaving(false); return;
            // }

            // // Không cho đặt ở quá khứ (trừ case "nhận phòng" + ngày, vì đã ép from = now)
            // if (!(action === 'nhan_phong' && !isHourMode)) {
            //     if (new Date(fromISO).getTime() < new Date(nowISO).getTime()) {
            //         setErr('Không thể đặt phòng trong quá khứ. Vui lòng chọn thời điểm nhận lớn hơn hiện tại.');
            //         setSaving(false);
            //         return;
            //     }
            // }

            // // Kiểm tra khoảng hợp lệ sau khi tính realFromISO
            // if (!realFromISO || !toISO || +new Date(toISO) <= +new Date(realFromISO)) {
            //     setErr('Khoảng thời gian nhận/trả không hợp lệ.');
            //     setSaving(false);
            //     return;
            // }
            // ➊ Nếu là NHẬN PHÒNG → ép from = NOW (bất kể ngày/giờ)
            if (action === 'nhan_phong') {
                realFromISO = nowISO;

                if (isHourMode) {
                    // ➋ Với GIỜ: đảm bảo to >= now + 1h
                    const minTo = new Date(now.getTime() + 60 * 60_000);
                    if (!toISO || new Date(toISO) < minTo) {
                        realToISO = minTo.toISOString();
                    }
                }
            }

            // ➌ Validate dùng cặp realFromISO/realToISO
            if (!realFromISO || !realToISO || +new Date(realToISO) <= +new Date(realFromISO)) {
                setErr('Khoảng thời gian nhận/trả không hợp lệ');
                setSaving(false);
                return;
            }

            // ➍ Chặn đặt quá khứ chỉ khi KHÔNG phải nhận phòng
            if (action !== 'nhan_phong') {
                if (!fromISO || new Date(fromISO).getTime() < new Date(nowISO).getTime()) {
                    setErr('Không thể đặt phòng trong quá khứ. Vui lòng chọn thời điểm nhận lớn hơn hiện tại.');
                    setSaving(false);
                    return;
                }
            }
            // 1) hợp đồng
            const safePay = Math.min(Math.max(toNumber(payInput), 0), Number(quoteTotal || 0));
            const hd = await api.post('/bookings', {
                KH_MA: Number(kh!.value),
                HT_MA: Number(ht),
                HDONG_TRANG_THAI: action === 'nhan_phong' ? 'CONFIRMED' : 'CONFIRMED',
                HDONG_NGAYDAT: realFromISO,
                HDONG_NGAYTRA: toISO,
                ...(note.trim() ? { HDONG_GHICHU: note.trim() } : {}),
                HDONG_TONGTIENDUKIEN: Number(quoteTotal || 0),
                HDONG_TILECOCAPDUNG: Number(depositPercent ?? 10),
                HDONG_TIENCOCYEUCAU: safePay,
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
            for (const ln of lines) {
                if (!ln.roomId) continue;
                if (hourHTId && ht === hourHTId) {
                    // === THEO GIỜ ===
                    await api.post(`/bookings/${bookingId}/items`, {
                        PHONG_MA: Number(ln.roomId),
                        DONVI: 'HOUR',
                        TU_GIO: realFromISO,
                        DEN_GIO: realToISO,
                        SO_LUONG: 1,
                        DON_GIA: Number(ln.price || 0),
                    });
                } else {
                    // CTSD theo ĐÊM (mỗi ngày 1 dòng)
                    const toNoonISO = (ymd: string) => {
                        const [y, m, d] = ymd.split('-').map(Number);
                        return new Date(Date.UTC(y, m - 1, d, 5, 0, 0)).toISOString();
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
                                arr.push({ date: ymdLocal(d), price: pricePerDay });
                            }
                            return arr;
                        })();

                    for (const it of daysItems) {
                        await api.post(`/bookings/${bookingId}/items`, {
                            PHONG_MA: Number(ln.roomId),
                            DONVI: 'NIGHT',
                            NGAY: toNoonISO(it.date),
                            SO_LUONG: 1,
                            DON_GIA: Number(it.price || 0),
                        });
                    }
                }
            }

            // 3️⃣ Nếu là hành động "Nhận phòng" → gọi check-in để đổi trạng thái phòng
            // 3️⃣ Nếu là hành động "Nhận phòng" → gọi check-in để đổi trạng thái phòng
            // if (action === 'nhan_phong') {
            //     try {
            //         for (const ln of lines) {
            //             if (ln.roomId) {
            //                 await api.post(`/bookings/${bookingId}/checkin`, { PHONG_MA: Number(ln.roomId) });
            //             }
            //         }
            //     } catch (e:any) {
            //         const msg = e?.response?.data?.message || 'Không thể nhận phòng.';
            //         alert(msg);
            //         return;
            //     }
            // }


            const guestsPayload = (occupants || [])
                .filter(o => Number.isFinite(o.khId)) // bỏ trẻ em/dòng chưa có KH_MA
                .map((o, idx) => ({
                    KH_MA: Number(o.khId),
                    LA_KHACH_CHINH: idx === 0 && !o.isChild,        // người lớn đầu tiên làm khách chính
                    // GHI_CHU: o.note ?? null,                        // nếu bạn có field note; không có thì bỏ
                }));
            console.log('GUESTS PAYLOAD =', guestsPayload, 'KHACH_DAT_ID =', Number(kh?.value));
            try {
                await api.put(`/bookings/${bookingId}/guests`, {
                    guests: guestsPayload,
                    KHACH_DAT_ID: Number(kh!.value),                // người đặt ở ô tìm khách
                });
            } catch (e) {
                // không chặn flow; bạn có thể setErr nếu muốn
                // console.error('Lưu khách lưu trú lỗi:', e?.response?.data || e);
            }

            //  chỉ redirect nếu mọi thứ thành công, không lỗi checkin
            if (action !== 'nhan_phong') {
                // Đặt trước phòng → in hợp đồng ngay
                onCreated?.(bookingId);
                window.location.href = `/admin/others-pages/dat-phong/${bookingId}/print`;
            } else {
                // Nếu là nhận phòng → chỉ in nếu checkin thành công
                try {
                    for (const ln of lines) {
                        if (ln.roomId) {
                            await api.post(`/bookings/${bookingId}/checkin`, { PHONG_MA: Number(ln.roomId) });
                        }
                    }
                    // 🟢 nếu không lỗi, thì mới chuyển sang trang in
                    onCreated?.(bookingId);
                    window.location.href = `/admin/others-pages/dat-phong/${bookingId}/print`;
                } catch (e: any) {
                    const msg = e?.response?.data?.message || 'Không thể nhận phòng.';
                    alert(msg);
                    // 🚫 dừng ở đây, không redirect
                    return;
                }
            }


        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Tạo đặt phòng thất bại');
        } finally { setSaving(false); }
    };

    // Khi mở modal, nếu danh sách trống → mặc định 1 người lớn (placeholder)
    useEffect(() => {
        if (!open) return;
        if ((initial as any)?.prefillFromISO && (initial as any)?.prefillToISO) {
            const from = new Date((initial as any).prefillFromISO);
            const to = new Date((initial as any).prefillToISO);
            const pad2 = (n: number) => String(n).padStart(2, '0');
            const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
            const hm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

            setFromDate(ymd(from));
            setToDate(ymd(to));
            setFromTime(hm(from));
            setToTime(hm(to));
        }
        if ((initial as any)?.prefillHT) {
            setHt((initial as any).prefillHT);
            setUserTouchedHT(true); // không auto-switch nữa
        }
        if (initialMulti) {
            // set thời gian & hình thức từ modal chọn hạng
            setFromDate(initialMulti.fromDate);
            setFromTime(initialMulti.fromTime);
            setToDate(initialMulti.toDate);
            setToTime(initialMulti.toTime);

            // convert 'DAY'/'HOUR' -> id thật đã load vào hireTypes
            // nếu bạn đã map hourHTId/nightHTId, có thể dùng:
            const htId = initialMulti.ht === 'HOUR' ? hourHTId : nightHTId;
            if (htId) setHt(htId);

            // nở selections thành nhiều dòng
            const expanded: Line[] = [];
            initialMulti.selections.forEach(s => {
                for (let i = 0; i < s.qty; i++) {
                    expanded.push({
                        id: `${s.LP_MA}-${i}-${Date.now()}-${Math.random()}`,
                        lp: s.LP_MA,
                        lpLabel: s.LP_TEN,
                        roomId: '',
                        price: 0,
                    });
                }
            });
            setLines(expanded);
        } else {
            const initRoom = initial?.selectedRoomId || '';
            const rec = (rooms ?? allRooms).find(x => x.PHONG_MA === Number(initRoom));
            const lpma = initRoom ? ((rec as any)?.LP_MA ?? rec?.LOAI_PHONG?.LP_MA) : (initial?.selectedLP ?? '');
            const lpten = initRoom ? (rec?.LOAI_PHONG?.LP_TEN ?? '') : '';

            setLines([{
                id: 'single',
                lp: (lpma || '') as any,
                lpLabel: lpten || (lpma ? `Loại #${lpma}` : '—'),
                roomId: (initRoom || '') as any,
                price: 0,
            }]);

        }

        setOccupants(prev => {
            if (prev && prev.length > 0) return prev;
            return [{ khId: null, fullName: '', phone: '', idNumber: '', address: '', isChild: false }];
        });
    }, [open]);

    const handleSelectRoom = (idx: number, val: number | '') => {
        const chosenId = Number(val || 0);
        if (chosenId && lines.some((l, i) => i !== idx && Number(l.roomId) === chosenId)) {
            // không cho trùng
            setDupMsg('Phòng này đã được chọn ở dòng khác. Mỗi dòng phải là một phòng khác nhau.');
            return;
        }
        const r = allRooms.find(x => x.PHONG_MA === chosenId);
        setLines(prev => {
            const cp = [...prev];
            cp[idx] = {
                ...cp[idx],
                roomId: (val || '') as any,
                lp: ((r as any)?.LP_MA ?? r?.LOAI_PHONG?.LP_MA ?? cp[idx].lp) as any,
                lpLabel: (r?.LOAI_PHONG?.LP_TEN ?? cp[idx].lpLabel) as any,
            };
            return cp;
        });
    };
    // dùng để vô hiệu hóa setState của những lần quote cũ
    const quoteRunIdRef = useRef(0);
    useEffect(() => { if (!open) quoteRunIdRef.current++; }, [open]);

    useEffect(() => {
        if (!open) return;
        const runId = ++quoteRunIdRef.current;
        const isoFrom = fromDate && fromTime ? new Date(`${fromDate}T${fromTime}:00`).toISOString() : '';
        const isoTo = toDate && toTime ? new Date(`${toDate}T${toTime}:00`).toISOString() : '';
        if (!isoFrom || !isoTo || +new Date(isoTo) <= +new Date(isoFrom)) {
            // reset giá
            if (runId !== quoteRunIdRef.current) return;
            setLines(prev => prev.map(l => ({ ...l, price: 0, quoting: false })));
            setQuoteTotal(0);
            return;
        }

        // quote từng dòng có roomId
        (async () => {
            const results: number[] = [];
            const updated = await Promise.all(lines.map(async (l) => {
                if (!l.roomId || !ht) { results.push(0); return { ...l, price: 0, quoting: false }; }
                try {
                    // const q = await api.get('/pricing/quote', {
                    //     params: { PHONG_MA: Number(l.roomId), HT_MA: Number(ht), from: isoFrom, to: isoTo }
                    // });
                    // const total = Number(q.data?.total ?? q.data?.data?.total ?? q.data?.sum ?? 0);
                    // const totalRounded = roundToNearestThousand(total);
                    // results.push(totalRounded);
                    // return { ...l, price: totalRounded, quoting: false };
                    const q = await api.get('/pricing/quote', {
                        params: { PHONG_MA: Number(l.roomId), HT_MA: Number(ht), from: isoFrom, to: isoTo }
                    });

                    const totalFromApi = Number(q.data?.total ?? q.data?.data?.total ?? q.data?.sum ?? 0);

                    // Tính giờ THẬP PHÂN theo đúng khoảng chọn
                    const decHours = hoursBetween(fromDate, fromTime, toDate, toTime);

                    let lineTotal: number;

                    if (hourHTId && Number(ht) === Number(hourHTId)) {
                        // Backend có thể đang ceil giờ => nội suy đơn giá/giờ từ total của API
                        // Đơn giá/giờ ≈ totalFromApi / ceil(decHours)
                        const ceilHours = Math.max(1, Math.ceil(decHours));
                        const unitPerHour = ceilHours ? (totalFromApi / ceilHours) : 0;

                        // Thành tiền theo giờ thập phân, rồi làm tròn nghìn gần nhất
                        lineTotal = roundToNearestThousand(unitPerHour * decHours);
                    } else {
                        // Theo NGÀY giữ nguyên total và chỉ làm tròn nghìn
                        lineTotal = roundToNearestThousand(totalFromApi);
                    }

                    results.push(lineTotal);
                    return { ...l, price: lineTotal, quoting: false };
                } catch {
                    results.push(0);
                    return { ...l, price: 0, quoting: false };
                }
            }));
            if (runId !== quoteRunIdRef.current) return;
            setLines(updated);
            setQuoteTotal(results.reduce((s, n) => s + (Number(n) || 0), 0));
        })();
    }, [open, ht, fromDate, fromTime, toDate, toTime, JSON.stringify(lines.map(l => l.roomId))]);

    useEffect(() => {
        const sum = lines.reduce((s, l) => s + (Number(l.price) || 0), 0);
        setQuoteTotal(sum);
    }, [lines]);

    const timeOptsTo = useMemo(
        () => ({
            enableTime: true,
            noCalendar: true,
            dateFormat: 'H:i',
            time_24hr: true,
            minuteIncrement: 30,
            locale: Vietnamese,
            // defaultDate: fromTime, // KHÔNG dùng khi đã có value
            allowInput: true,      // (tuỳ chọn) cho phép gõ tay
            onOpen: (selectedDates: any, dateStr: string, instance: any) => {
                const cur = instance.input?.value || dateStr || "00:00";
                const rounded = roundUpHHMM(cur, 30);
                if (rounded !== cur) {
                    // cập nhật hiển thị trong input & panel, không phát sự kiện change
                    instance.setDate(rounded, false, "H:i");
                    setToTime(rounded);
                }
            },
        }),
        []
    );

    const timeOptsFrom = useMemo(
        () => ({
            enableTime: true,
            noCalendar: true,
            dateFormat: 'H:i',
            time_24hr: true,
            minuteIncrement: 30,
            locale: Vietnamese,
            // defaultDate: fromTime, // KHÔNG dùng khi đã có value
            allowInput: true,      // (tuỳ chọn) cho phép gõ tay
            onOpen: (selectedDates: any, dateStr: string, instance: any) => {
                const cur = instance.input?.value || dateStr || "00:00";
                const rounded = roundUpHHMM(cur, 30);
                if (rounded !== cur) {
                    // cập nhật hiển thị trong input & panel, không phát sự kiện change
                    instance.setDate(rounded, false, "H:i");
                    setFromTime(rounded);
                }
            },
        }),
        []
    );

    const toOccupant = (rec: any): Occupant => ({
        khId: rec?.KH_MA ?? null,
        fullName: rec?.KH_HOTEN ?? '',
        phone: rec?.KH_SDT ?? '',
        idNumber: rec?.KH_CCCD ?? '',
        address: rec?.KH_DIACHI ?? '',
        isChild: false,
    });

    // BookingCreateModal.tsx (ở phần state)
    const [dupMsg, setDupMsg] = useState<string | null>(null);
    // Tạo 1 dòng trống
    const makeBlankLine = (): Line => ({
        id: (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        lp: '',
        lpLabel: '',
        roomId: '',
        price: 0,
    });

    // ...
    useEffect(() => {
        // đếm số lần chọn của mỗi PHONG_MA
        const counts: Record<number, number> = {};
        (lines || []).forEach(l => {
            if (!l.roomId) return;
            const id = Number(l.roomId);
            counts[id] = (counts[id] || 0) + 1;
        });

        // gom các phòng bị chọn >1 lần
        const dups = Object.entries(counts)
            .filter(([, c]) => c > 1)
            .map(([id]) => Number(id));

        if (dups.length > 0) {
            const names = dups
                .map(id => allRooms.find(r => r.PHONG_MA === id)?.PHONG_TEN || `#${id}`);
            setDupMsg(
                `Bạn đang chọn trùng phòng: ${names.join(', ')}. Vui lòng chọn phòng khác cho mỗi dòng.`
            );
        } else {
            setDupMsg(null);
        }
    }, [lines, allRooms]);
    const COLS =
        "grid grid-cols-[1.4fr_1fr_1fr_280px_280px_1fr_1fr_auto] items-center gap-3";
    const [availableIds, setAvailableIds] = useState<Set<number>>(new Set());
    useEffect(() => {
        if (!open) return;

        // đủ điều kiện mới gọi
        if (!fromDate || !toDate) { setAvailableIds(new Set()); return; }

        const fromISO = new Date(`${fromDate}T${fromTime || '00:00'}:00`).toISOString();
        const toISO = new Date(`${toDate}T${toTime || '00:00'}:00`).toISOString();
        if (+new Date(toISO) <= +new Date(fromISO)) { setAvailableIds(new Set()); return; }

        // OPTIONAL: debounce nhẹ để tránh gọi quá dày
        let timer = setTimeout(async () => {
            try {
                const r = await api.get('/rooms/availability', {
                    params: { from: fromISO, to: toISO, lp: lp || undefined }
                });
                // API trả { available: [{id,name}, ...] }
                const ids = new Set<number>((r.data?.available || []).map((x: any) => Number(x.id)));
                setAvailableIds(ids);

                // Nếu phòng đang chọn không còn rảnh → clear để tránh lỗi lúc quote/save
                setLines(prev => prev.map(l => {
                    if (!l.roomId) return l;
                    return (ids.size && !ids.has(Number(l.roomId))) ? { ...l, roomId: '' as any, price: 0 } : l;
                }));
            } catch {
                // Nếu API lỗi, không disable gì cả để user vẫn thao tác được
                setAvailableIds(new Set());
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [open, fromDate, fromTime, toDate, toTime, lp]);


    // ==== Enforce min 60' khi thuê theo giờ ====
    useEffect(() => {
        // hourHTId là HT theo giờ bạn đã có sẵn trong component
        if (!hourHTId || Number(ht) !== Number(hourHTId)) return;

        const start = toDateObj(fromDate, fromTime);
        const end = toDateObj(toDate, toTime);
        const MIN = 60; // tối thiểu 60 phút

        if (diffMinutes(start, end) < MIN) {
            const e2 = addMinutes(start, MIN);
            // TỰ SỬA giờ trả cho hợp lệ (không block người dùng)
            setToDate(fmtYMD(e2));
            setToTime(fmtHHMM(e2));
        }
    }, [ht, fromDate, fromTime, toDate, toTime, hourHTId]);


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

                {/* <button
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
                </button> */}
            </div>

            {/* Bảng 7 cột */}
            <div className="rounded-xl border p-3 dark:border-slate-700">
                <div className={`mb-2 ${COLS}`}>
                    {/* Header */}
                    <div className="mb-1 text-xs text-gray-500">Hạng phòng</div>
                    <div className="mb-1 text-xs text-gray-500">Phòng</div>
                    <div className="mb-1 text-xs text-gray-500">Hình thức</div>
                    <div className="mb-1 text-xs text-gray-500">Nhận *</div>
                    <div className="mb-1 text-xs text-gray-500">Trả phòng *</div>
                    <div className="mb-1 text-xs text-gray-500">Thời gian</div>
                    <div className="mb-1 text-xs text-gray-500">Thành tiền</div>
                    <div></div>
                </div>

                {lines.map((ln, idx) => (
                    <div key={ln.id} className={`mb-2 ${COLS}`}>
                        {/* Hạng phòng (chỉ hiển thị theo selection / auto khi chọn phòng) */}
                        <div className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700">
                            {ln.lpLabel || (ln.lp ? `Loại #${ln.lp}` : '—')}
                        </div>

                        {/* Phòng */}
                        {/* <div>
                            <select
                                className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                value={ln.roomId}
                                onChange={(e) => handleSelectRoom(idx, e.target.value ? Number(e.target.value) : '')}
                            >
                                <option value="">— Chọn phòng —</option>
                                {(ln.lp
                                    ? allRooms.filter((r: any) => (r?.LP_MA === ln.lp) || (r?.LOAI_PHONG?.LP_MA === ln.lp))
                                    : allRooms
                                ).map(r => (
                                    <option key={r.PHONG_MA} value={r.PHONG_MA}>{r.PHONG_TEN}</option>
                                ))}
                            </select>
                        </div> */}
                        <select
                            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                            value={ln.roomId}
                            onChange={(e) => handleSelectRoom(idx, e.target.value ? Number(e.target.value) : '')}
                        >
                            <option value="">— Chọn phòng —</option>
                            {(ln.lp
                                ? allRooms.filter((r: any) => (r?.LP_MA === ln.lp) || (r?.LOAI_PHONG?.LP_MA === ln.lp))
                                : allRooms
                            ).map(r => {
                                // Khi availableIds rỗng (chưa có dữ liệu hoặc lỗi) → KHÔNG disable gì
                                const known = availableIds.size > 0;
                                const isFree = !known || availableIds.has(Number(r.PHONG_MA));
                                return (
                                    <option
                                        key={r.PHONG_MA}
                                        value={r.PHONG_MA}
                                        disabled={known && !isFree}
                                    >
                                        {r.PHONG_TEN}{known && !isFree ? ' (bận)' : ''}
                                    </option>
                                );
                            })}
                        </select>

                        {/* Hình thức: dùng 1 state chung cho tất cả dòng */}
                        <div>
                            <select
                                className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                value={ht}
                                onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : '';
                                    setHt(val);
                                    setUserTouchedHT(true);


                                    // Nếu chọn THEO GIỜ -> nhận = NOW, trả = NOW + 1h
                                    if (val && hourHTId && val === hourHTId) {
                                        const pad = (n: number) => String(n).padStart(2, "0");
                                        const d = new Date();
                                        const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                                        const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                        fromTimeRoundedOnce.current = false;
                                        setFromDate(ymd);
                                        setFromTime(hm);

                                        d.setHours(d.getHours() + 1);
                                        const ymd2 = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                                        const hm2 = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                        setToDate(ymd2);
                                        setToTime(hm2);
                                        return;
                                    }

                                    // Ngược lại (THEO NGÀY) -> reset về mặc định: hôm nay 14:00 -> mai 12:00
                                    const def = defaultDayRange();
                                    setFromDate(def.fromDate);
                                    setFromTime(def.fromTime);
                                    setToDate(def.toDate);
                                    setToTime(def.toTime);
                                }}

                            >
                                <option value="">— Chọn hình thức —</option>
                                {hireTypes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>

                        {/* Nhận / Trả: dùng chung cho tất cả dòng (như Figma bạn gửi) */}
                        <div className="grid grid-cols-[170px_110px] gap-2">
                            <Flatpickr value={fromDate} options={{ dateFormat: 'Y-m-d', minDate: 'today', locale: Vietnamese }} onChange={(d: any, s: string) => setFromDate(s)}
                                className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                            <Flatpickr value={fromTime} options={timeOptsFrom} onChange={(_, s) => setFromTime(s || '14:00')}
                                className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                        </div>
                        <div className="grid grid-cols-[170px_110px] gap-2">
                            <Flatpickr value={toDate} options={{ dateFormat: 'Y-m-d', minDate: fromDate || 'today', locale: Vietnamese }} onChange={(d: any, s: string) => setToDate(s)}
                                className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                            <Flatpickr value={toTime} options={timeOptsTo} onChange={(_, s) => setToTime(s || '12:00')}
                                className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800" />
                        </div>

                        {/* Thời gian */}
                        <div className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700">
                            {(hourHTId && ht === hourHTId)
                                ? formatHoursHM(hoursBetween(fromDate, fromTime, toDate, toTime))
                                : `${nights} đêm`
                            }
                        </div>

                        {/* Thành tiền của dòng */}
                        <div className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700">
                            {ln.quoting ? '...' : (ln.price || 0).toLocaleString('vi-VN')}
                        </div>

                        {/* (tuỳ) xoá dòng */}
                        <div className="text-right">
                            {/* <button className="rounded-md border px-2 py-1 text-xs dark:border-slate-700"
                                onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                            >🗑</button> */}

                            <Button size="sm" variant="light" startIcon={<TrashBinIcon />} onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}> </Button>

                        </div>
                    </div>
                ))}
                <div id="booking-lines-end" />
            </div>
            {dupMsg && (
                <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/30">
                    {dupMsg}
                </div>
            )}

            {err && <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/30">{err}</div>}



            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">

                {/* LEFT: Chọn thêm phòng + Ghi chú */}
                <div className="space-y-3 max-w-2xl">
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                        onClick={() => {
                            setLines(prev => [...prev, makeBlankLine()]);
                            setTimeout(() => document.querySelector('#booking-lines-end')?.scrollIntoView({ behavior: 'smooth' }), 0);

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
                    {/* <div className="w-[340px] rounded-xl border bg-gray-50 p-3 text-sm dark:border-slate-700 dark:bg-white/5">
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
                    </div> */}

                    <div className="w-[340px] rounded-xl border bg-gray-50 p-3 text-sm dark:border-slate-700 dark:bg-white/5">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-gray-600">Khách cần trả</span>
                            <b>{formatVND(quoteTotal)}</b>
                        </div>

                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-gray-600">
                                Cọc áp dụng
                                <span className="ml-2 inline-flex items-center gap-1">
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        className="w-[60px] rounded-md border px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-800"
                                        value={depositPercent}
                                        onChange={(e) => setDepositPercent(Number(e.target.value) || 0)}
                                        title="Tỉ lệ cọc (%)"
                                    />
                                    <span>%</span>
                                </span>
                            </span>
                            <b>{formatVND(depositRequired)}</b>
                        </div>

                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-gray-600">Khách thanh toán</span>
                            <input
                                inputMode="numeric"
                                className="w-[110px] rounded-md border px-2 py-1 text-right dark:border-slate-700 dark:bg-slate-800"
                                value={payInput}
                                onChange={(e) => setPayInput(e.target.value)}
                                onBlur={(e) => {
                                    const n = toNumber(e.target.value);
                                    setPayInput(n ? formatVND(n) : '');
                                }}
                            />
                        </div>

                        <div className="mt-2 text-right text-xs text-gray-500">
                            Còn lại: <b>{formatVND(remain)}</b>
                        </div>
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
                onCreated={async (id, label, rec) => {
                    setOpenCreateKH(false);
                    // gán lại chọn khách cho SearchCombo
                    setKh({ value: id, label });
                    const full = rec ?? (await api.get(`/khach-hang/${id}`)).data;
                    setOccupants(prev =>
                        (prev.length === 0 || prev.every(x => x.isChild))
                            ? [toOccupant(full)]
                            : prev
                    );

                }}
            />


            {/* <OccupantsModal
                open={occOpen}
                onClose={() => setOccOpen(false)}
                value={occupants}
                onChange={(list) => setOccupants(list)}
                onAddAdultViaCreate={(append) => {
                    // nhận callback append từ modal con và mở modal tạo KH
                    occAppendRef.current = append;
                    setOccCreateOpen(true);
                }}
            /> */}
            {/* Modal tạo KH khi bấm + Người lớn trong OccupantsModal */}
            <KhachHangCreateModal
                open={occCreateOpen}
                onClose={() => setOccCreateOpen(false)}
                onCreated={(id, label, rec) => {
                    setOccCreateOpen(false);
                    const newAdult = toOccupant(rec); // có idNumber & address
                    if (occAppendRef.current) {
                        occAppendRef.current(newAdult);
                        occAppendRef.current = null;
                    } else {
                        setOccupants(prev => [...prev, newAdult]);
                    }
                }}
            />


        </Modal>
    );
}
