'use client';
import { useState } from "react";
import Button from '@/components/ui/button/Button';
import DatePicker from '@/components/form/date-picker'; // bạn đã có
import { Bang, Lich, ListPhong, PlusIcon, Search } from '@/icons';
import BookingCreateModal from '../ui/modal/BookingCreateModal';
import BookingCreateToolBarModal from '@/components/ui/modal/BookingCreateToolBarModal';
export type ViewMode = 'board' | 'list' | 'timeline';
export type FilterState = {
    statuses: { prebook: boolean; inuse: boolean; checkout: boolean; available: boolean };
    search: string;
    range: { from: Date | null; to: Date | null };
};

export default function BookingToolbar({
    mode, onModeChange, filters, onFiltersChange, onSearch, onOpenBulk,onBooked
}: {
    mode: ViewMode;
    onModeChange: (m: ViewMode) => void;
    filters: FilterState;
    onFiltersChange: (f: FilterState) => void;
    onSearch: () => void;
    // onCreated: () => void;
    onOpenBulk: () => void;
    onBooked: () => void;
}) {
    const toggle = (k: keyof FilterState['statuses']) =>
        onFiltersChange({ ...filters, statuses: { ...filters.statuses, [k]: !filters.statuses[k] } });
    const [openCreate, setOpenCreate] = useState(false);
    const [openTool, setOpenTool] = useState(false);
    const [prefillForCreate, setPrefillForCreate] = useState<null | {
        ht: 'DAY' | 'HOUR',
        fromDate: string, fromTime: string,
        toDate: string, toTime: string,
        selections: { LP_MA: number; LP_TEN: string; qty: number; price: number }[]
    }>(null);

    const [createSeed, setCreateSeed] = useState(0);

    return (
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
                <Button size="sm" startIcon={<Bang />} variant={mode === 'board' ? 'primary' : 'outline'} onClick={() => onModeChange('board')}> </Button>
                <Button size="sm" startIcon={<ListPhong />} variant={mode === 'list' ? 'primary' : 'outline'} onClick={() => onModeChange('list')}> </Button>
                <Button size="sm" startIcon={<Lich />} variant={mode === 'timeline' ? 'primary' : 'outline'} onClick={() => onModeChange('timeline')}> </Button>
            </div>
            {/* Chú thích trạng thái phòng */}
            <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-orange-400 border border-orange-500"></span>
                    <span className="text-slate-600 dark:text-slate-300">Sắp đến</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-green-500 border border-green-600"></span>
                    <span className="text-slate-600 dark:text-slate-300">Đang sử dụng</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-yellow-400 border border-yellow-500"></span>
                    <span className="text-slate-600 dark:text-slate-300">Chưa dọn</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-gray-300 border border-gray-400"></span>
                    <span className="text-slate-600 dark:text-slate-300">Phòng trống</span>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                    <DatePicker
                        id="dp-from"
                        label=""
                        placeholder="Từ ngày"
                        onChange={(dates: any) => onFiltersChange({ ...filters, range: { ...filters.range, from: dates?.[0] || dates || null } })}
                    />
                    <DatePicker
                        id="dp-to"
                        label=""
                        placeholder="Đến ngày"
                        onChange={(dates: any) => onFiltersChange({ ...filters, range: { ...filters.range, to: dates?.[0] || dates || null } })}
                    />
                </div>   

                <input
                    value={filters.search}
                    onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
                    placeholder="Tìm khách / phòng / mã HĐ…"
                    className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
                <Button size="sm" variant="primary" endIcon={<Search />} onClick={onSearch}>Tìm</Button>
                <Button size="sm" variant="add" startIcon={<PlusIcon />} onClick={() => setOpenTool(true)}>Đặt phòng</Button>
                <BookingCreateToolBarModal
                    open={openTool}
                    onClose={() => setOpenTool(false)}
                    onConfirm={(data) => {
                        setOpenTool(false);
                        setPrefillForCreate(data);     // lưu tạm payload
                        setCreateSeed(Date.now());
                        setOpenCreate(true);           // mở BookingCreateModal ngay sau đó
                    }}
                />
                <BookingCreateModal
                    key={createSeed}
                    open={openCreate}
                    onClose={() => { setOpenCreate(false); setPrefillForCreate(null); }}
                    onCreated={() => { setOpenCreate(false); setPrefillForCreate(null); onBooked(); }}
                    initialMulti={prefillForCreate ?? undefined}
                />
            </div>
        </div>
    );
}
