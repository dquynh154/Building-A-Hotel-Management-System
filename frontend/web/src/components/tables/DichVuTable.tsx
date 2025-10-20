import React from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Button from "@/components/ui/button/Button";

export type DichVuRow = {
    DV_MA: number;
    LDV_MA: number;
    DV_TEN: string;
    DV_DONGIA: string; // decimal nên nhận/gửi string
    LOAI_DICH_VU?: { LDV_MA: number; LDV_TEN: string } | null;
};

const vnd = (x: string | number | null | undefined) => {
    if (x == null || x === "") return "—";
    const n = Number(x);
    if (Number.isNaN(n)) return String(x);
    return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);
};

export default function DichVuTable({
    rows,
    onRowDoubleClick,
    onEdit,
    onDelete,
}: {
    rows: DichVuRow[];
    onRowDoubleClick?: (row: DichVuRow) => void;
    onEdit?: (row: DichVuRow) => void;
    onDelete?: (row: DichVuRow) => void;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
                <div className="min-w-[900px]">
                    <Table>
                        <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                            <TableRow>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Mã DV</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Tên dịch vụ</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Loại dịch vụ</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Đơn giá</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-medium   text-theme-xs font-medium text-gray-500 dark:text-gray-400">Thao tác</TableCell>
                            </TableRow>
                        </TableHeader>

                        <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                            {rows.map((r) => (
                                <TableRow key={r.DV_MA} onDoubleClick={() => onRowDoubleClick?.(r)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5">
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{r.DV_MA}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{r.DV_TEN}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                                        {r.LOAI_DICH_VU?.LDV_TEN ?? `Loại #${r.LDV_MA}`}
                                    </TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90 whitespace-nowrap">
                                        {vnd(r.DV_DONGIA)}
                                    </TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-right">
                                        <div className="inline-flex items-center gap-2">
                                            <Button size="sm" variant="outline" onClick={() => onEdit?.(r)}>Sửa</Button>
                                            <Button size="sm" variant="danger" onClick={() => onDelete?.(r)}>Xóa</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}

                            {rows.length === 0 && (
                                <TableRow>
                                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">
                                        Chưa có dữ liệu dịch vụ
                                    </td>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
