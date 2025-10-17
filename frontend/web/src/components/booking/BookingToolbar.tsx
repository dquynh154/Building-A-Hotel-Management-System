'use client';
import { useState } from "react";
import Button from '@/components/ui/button/Button';
import DatePicker from '@/components/form/date-picker'; // bạn đã có
import { Bang, Lich, ListPhong, PlusIcon, Search } from '@/icons';
import BookingCreateModal from '../ui/modal/BookingCreateModal';

export type ViewMode = 'board' | 'list' | 'timeline';
export type FilterState = {
    statuses: { prebook: boolean; inuse: boolean; checkout: boolean; available: boolean };
    search: string;
    range: { from: Date | null; to: Date | null };
};

export default function BookingToolbar({
    mode, onModeChange, filters, onFiltersChange, onSearch, onCreated,
}: {
    mode: ViewMode;
    onModeChange: (m: ViewMode) => void;
    filters: FilterState;
    onFiltersChange: (f: FilterState) => void;
    onSearch: () => void;
    onCreated: () => void;
}) {
    const toggle = (k: keyof FilterState['statuses']) =>
        onFiltersChange({ ...filters, statuses: { ...filters.statuses, [k]: !filters.statuses[k] } });
    const [openCreate, setOpenCreate] = useState(false);
    return (
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
                <Button size="sm" startIcon={<Bang />} variant={mode === 'board' ? 'primary' : 'outline'} onClick={() => onModeChange('board')}> </Button>
                <Button size="sm" startIcon={<ListPhong />} variant={mode === 'list' ? 'primary' : 'outline'} onClick={() => onModeChange('list')}> </Button>
                <Button size="sm" startIcon={<Lich />} variant={mode === 'timeline' ? 'primary' : 'outline'} onClick={() => onModeChange('timeline')}> </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {/* <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filters.statuses.prebook} onChange={() => toggle('prebook')} /> Đặt trước
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filters.statuses.inuse} onChange={() => toggle('inuse')} /> Đang sử dụng
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filters.statuses.checkout} onChange={() => toggle('checkout')} /> Đã trả
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={filters.statuses.available} onChange={() => toggle('available')} /> Phòng trống
                </label> */}

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
                <Button size="sm" variant="add" startIcon={<PlusIcon />} onClick={() => setOpenCreate(true)}>Đặt phòng</Button>
                <BookingCreateModal
                    open={openCreate}
                    onClose={() => setOpenCreate(false)}
                    onCreated={() => { setOpenCreate(false); onCreated?.(); }}
                />
            </div>
        </div>
    );
}
