'use client';
import { useEffect, useMemo, useState } from 'react';
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

    // load availability khi đổi thời gian / hình thức
    useEffect(() => {
        if (!open) return;
        const today = startOfToday();
        const tomorrow = addDays(today, 1);
        setFromDate(prev => prev || ymdLocal(today));
        setToDate(prev => prev || ymdLocal(tomorrow));
        setQtyMap({});
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

                <Flatpickr
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
                    onChange={(_, s) => setToTime(s || '00:00')} className="h-[40px] rounded-lg border px-2 text-sm dark:border-slate-700 dark:bg-slate-800" />

                <div className="text-sm text-green-500">
                    {ht === 'DAY' ? `${nights} ngày` : ''}
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
