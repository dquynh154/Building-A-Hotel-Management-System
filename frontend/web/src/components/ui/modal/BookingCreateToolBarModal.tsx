'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';

type Row = { LP_MA: number; LP_TEN: string; freeRooms: number; totalRooms: number; price: number };
type Selection = { LP_MA: number; qty: number; price: number; LP_TEN: string };
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// === helpers thời gian mặc định
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Mặc định THEO NGÀY: hôm nay 14:00 -> mai 12:00
function defaultDayRange() {
    const today = startOfToday();
    const tomorrow = addDays(today, 1);
    return {
        fromDate: ymdLocal(today),
        fromTime: '14:00',
        toDate: ymdLocal(tomorrow),
        toTime: '12:00',
    };
}

// Mặc định THEO GIỜ: bây giờ -> +1 giờ
function defaultHourRange() {
    const now = new Date();
    const plus = new Date(now.getTime() + 60 * 60 * 1000);
    return {
        fromDate: ymdLocal(now),
        fromTime: hm(now),
        toDate: ymdLocal(plus),
        toTime: hm(plus),
    };
}
const STEP_MIN = 30;
function minutesOf(hhmm: string) {
    const [h, m] = (hhmm || "00:00").split(":").map(v => Number(v) || 0);
    return h * 60 + m;
}
function fmtYmd(date: Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
function fmtHm(date: Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(date.getHours())}:${p(date.getMinutes())}`;
}
function toDateObj(d?: string, t?: string) {
    return new Date(`${d || ""}T${(t || "00:00")}:00`);
}
function roundUpHHMM(hhmm: string, step = STEP_MIN) {
    const p = (n: number) => String(n).padStart(2, "0");
    const total = minutesOf(hhmm);
    const rounded = Math.ceil(total / step) * step;
    const H = Math.floor((rounded % (24 * 60)) / 60);
    const M = rounded % 60;
    return `${p(H)}:${p(M)}`;
}
// from không được < now (không làm tròn)
function ensureFromNotPastExact(fd: string, ft: string) {
    const from = toDateObj(fd, ft);
    const now = new Date();
    if (from < now) {
        const d = now;
        return { fromDate: fmtYmd(d), fromTime: fmtHm(d) };
    }
    return { fromDate: fd, fromTime: ft };
}
// to phải >= from + 60' (không làm tròn)
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
export default function BookingCreateToolBarModal({
    open, onClose, onConfirm,
}: {
    open: boolean;
    onClose: () => void;
    // trả về thời gian + danh sách lựa chọn (LP_MA, qty, price)
    onConfirm: (data: {
        ht: 'DAY' | 'HOUR',
        fromDate: string, fromTime: string,
        toDate: string, toTime: string,
        selections: Selection[]
        prefillHT?: number;
        prefillFromISO?: string;
        prefillToISO?: string;
    }) => void;
}) {
    const [ht, setHt] = useState<'DAY' | 'HOUR'>('DAY');
    const [fromDate, setFromDate] = useState<string>('');
    const [toDate, setToDate] = useState<string>('');
    const [fromTime, setFromTime] = useState<string>('14:00');
    const [toTime, setToTime] = useState<string>('12:00');

    const [rows, setRows] = useState<Row[]>([]);
    const [qtyMap, setQtyMap] = useState<Record<number, number>>({}); // LP_MA -> qty

    const toISO = (d: string, t: string) => d ? new Date(`${d}T${t}:00`).toISOString() : '';
    // reset mặc định MỖI LẦN mở modal
    useEffect(() => {
        if (!open) return;
        const today = startOfToday();
        const tomorrow = addDays(today, 1);

        setHt('DAY');               // luôn về Theo ngày
        setFromDate(ymdLocal(today));
        setFromTime('14:00');
        setToDate(ymdLocal(tomorrow));
        setToTime('12:00');

        setQtyMap({});              // reset số lượng chọn
        setRows([]);                // optional: clear bảng tới khi fetch xong
    }, [open]);

    // Mỗi lần đổi HT thì reset mốc thời gian cho đúng kiểu
    useEffect(() => {
        if (!open) return;
        setQtyMap({}); // clear số lượng đã chọn để tránh lệch với availability

        if (ht === 'HOUR') {
            const r = defaultHourRange();
            setFromDate(r.fromDate);
            setFromTime(r.fromTime);
            setToDate(r.toDate);
            setToTime(r.toTime);
        } else {
            const r = defaultDayRange();
            setFromDate(r.fromDate);
            setFromTime(r.fromTime);
            setToDate(r.toDate);
            setToTime(r.toTime);
        }
    }, [ht, open]);

    // load availability khi đổi thời gian / hình thức
    useEffect(() => {
        if (!open) return;
        // const today = startOfToday();
        // const tomorrow = addDays(today, 1);
        // setFromDate(prev => prev || ymdLocal(today));
        // setToDate(prev => prev || ymdLocal(tomorrow));
        // setQtyMap({});
        if (!(fromDate && toDate)) return;
        const fromISO = toISO(fromDate, fromTime);
        const toISOv = toISO(toDate, toTime);
        api.get('/availability/room-types', { params: { from: fromISO, to: toISOv, ht } })
            .then(r => setRows(r.data || []))
            .catch(() => setRows([]));
    }, [open, fromDate, toDate, fromTime, toTime, ht]);

    // nights/hours (chỉ để hiển thị)
    const nights = useMemo(() => {
        if (!(fromDate && toDate)) return 0;
        const s = new Date(fromDate + 'T00:00:00'); const e = new Date(toDate + 'T00:00:00');
        return Math.max(0, Math.round((+e - +s) / 86400000));
    }, [fromDate, toDate]);

    const inc = (lp: number, max: number) =>
        setQtyMap(m => ({ ...m, [lp]: Math.min((m[lp] || 0) + 1, max) }));
    const dec = (lp: number) =>
        setQtyMap(m => ({ ...m, [lp]: Math.max((m[lp] || 0) - 1, 0) }));

    const canConfirm = Object.values(qtyMap).some(v => v > 0) && fromDate && toDate;
    const isHourMode = ht === 'HOUR';
    const fromTimeRoundedOnce = useRef(false);
    useEffect(() => {
        if (!open) return;
        fromTimeRoundedOnce.current = false;
    }, [open, ht]);

    const [hourHTId, setHourHTId] = useState<number | undefined>(undefined);
    
    function formatHoursHM(decHours: number) {
        const totalMin = Math.max(0, Math.round((Number(decHours) || 0) * 60)); // chống NaN & làm tròn phút
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return m ? `${h} giờ ${m} phút` : `${h} giờ`;
    }
    function hoursBetween(dateStr1: string, timeStr1: string, dateStr2: string, timeStr2: string) {
        if (!(dateStr1 && dateStr2)) return 0;
        const d1 = new Date(`${dateStr1}T${timeStr1 || '00:00'}:00`);
        const d2 = new Date(`${dateStr2}T${timeStr2 || '00:00'}:00`);
        return Math.max(0, (d2.getTime() - d1.getTime()) / 36e5); // ms -> hours
    }
    const timeOptsTo = useMemo(
        () => ({
            enableTime: true,
            noCalendar: true,
            dateFormat: 'H:i',
            time_24hr: true,
            minuteIncrement: 30,
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
    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-5xl p-5 sm:p-6">
            <h3 className="mb-3 text-base font-medium">Chọn phòng</h3>

            {/* Dòng chọn hình thức & thời gian */}
            <div className="mb-3 grid grid-cols-[140px_180px_80px_180px_80px_auto] items-center gap-2">
                <select
                    className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    value={ht} onChange={e => setHt(e.target.value as any)}
                >
                    <option value="DAY">Theo ngày</option>
                    <option value="HOUR">Theo giờ</option>
                </select>

                {/* <Flatpickr
                    value={fromDate}
                    options={{ dateFormat: 'Y-m-d' }}
                    onChange={(_selected: Date[], dateStr: string) => setFromDate(dateStr || '')}
                    className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <Flatpickr value={fromTime} options={{ enableTime: true, noCalendar: true, dateFormat: 'H:i', time_24hr: true }}
                    onChange={(_, s) => setFromTime(s || '00:00')} className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800" />

                <Flatpickr
                    value={toDate}
                    options={{ dateFormat: 'Y-m-d' }}
                    onChange={(_selected: Date[], dateStr: string) => setToDate(dateStr || '')}
                    className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <Flatpickr value={toTime} options={{ enableTime: true, noCalendar: true, dateFormat: 'H:i', time_24hr: true }}
                    onChange={(_, s) => setToTime(s || '00:00')} className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800" /> */}

                <Flatpickr
                    value={fromDate}
                    options={{ dateFormat: 'Y-m-d', minDate: 'today' }}
                    onChange={(_d, s) => {
                        setFromDate(s);
                        if (isHourMode) {
                            // đổi ngày from ⇒ đảm bảo to >= from + 1h
                            const fixedTo = ensureToAtLeast1h(s, fromTime, toDate, toTime);
                            if (fixedTo.toDate !== toDate) setToDate(fixedTo.toDate);
                            if (fixedTo.toTime !== toTime) setToTime(fixedTo.toTime);
                        }
                    }}
                    className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <Flatpickr
                    value={fromTime}
                    options={timeOptsFrom}
                    onChange={(_, s) => setFromTime(s || '14:00')}
                    // Chỉ làm tròn hiển thị, KHÔNG tự kéo về NOW ở onOpen
                    onOpen={(_sel, dateStr, inst: any) => {
                        const cur = inst.input?.value || dateStr || "00:00";
                        const rounded = roundUpHHMM(cur, 30);
                        if (rounded !== cur) {
                            inst.setDate(rounded, false, "H:i");
                            setFromTime(rounded);
                        }
                        // reset “làm tròn lần tăng đầu tiên” cho phiên chỉnh này
                        fromTimeRoundedOnce.current = false;
                    }}
                    onValueUpdate={(_sel, s: string) => {
                        // Cho tăng thoải mái; chỉ clamp nếu < hiện tại
                        let next = s || fromTime;

                        if (ht === 'HOUR') {
                            const proposed = toDateObj(fromDate, next);
                            const now = new Date();

                            // Nếu fromDate là hôm nay hoặc quá khứ và giờ chọn < now ⇒ clamp về NOW
                            const fromDate00 = new Date(`${fromDate || ''}T00:00:00`);
                            const today00 = startOfToday();
                            const isTodayOrPast = fromDate && (+fromDate00 <= +today00);

                            if (isTodayOrPast && proposed < now) {
                                next = fmtHm(now);
                            } else {
                                // CHỈ ở lần tăng đầu tiên mới làm tròn lên 30'
                                const prevMin = minutesOf(fromTime);
                                const nextMin = minutesOf(next);
                                if (!fromTimeRoundedOnce.current && nextMin > prevMin) {
                                    next = roundUpHHMM(next, STEP_MIN);
                                    fromTimeRoundedOnce.current = true;
                                }
                            }

                            setFromTime(next);

                            // Ép to >= from + 60'
                            const fixedTo = ensureToAtLeast1h(fromDate, next, toDate, toTime);
                            if (fixedTo.toDate !== toDate) setToDate(fixedTo.toDate);
                            if (fixedTo.toTime !== toTime) setToTime(fixedTo.toTime);
                        } else {
                            // THEO NGÀY: giữ nguyên người dùng chọn
                            setFromTime(next);
                        }
                    }}
                    className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />

                <Flatpickr
                    value={toDate}
                    options={{ dateFormat: 'Y-m-d', minDate: fromDate || 'today' }}
                    onChange={(_d, s) => {
                        setToDate(s);
                        if (isHourMode) {
                            const fixedTo = ensureToAtLeast1h(fromDate, fromTime, s, toTime);
                            if (fixedTo.toDate !== s) setToDate(fixedTo.toDate);
                            if (fixedTo.toTime !== toTime) setToTime(fixedTo.toTime);
                        }
                    }}
                    className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <Flatpickr
                    value={toTime}
                    options={timeOptsTo}
                    onChange={(_, s) => setToTime(s || '12:00')}
                    onOpen={(_sel, _s, inst: any) => {
                        if (!isHourMode) {
                            // vẫn làm tròn hiển thị cho đẹp
                            const cur = inst.input?.value || toTime || "00:00";
                            const rounded = roundUpHHMM(cur, 30);
                            if (rounded !== cur) { inst.setDate(rounded, false, "H:i"); setToTime(rounded); }
                            return;
                        }
                        // theo giờ: ép to >= from + 1h
                        const minTo = new Date(toDateObj(fromDate, fromTime).getTime() + 60 * 60_000);
                        const curStr = inst.input?.value || toTime || "00:00";
                        const cur = toDateObj(toDate, curStr);
                        const safe = cur < minTo ? minTo : cur;
                        const hmSafe = fmtHm(safe);
                        if (hmSafe !== curStr) { inst.setDate(hmSafe, false, "H:i"); setToTime(hmSafe); }
                    }}
                    onValueUpdate={(_sel, s: string) => {
                        if (!isHourMode) { setToTime(s || toTime); return; }
                        const fixed = ensureToAtLeast1h(fromDate, fromTime, toDate, s || toTime);
                        if (fixed.toDate !== toDate) setToDate(fixed.toDate);
                        if (fixed.toTime !== toTime) setToTime(fixed.toTime);
                    }}
                    className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />


                <div className="text-sm text-green-500">
                    {/* {ht === 'DAY' ? `${nights} ngày` : ''} */}
                    {!(ht === 'DAY' )
                        ? formatHoursHM(hoursBetween(fromDate, fromTime, toDate, toTime))
                        : `${nights} đêm`
                    }
                </div>
            </div>

            {/* Bảng hạng phòng */}
            <div className="overflow-auto rounded-xl border dark:border-slate-700">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-white/5">
                        <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                            <th>Hạng phòng</th>
                            <th className="w-28 text-right">Còn trống</th>
                            <th className="w-40 text-center">Số phòng đặt</th>
                            <th className="w-36 text-right">Giá ({ht === 'DAY' ? 'Ngày' : 'Giờ'})</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.LP_MA} className="[&>td]:px-3 [&>td]:py-2 border-t dark:border-slate-700">
                                <td>{r.LP_TEN}</td>
                                <td className="text-right">{r.freeRooms} phòng</td>
                                <td className="text-center">
                                    <div className="inline-flex items-center gap-2">
                                        <button className="rounded border px-2 py-1 dark:border-slate-700" onClick={() => dec(r.LP_MA)}>-</button>
                                        <b>{qtyMap[r.LP_MA] || 0}</b>
                                        <button className="rounded border px-2 py-1 dark:border-slate-700"
                                            onClick={() => inc(r.LP_MA, r.freeRooms)}>+</button>
                                    </div>
                                </td>
                                <td className="text-right">{(r.price || 0).toLocaleString('vi-VN')}</td>
                            </tr>
                        ))}
                        {rows.length === 0 && (
                            <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-500">Chọn thời gian để xem phòng trống…</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
                <Button
                    variant="primary" size="sm" disabled={!canConfirm}
                    onClick={() => {
                        const selections: Selection[] = rows
                            .filter(r => (qtyMap[r.LP_MA] || 0) > 0)
                            .map(r => ({ LP_MA: r.LP_MA, LP_TEN: r.LP_TEN, qty: qtyMap[r.LP_MA] || 0, price: r.price || 0 }));
                        onConfirm({ ht, fromDate, fromTime, toDate, toTime, selections });
                    }}
                >
                    Xác nhận
                </Button>
            </div>
        </Modal>
    );
}
