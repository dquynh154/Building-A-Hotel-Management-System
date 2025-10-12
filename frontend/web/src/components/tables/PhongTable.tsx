import React from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import Badge from "../ui/badge/Badge";
import Button from "../ui/button/Button";

export type PhongRow = {
    PHONG_MA: number;
    PHONG_TEN: string;
    PHONG_TRANGTHAI: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "CHUA_DON";
    LP_MA: number;
    TANG_MA: number;
    LOAI_PHONG?: { LP_MA: number; LP_TEN?: string | null; LP_SONGUOI?: number | null } | null;
    TANG?: { TANG_MA: number; TANG_TEN?: string | null; TANG_SO?: number | null } | null;
};

export const STATUS_LABEL: Record<string, string> = {
    AVAILABLE: 'Trống',
    OCCUPIED: 'Đang ở',
    CHUA_DON: 'Chưa dọn',
    MAINTENANCE: 'Bảo trì',
};

// Map sang màu của Badge (theo BadgeColor của bạn)
export const STATUS_BADGE_COLOR: Record<string,
    'primary' | 'success' | 'error' | 'warning' | 'info' | 'light' | 'dark'
> = {
    AVAILABLE: 'success',
    OCCUPIED: 'warning',
    CHUA_DON: 'error',
    MAINTENANCE: 'dark',
};
export type HT = { HT_MA: number; HT_TEN: string };

function statusToBadgeColor(s: PhongRow["PHONG_TRANGTHAI"]) {
    switch (s) {
        case "AVAILABLE": return "success";
        case "OCCUPIED":
        case "CHUA_DON": return "warning";
        default: return "error";
    }
}

const vnd = (n?: number | string | null) => {
    if (n == null) return "—";
    const num = typeof n === "string" ? Number(n) : n;
    if (Number.isNaN(num)) return "—";
    return new Intl.NumberFormat("vi-VN").format(num);
};

export default function PhongTable({
    rows,
    htList,               // danh sách hình thức thuê
    baseByLP_HT,          // map: LP_MA -> { [HT_MA]: DG_DONGIA }  (giá cơ bản)
    specialByLP_HT,       // map: LP_MA -> { [HT_MA]: DG_DONGIA }  (giá theo TD special đã chọn) (có thể rỗng)
    specialLabel,
    onRowDoubleClick,
    onEdit,
    onDelete,
}: {
    rows: PhongRow[];
    htList: HT[];
    baseByLP_HT: Record<number, Record<number, number | string>>;
    specialByLP_HT?: Record<number, Record<number, number | string>>;
    specialLabel?: string;
    onRowDoubleClick?: (row: PhongRow) => void;
    onEdit?: (row: PhongRow) => void;
    onDelete?: (row: PhongRow) => void;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
                <div className="min-w-[1000px]">
                    <Table>
                        <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                            <TableRow>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Mã phòng
                                </TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Tên phòng
                                </TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Loại phòng
                                </TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Tầng
                                </TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Trạng thái
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
                                <TableCell isHeader className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                                    Thao tác
                                </TableCell>
                            </TableRow>
                        </TableHeader>

                        <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                            {rows.map((r) => (
                                <TableRow key={r.PHONG_MA} onDoubleClick={() => onRowDoubleClick?.(r)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5">
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                        {r.PHONG_MA}
                                    </TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                        {r.PHONG_TEN}
                                    </TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                                        {r.LOAI_PHONG?.LP_TEN ?? `LP#${r.LP_MA}`}
                                    </TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                                        {r.TANG?.TANG_TEN ?? r.TANG?.TANG_SO ?? `Tầng #${r.TANG_MA}`}
                                    </TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                                        <Badge
                                            variant="light"                 // hoặc "solid" tùy style bạn muốn
                                            color={STATUS_BADGE_COLOR[r.PHONG_TRANGTHAI] ?? 'light'}
                                            size="sm"
                                        >
                                            {STATUS_LABEL[r.PHONG_TRANGTHAI] ?? r.PHONG_TRANGTHAI}
                                        </Badge>
                                    </TableCell>


                                    {/* Giá cơ bản theo HT */}
                                    {htList.map(ht => (
                                        <TableCell key={`rb-${r.PHONG_MA}-${ht.HT_MA}`} className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                            {vnd(baseByLP_HT?.[r.LP_MA]?.[ht.HT_MA])}
                                        </TableCell>
                                    ))}

                                    {/* Giá special theo HT */}
                                    {specialByLP_HT && specialLabel && htList.map(ht => (
                                        <TableCell key={`rs-${r.PHONG_MA}-${ht.HT_MA}`} className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">
                                            {vnd(specialByLP_HT?.[r.LP_MA]?.[ht.HT_MA])}
                                        </TableCell>
                                    ))}

                                    <TableCell className="px-5 py-3 text-theme-sm text-right">
                                        <div className="inline-flex items-center gap-2">
                                            <Button size="sm" variant="outline"
                                                // onClick={() => onEdit?.(r)}
                                                onClick={(e?: any) => { e?.stopPropagation?.(); onEdit?.(r); }}
                                            >
                                                Sửa
                                            </Button>

                                            <Button size="sm" variant="danger"
                                                // onClick={() => onDelete?.(r)}
                                                onClick={(e?: any) => { e?.stopPropagation?.(); onDelete?.(r); }}
                                            >
                                                Xóa
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}

                            {rows.length === 0 && (
                                <TableRow>
                                    <td
                                        colSpan={5 + htList.length * (specialByLP_HT && specialLabel ? 2 : 1)+1}
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
