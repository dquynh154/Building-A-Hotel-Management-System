'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import ComponentCard from '@/components/common/ComponentCard';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import Button from '@/components/ui/button/Button';
import { Search, PlusIcon } from '@/icons';
import Pagination from '@/components/tables/Pagination';
import NhanVienTable, { NhanVienRow } from '@/components/tables/NhanVienTable';
import NhanVienCreateModal from '@/components/ui/modal/NhanVienCreateModal';
import NhanVienEditModal from '@/components/ui/modal/NhanVienEditModal';

type ListResp<T> = { items: T[]; total: number };

const ctrl =
    'rounded-lg border px-3 py-2 text-sm outline-none ' +
    'bg-white text-slate-700 placeholder-slate-400 border-slate-300 focus:ring-2 focus:ring-slate-300 ' +
    'dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700 dark:focus:ring-2 dark:focus:ring-slate-600';

export default function NhanVienPage() {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<NhanVienRow[]>([]);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const take = 20;
    const ROLE_OPTIONS = ['Admin', 'Lễ Tân'] as const;
    // search + filter
    const [search, setSearch] = useState('');
    const [chucVu, setChucVu] = useState<string | ''>('');
    const [trangThai, setTrangThai] = useState<string | ''>(''); // 'true' | 'false' | ''
    const [roleOptions, setRoleOptions] = useState<string[]>([]);

    const loadNV = async (p = page) => {
        setLoading(true);
        try {
            const params: any = { take, skip: (p - 1) * take, withTotal: 1 };
            const q = search.trim();
            if (q) params.search = q; // BE supports searchFields
            if (chucVu) params['eq.NV_CHUCVU'] = chucVu;
            if (trangThai) params['eq.NV_TRANGTHAI'] = trangThai;

            const res = await api.get<ListResp<NhanVienRow>>('/nhan-vien', { params });
            const data = res.data || { items: [], total: 0 };
            setRows(data.items || []);
            setTotalPages(Math.max(1, Math.ceil((data.total || 0) / take)));

            // build dynamic role options from data if not set
            const uniques = Array.from(new Set((data.items || []).map((x: any) => x.NV_CHUCVU).filter(Boolean)));
            setRoleOptions((prev) => (prev.length ? prev : uniques));
        } catch (e: any) {
            console.error('GET /nhan-vien error:', e?.response?.data || e);
            setRows([]); setTotalPages(1);
        } finally { setLoading(false); }
    };

    useEffect(() => { loadNV(1); /* eslint-disable-next-line */ }, []);

    // auto reload on filters change
    useEffect(() => { setPage(1); loadNV(1); /* eslint-disable-next-line */ }, [chucVu, trangThai]);

    // debounce search
    useEffect(() => {
        const h = setTimeout(() => { setPage(1); loadNV(1); }, 300);
        return () => clearTimeout(h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const [openCreate, setOpenCreate] = useState(false);
    const [openEdit, setOpenEdit] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);

    return (
        <div>
            <PageBreadcrumb pageTitle="Nhân viên" />

            <ComponentCard
                title={`Danh sách nhân viên (${rows.length})`}
                headerRight={
                    <>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Tìm theo họ tên / tài khoản / email / sđt…"
                            className={`${ctrl} w-64`}
                        />

                        <select className={ctrl} value={chucVu} onChange={(e) => setChucVu(e.target.value)}>
                            <option value="">— Tất cả chức vụ —</option>
                            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>

                        <select className={ctrl} value={trangThai} onChange={(e) => setTrangThai(e.target.value)}>
                            <option value="">— Tất cả trạng thái —</option>
                            <option value="true">Hoạt động</option>
                            <option value="false">Ngừng</option>
                        </select>

                        <Button size="sm" variant="primary" endIcon={<Search />} onClick={() => { setPage(1); loadNV(1); }}>
                            Tìm kiếm
                        </Button>

                        <Button size="sm" variant="add" startIcon={<PlusIcon />} onClick={() => setOpenCreate(true)}>
                            Thêm nhân viên
                        </Button>
                    </>
                }
            >
                {loading ? (
                    <div className="p-6 text-gray-500">Đang tải dữ liệu…</div>
                ) : (
                    <NhanVienTable
                        rows={rows}
                        onRowDoubleClick={(r) => { setEditId(r.NV_MA); setOpenEdit(true); }}
                        onEdit={(r) => { setEditId(r.NV_MA); setOpenEdit(true); }}
                        onDelete={async (r) => {
                            if (!confirm(`Xóa nhân viên \"${r.NV_HOTEN}\"?`)) return;
                            await api.delete(`/nhan-vien/${r.NV_MA}`);
                            loadNV(page);
                        }}
                    />
                )}
            </ComponentCard>

            <div className="mt-4 flex justify-end">
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => { setPage(p); loadNV(p); }} />
            </div>

            <NhanVienCreateModal open={openCreate} onClose={() => setOpenCreate(false)} onCreated={() => { setPage(1); loadNV(1); }} />
            <NhanVienEditModal open={openEdit} id={editId} onClose={() => setOpenEdit(false)} onUpdated={() => loadNV(page)} />
        </div>
    );
}
