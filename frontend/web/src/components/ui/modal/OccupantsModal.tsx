'use client';
import { useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';

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
};

export default function OccupantsModal({
    open, onClose, value, onChange, onAddAdultViaCreate,
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

    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-5xl p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-medium">Khách lưu trú</h3>
            </div>

            {/* Thanh điều khiển số lượng */}
            <div className="mb-4 flex flex-wrap items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                    <span>Người lớn</span>
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

                <div className="flex items-center gap-2">
                    <span>Trẻ em</span>
                    <button
                        className="rounded border px-2 py-1 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/10"
                        onClick={removeOneChild}
                        title="Giảm trẻ em"
                    >−</button>
                    <span className="w-8 text-center font-medium">{children.length}</span>
                    <button
                        className="rounded border px-2 py-1 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-white/10"
                        onClick={addOneChild}
                        title="Thêm trẻ em"
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
                            <th className="w-24">Trẻ em</th>
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
                                <td className="text-center">
                                    <input
                                        type="checkbox"
                                        checked={!!row.isChild}
                                        onChange={(e) => {
                                            // Nếu chuyển từ trẻ em -> người lớn: vẫn đảm bảo tổng người lớn >= 1
                                            const makeChild = e.target.checked;
                                            if (!makeChild) {
                                                // chuyển sang người lớn
                                                const nextAdults = value.filter(v => !v.isChild).length + 1;
                                                if (nextAdults < 1) return;
                                            } else {
                                                // chuyển sang trẻ em, nhưng không được làm 0 người lớn:
                                                const currentAdults = value.filter(v => !v.isChild).length;
                                                if (currentAdults <= 1 && !row.isChild) {
                                                    // đang có đúng 1 người lớn và checkbox bị bật → chặn
                                                    return;
                                                }
                                            }
                                            setCell(idx, { isChild: makeChild });
                                        }}
                                    />
                                </td>
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
