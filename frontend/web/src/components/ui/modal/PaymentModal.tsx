// components/ui/modal/PaymentModal.tsx
'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';

export type PaymentMethod = 'cash' | 'card' | 'transfer';
export type PaymentPayload = {
    staffId?: string | number;
    discount: number;
    extra: number;
    method: PaymentMethod;
    inputPaid: number;
    note?: string;
};

export default function PaymentModal({
    open,
    onClose,
    total,
    defaultMethod = 'cash',
    details,
    currentStaff,
    onSubmit,
    deposit = 0,
    paid = 0,
    due = 0,
}: {
    open: boolean;
    onClose: () => void;
    total: number;
    // staffList?: { value: string | number; label: string }[];
    defaultMethod?: PaymentMethod;
    details?: React.ReactNode;
    currentStaff: { id: string | number; name: string };
    onSubmit: (p: PaymentPayload) => Promise<void> | void;
    deposit?: number;
    paid?: number;
    due?: number;
}) {
    const vnd = (n: number) => (Number(n) || 0).toLocaleString('vi-VN');

    // const [staff, setStaff] = useState<string | number | undefined>(staffList[0]?.value);
    const [discount, setDiscount] = useState(0);
    const [extra, setExtra] = useState(0);
    const [method, setMethod] = useState<PaymentMethod>(defaultMethod);
    const needPay = Math.max(
        0,
        Number(total) - Number(deposit || 0) - Number(discount || 0) + Number(extra || 0) - Number(paid || 0)
    );

    const [inputPaid, setInputPaid] = useState(0);
    const [note, setNote] = useState('');


    const quicks = [needPay, needPay + 10000, needPay + 50000, needPay + 100000];
    // format số -> "500.000"
    const fmtVN = (n: number | string) =>
        (Number(n) || 0).toLocaleString('vi-VN');

    // parse từ "500.000" -> 500000
    const parseVN = (s: string) =>
        Number(String(s).replace(/[^\d]/g, '') || 0);

    // Hàm onChange cho input tiền tệ (giữ state dạng số, hiển thị dạng có dấu)
    const useCurrencyInput = (
        value: number,
        setValue: (n: number) => void,
    ) => ({
        display: fmtVN(value),
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            setValue(parseVN(e.target.value));
        },
        onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
            // chuẩn hóa lại view khi blur
            e.currentTarget.value = fmtVN(parseVN(e.currentTarget.value));
        },
    });
    const discountBind = useCurrencyInput(discount, (n) => setDiscount(Math.max(0, n)));
    const extraBind = useCurrencyInput(extra, (n) => setExtra(Math.max(0, n)));
    const paidBind = useCurrencyInput(inputPaid, (n) => setInputPaid(Math.max(0, n)));
    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            variant="right"
            hasBackdrop={true}
            backdropClassName="bg-transparent"   // nền trong suốt, vẫn chặn click ngoài
            className="p-0 w-full h-full"        // để mình tự set grid bên trong
            showCloseButton
        >
            {/* GRID 2 CỘT: Trái = Chi tiết, Phải = Panel thanh toán */}
            <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
                {/* LEFT: Booking details (scroll riêng) */}
                <div className="hidden lg:block h-full overflow-y-auto p-4 pr-2">
                    {details /* 👈 render slot từ trang cha */}
                </div>

                {/* RIGHT: Payment panel (scroll riêng) */}
                <div className="h-full overflow-y-auto border-l p-5 sm:p-6 dark:border-slate-800">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-base font-medium">Thanh toán</h3>
                    </div>

                    <div className="space-y-3">
                        {/* Nhân viên + thời gian */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs text-gray-500">Nhân viên</label>
                                <div className="h-10 flex items-center rounded-lg border px-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                                    {currentStaff?.name || '—'}
                                </div>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-gray-500">Thời gian</label>
                                <input
                                    className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                    value={new Date().toLocaleString('vi-VN')}
                                    readOnly
                                />
                            </div>
                        </div>

                        {/* Tổng tiền & giảm & thu khác – style giống hình 1 */}
                        <div className="rounded-lg border p-3 dark:border-slate-700">
                            {/* Tổng tiền hàng */}
                            <div className="mb-3 flex items-center justify-between text-sm">
                                <div className="inline-flex items-center gap-2 text-gray-600">
                                    <span>Tổng tiền</span>
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-200 text-[10px] text-gray-600">i</span>
                                </div>
                                <div className="font-semibold">{vnd(total)}</div>
                            </div>

                            {/* Tiền cọc */}
                            {Number(deposit) > 0 && (
                                <div className="mb-1 flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Tiền cọc</span>
                                    <span className="font-medium text-gray-700">- {vnd(deposit)}</span>
                                </div>
                            )}

                            {/* Khách đã trả (từ các lần trước) */}
                            {Number(paid) > 0 && (
                                <div className="mb-1 flex items-center justify-between text-sm">
                                    <span className="text-gray-600">Khách đã trả</span>
                                    <span className="font-medium text-gray-700">- {vnd(paid)}</span>
                                </div>
                            )}

                            {/* Giảm giá / Thu khác (kiểu gạch chân) */}
                            <div className="mb-2 grid grid-cols-2 gap-6">
                                <div>
                                    <div className="mb-1 text-xs text-gray-500">Giảm giá</div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            className="w-full bg-transparent px-0 py-1 text-right text-sm outline-none border-0 border-b border-gray-300 focus:border-gray-500 dark:border-slate-600 dark:focus:border-slate-400"
                                            value={discountBind.display}
                                            onChange={discountBind.onChange}
                                            onBlur={discountBind.onBlur}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="mb-1 text-xs text-gray-500">Thu khác</div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            className="w-full bg-transparent px-0 py-1 text-right text-sm outline-none border-0 border-b border-gray-300 focus:border-gray-500 dark:border-slate-600 dark:focus:border-slate-400"
                                            value={extraBind.display}
                                            onChange={extraBind.onChange}
                                            onBlur={extraBind.onBlur}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Khách cần trả (màu xanh) */}
                            <div className="my-3 flex items-center justify-between">
                                <span className="text-sm">Khách cần trả</span>
                                <div className="text-lg font-semibold text-emerald-600">{vnd(needPay)}</div>
                            </div>

                            {/* Phương thức thanh toán */}
                            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                                {[
                                    { k: 'cash', label: 'Tiền mặt' },
                                    { k: 'card', label: 'Thẻ' },
                                    { k: 'transfer', label: 'Chuyển khoản' },
                                ].map(m => (
                                    <label key={m.k} className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 dark:border-slate-700">
                                        <input
                                            type="radio"
                                            name="paymethod"
                                            checked={method === (m.k as PaymentMethod)}
                                            onChange={() => setMethod(m.k as PaymentMethod)}
                                        />
                                        {m.label}
                                    </label>
                                ))}
                            </div>



                            {/* Khách thanh toán (F8) kiểu gạch chân xanh + icon thẻ */}
                            <div>
                                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                                    <span>Khách thanh toán</span>

                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="pay-input"
                                        type="text"
                                        inputMode="numeric"
                                        className="w-full bg-transparent px-0 py-1 text-right text-base outline-none border-0 border-b-2 border-emerald-500 focus:border-emerald-600 dark:border-emerald-500"
                                        value={paidBind.display}
                                        onChange={paidBind.onChange}
                                        onBlur={paidBind.onBlur}
                                    />
                                </div>
                            </div>
                        </div>


                        {/* Ghi chú */}
                        <div>
                            <label className="mb-1 block text-xs text-gray-500">Ghi chú đơn hàng…</label>
                            <textarea
                                className="w-full rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                rows={2}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-4 flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={onClose}>Đóng</Button>
                        <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onSubmit?.({ staffId: currentStaff.id, discount, extra, method, inputPaid, note })}
                        >
                            Xác nhận thanh toán
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
