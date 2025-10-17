import { BookingLite, Phong } from '@/app/admin/others-pages/dat-phong/page';
import { FilterState } from './BookingToolbar';

export default function TimelineView({
    rooms, bookings, filters
}: { rooms: Phong[]; bookings: BookingLite[]; filters: FilterState }) {

    // khung thời gian: nếu chưa chọn thì lấy tuần hiện tại
    const start = filters.range.from ?? startOfWeek(new Date());
    const end = filters.range.to ?? addDays(start, 7);
    const days = eachDay(start, end);

    const rows = rooms
        .sort((a, b) => (a.TANG_MA - b.TANG_MA) || a.PHONG_TEN.localeCompare(b.PHONG_TEN));

    return (
        <div className="overflow-auto">
            <div className="min-w-[900px]">
                {/* header */}
                <div className="sticky top-0 z-10 grid grid-cols-[200px_1fr] bg-white dark:bg-slate-900">
                    <div className="border-b p-2 text-sm font-medium">Phòng</div>
                    <div className="grid grid-cols-7">
                        {days.map((d, i) => (
                            <div key={i} className="border-b p-2 text-center text-sm">
                                {d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* body */}
                {rows.map(r => (
                    <div key={r.PHONG_MA} className="grid grid-cols-[200px_1fr]">
                        <div className="border-b p-2 text-sm">{r.PHONG_TEN}</div>
                        <div className="relative border-b">
                            {/* cột ngày */}
                            <div className="grid grid-cols-7 h-14">
                                {days.map((_, i) => (<div key={i} className="border-l last:border-r" />))}
                            </div>

                            {/* các block đặt phòng của phòng này */}
                            {(bookings.filter(b => b.PHONG_MA === r.PHONG_MA)).map(b => {
                                const left = pct(start, end, new Date(b.TU_LUC));
                                const right = pct(start, end, new Date(b.DEN_LUC));
                                return (
                                    <div key={`${b.HDONG_MA}-${b.TU_LUC}`} className="absolute top-1 h-10 rounded-md bg-emerald-500/80 px-2 text-xs text-white"
                                        style={{ left: `${left}%`, width: `${Math.max(3, right - left)}%` }}>
                                        <div className="truncate">{b.KH_TEN || 'Khách lẻ'}</div>
                                        <div className="opacity-80">{sh(b.TU_LUC)}–{sh(b.DEN_LUC)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const startOfWeek = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const eachDay = (s: Date, e: Date) => { const arr: Date[] = []; let x = new Date(s); while (x < e) { arr.push(new Date(x)); x.setDate(x.getDate() + 1); } return arr; };
const pct = (s: Date, e: Date, t: Date) => Math.min(100, Math.max(0, ((t.getTime() - s.getTime()) / (e.getTime() - s.getTime())) * 100));
const sh = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
