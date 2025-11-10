'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';
import { PlusIcon, Search } from '@/icons';

export type Occupant = {
    khId?: number | null;
    fullName: string;
    phone?: string;
    idNumber?: string;   // CCCD/CMND
    address?: string;
    isChild: boolean;    // true = trẻ em
};

type OccupantsModalProps = {
    open: boolean;
    onClose: () => void;
    value: Occupant[];
    onChange: (list: Occupant[]) => void;

    /**
     * Được gọi khi user bấm "+ Người lớn".
     * Parent nên mở KhachHangCreateModal, sau khi tạo xong gọi append(newAdult)
     * để modal này thêm 1 dòng người lớn vào bảng.
     */
    onAddAdultViaCreate?: (append: (newAdult: Occupant) => void) => void;
    bookingId?: number;          // id hợp đồng nếu đang mở chi tiết
    editable?: boolean;          // false = đang trong booking mới, true = sửa khách lưu trú
};
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
export default function OccupantsModal({
    open, onClose, value, onChange, onAddAdultViaCreate, bookingId, editable,
}: OccupantsModalProps) {

    // Bảo đảm luôn có ÍT NHẤT 1 người lớn khi mở modal
    useEffect(() => {
        if (!open) return;
        if (!value || value.length === 0 || value.every(v => v.isChild)) {
            onChange([
                { khId: null, fullName: '', phone: '', idNumber: '', address: '', isChild: false },
            ]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const adults = useMemo(() => value.filter(v => !v.isChild), [value]);
    const children = useMemo(() => value.filter(v => v.isChild), [value]);

    const setCell = (idx: number, patch: Partial<Occupant>) => {
        const next = value.slice();
        next[idx] = { ...next[idx], ...patch };
        onChange(next);
    };

    const removeOneAdult = () => {
        const idx = value.map((v, i) => ({ v, i })).filter(x => !x.v.isChild).map(x => x.i).pop();
        if (idx === undefined) return;
        // không cho nhỏ hơn 1 người lớn
        if (adults.length <= 1) return;
        const next = value.slice();
        next.splice(idx, 1);
        onChange(next);
    };

    const removeOneChild = () => {
        const idx = value.map((v, i) => ({ v, i })).filter(x => x.v.isChild).map(x => x.i).pop();
        if (idx === undefined) return;
        const next = value.slice();
        next.splice(idx, 1);
        onChange(next);
    };

    const addOneChild = () => {
        onChange([
            ...value,
            { khId: null, fullName: '', phone: '', idNumber: '', address: '', isChild: true },
        ]);
    };

    const addOneAdultViaCreate = () => {
        if (!onAddAdultViaCreate) {
            // fallback: thêm 1 dòng người lớn trống nếu không truyền callback
            onChange([
                ...value,
                { khId: null, fullName: '', phone: '', idNumber: '', address: '', isChild: false },
            ]);
            return;
        }
        onAddAdultViaCreate((newAdult) => {
            onChange([...value, { ...newAdult, isChild: false }]);
        });
    };
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

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-5xl p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-medium">Khách lưu trú</h3>
            </div>

            {/* Thanh điều khiển số lượng */}
            <div className="mb-4 flex flex-wrap items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
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
                                onClick={async () => {
                                    if (!editable || !bookingId || !kh?.value) return; // chỉ cho phép khi đang ở chi-tiet.page
                                    try {
                                        // lấy chi tiết khách
                                        const r = await api.get(`/khach-hang/${kh.value}`);
                                        const rec = r.data;
                                        await api.post(`/bookings/${bookingId}/guests`, {
                                            guests: [{ KH_MA: rec.KH_MA, LA_KHACH_CHINH: false }],
                                            append: true,
                                        });
                                        // cập nhật UI tại chỗ
                                        const newGuest = {
                                            khId: rec.KH_MA,
                                            fullName: rec.KH_HOTEN,
                                            phone: rec.KH_SDT,
                                            idNumber: rec.KH_CCCD,
                                            address: rec.KH_DIACHI,
                                            isChild: false,
                                        };
                                        onChange([...value, newGuest]);
                                        setKh(null); // reset search box
                                    } catch (e: any) {
                                        alert(e?.response?.data?.message || 'Không thể thêm khách lưu trú.');
                                    }
                                }}

                            >
                                <PlusIcon className="size-4" />
                            </button>
                        }
                    />
                    <span>Khách hàng</span>
                    <button
                        className="rounded border px-2 py-1 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/10"
                        onClick={removeOneAdult}
                        title="Giảm người lớn"
                    >−</button>
                    <span className="w-8 text-center font-medium">{Math.max(1, adults.length)}</span>
                    <button
                        className="rounded border px-2 py-1 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/10"
                        onClick={addOneAdultViaCreate}
                        title="Thêm người lớn (mở tạo khách)"
                    >＋</button>
                </div>


            </div>

            {/* Bảng occupants */}
            <div className="overflow-auto rounded-xl border dark:border-slate-700">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-white/5">
                        <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                            <th>Họ và tên</th>
                            <th>Số điện thoại</th>
                            <th>CCCD</th>
                            <th>Địa chỉ</th>
                            {/* <th className="w-24">Trẻ em</th> */}
                            {editable && <th className="w-20 text-center">Xóa</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {value.map((row, idx) => (
                            <tr key={idx} className="[&>td]:px-3 [&>td]:py-2 border-t dark:border-slate-700">
                                <td>
                                    <input
                                        className="w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
                                        value={row.fullName || ''}
                                        onChange={(e) => setCell(idx, { fullName: e.target.value })}
                                        placeholder="Họ và tên"
                                    />
                                </td>
                                <td>
                                    <input
                                        className="w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
                                        value={row.phone || ''}
                                        onChange={(e) => setCell(idx, { phone: e.target.value })}
                                        placeholder="SĐT"
                                    />
                                </td>
                                <td>
                                    <input
                                        className="w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
                                        value={row.idNumber || ''}
                                        onChange={(e) => setCell(idx, { idNumber: e.target.value })}
                                        placeholder="CCCD/CMND"
                                    />
                                </td>
                                <td>
                                    <input
                                        className="w-full rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
                                        value={row.address || ''}
                                        onChange={(e) => setCell(idx, { address: e.target.value })}
                                        placeholder="Địa chỉ"
                                    />
                                </td>

                                {editable && (
                                    <td className="text-center">
                                        <button
                                            className="rounded border border-red-400 px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                                            title="Xóa khách này"
                                            onClick={async () => {
                                                if (!bookingId || !row.khId) return;
                                                if (!confirm(`Xóa ${row.fullName}?`)) return;
                                                try {
                                                    await api.delete(`/bookings/${bookingId}/guests/${row.khId}`);
                                                    const next = value.filter((_, i) => i !== idx);
                                                    onChange(next);
                                                } catch (e: any) {
                                                    alert(e?.response?.data?.message || 'Không thể xóa khách lưu trú.');
                                                }
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Đóng</Button>
            </div>
        </Modal>
    );
}
