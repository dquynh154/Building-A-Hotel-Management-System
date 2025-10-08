import React, { useMemo } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import Badge from "../ui/badge/Badge";

export type LoaiPhongRow = {
    LP_MA: number;
    LP_TEN: string;
    LP_SONGUOI: number;
};

export type HT = { HT_MA: number; HT_TEN: string };


const vnd = (n?: number | string | null) => {
    if (n == null) return "—";
    const num = typeof n === "string" ? Number(n) : n;
    if (Number.isNaN(num)) return "—";
    return new Intl.NumberFormat("vi-VN").format(num);
};


export default function LoaiPhongTable({
    rows,
    htList,               // danh sách hình thức thuê
    baseByLP_HT,          // map: LP_MA -> { [HT_MA]: DG_DONGIA }  (giá cơ bản)
    specialByLP_HT,       // map: LP_MA -> { [HT_MA]: DG_DONGIA }  (giá theo TD special đã chọn) (có thể rỗng)
    specialLabel,         // nhãn hiển thị của TD special (vd: "Noel 2025")
    countByLP = {},
    onRowDoubleClick,
}: {
    rows: LoaiPhongRow[];
    htList: HT[];
    baseByLP_HT: Record<number, Record<number, number | string>>;
    specialByLP_HT?: Record<number, Record<number, number | string>>;
    specialLabel?: string;
    countByLP?: Record<number, number>;
    onRowDoubleClick?: (row: LoaiPhongRow) => void; 
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
                <div className="min-w-[1000px]">
                    <Table>
                        <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                            <TableRow>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Mã loại phòng
                                </TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Tên loại phòng
                                </TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Số lượng phòng
                                </TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Sức chứa
                                </TableCell>
                                {/* Cột giá cơ bản cho từng HT */}
                                {htList.map(ht => (
                                    <TableCell key={`base-${ht.HT_MA}`} isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                        Giá cơ bản — {ht.HT_TEN}
                                    </TableCell>
                                ))}

                                {/* Nếu có chọn TD special → thêm cột giá special cho từng HT */}
                                {specialByLP_HT && specialLabel && htList.map(ht => (
                                    <TableCell key={`sp-${ht.HT_MA}`} isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                        Giá {specialLabel} — {ht.HT_TEN}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHeader>

                        <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                            {rows.map((r) => (
                                <TableRow
                                    key={r.LP_MA}
                                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                                    onDoubleClick={() => onRowDoubleClick?.(r)}
                                >
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                        {r.LP_MA}
                                    </TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                        {r.LP_TEN}
                                    </TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                        {countByLP[r.LP_MA] ?? 0} 
                                    </TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                        {r.LP_SONGUOI}
                                    </TableCell>
                                    {/* Giá cơ bản theo HT */}
                                    {htList.map(ht => (
                                        <TableCell key={`rb-${r.LP_MA}-${ht.HT_MA}`} className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                            {vnd(baseByLP_HT?.[r.LP_MA]?.[ht.HT_MA])}
                                        </TableCell>
                                    ))}

                                    {/* Giá special theo HT */}
                                    {specialByLP_HT && specialLabel && htList.map(ht => (
                                        <TableCell key={`rs-${r.LP_MA}-${ht.HT_MA}`} className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                            {vnd(specialByLP_HT?.[r.LP_MA]?.[ht.HT_MA])}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}

                            {rows.length === 0 && (
                                <TableRow>
                                    <td
                                        colSpan={5 + htList.length * (specialByLP_HT && specialLabel ? 2 : 1)}
                                        className="px-5 py-8 text-center text-gray-500 dark:text-gray-400"
                                    >
                                        Chưa có dữ liệu phòng
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
