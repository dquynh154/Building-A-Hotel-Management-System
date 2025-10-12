import React from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import Button from "../ui/button/Button";

export type NhanVienRow = {
    NV_MA: number;
    NV_HOTEN: string;
    NV_EMAIL?: string | null;
    NV_SDT?: string | null;
    NV_NGAYSINH?: string | null; // ISO
    NV_GIOITINH?: string | null; // 'NAM' | 'NU' | 'KHAC' | null
    NV_CHUCVU?: string | null;
    NV_TAIKHOAN: string;
    NV_TRANGTHAI?: string | null;
    NV_NGAYTAO?: string | null;
    NV_NGAYSUA?: string | null;
};

const GENDER_LABEL: Record<string, string> = {
    NAM: 'Nam',
    NU: 'Nữ',
    KHAC: 'Khác',
};

const dateVi = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('vi-VN');
};
function StatusBadge({ s }: { s: NhanVienRow['NV_TRANGTHAI'] }) {
    const label = s === 'true' ? 'Đang hoạt động' : 'Ngừng hoạt động';
    const cls =
        s === 'true'
            ? 'bg-green-100 text-green-700 border-green-200'
            : 'bg-amber-100 text-amber-700 border-amber-200';
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

export default function NhanVienTable({
    rows,
    onRowDoubleClick,
    onEdit,
    onDelete,
}: {
    rows: NhanVienRow[];
    onRowDoubleClick?: (row: NhanVienRow) => void;
    onEdit?: (row: NhanVienRow) => void;
    onDelete?: (row: NhanVienRow) => void;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
            <div className="max-w-full overflow-x-auto">
                <div className="min-w-[1000px]">
                    <Table>
                        <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                            <TableRow>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Mã</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Họ tên</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Tài khoản</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Chức vụ</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Email</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">SĐT</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Giới tính</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Ngày sinh</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">Trạng thái</TableCell>
                                <TableCell isHeader className="px-5 py-3 text-end   text-theme-xs font-medium text-gray-500 dark:text-gray-400">Thao tác</TableCell>
                            </TableRow>
                        </TableHeader>

                        <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                            {rows.map((r) => (
                                <TableRow key={r.NV_MA} onDoubleClick={() => onRowDoubleClick?.(r)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5">
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{r.NV_MA}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{r.NV_HOTEN}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{r.NV_TAIKHOAN}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{r.NV_CHUCVU || '—'}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{r.NV_EMAIL || '—'}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{r.NV_SDT || '—'}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90"> {r.NV_GIOITINH ? (GENDER_LABEL[String(r.NV_GIOITINH).toUpperCase()] ?? '—') : '—'}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-700 dark:text-white/90">{dateVi(r.NV_NGAYSINH)}</TableCell>
                                    <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                                        <StatusBadge s={r.NV_TRANGTHAI} />
                                    </TableCell>
                                    {/* <TableCell className="px-5 py-3 text-theme-sm text-right">
                                        <div className="inline-flex items-center gap-2">
                                            <button className="rounded border px-3 py-1 text-sm" onClick={() => onEdit?.(r)}>Sửa</button>
                                            <button className="rounded border px-3 py-1 text-sm text-red-600" onClick={() => onDelete?.(r)}>Xóa</button>
                                        </div>
                                    </TableCell> */}
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
                                    <td colSpan={10} className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">Chưa có dữ liệu nhân viên</td>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}
