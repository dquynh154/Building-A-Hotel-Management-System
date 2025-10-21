'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import api from '@/lib/api';
import ComponentCard from '@/components/common/ComponentCard';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import Button from '@/components/ui/button/Button';
import { Search, PlusIcon } from '@/icons';
import Pagination from '@/components/tables/Pagination';
import DichVuTable, { DichVuRow } from '@/components/tables/DichVuTable';
import DichVuCreateModal from '@/components/ui/modal/DichVuCreateModal';
import DichVuEditModal from '@/components/ui/modal/DichVuEditModal';

// ------------------------------
// Full rewrite: Trang CRUD Dịch vụ
// - search: req.query.search (BE: searchFields = ['DV_TEN','DV_DONGIA'])
// - filter Loại DV: req.query['eq.LDV_MA'] (BE: eqFields = ['LDV_MA'])
// - tự reload khi đổi Loại DV
// - debounce 300ms cho ô tìm kiếm
// ------------------------------

type ListResp<T> = { items: T[]; total: number };

type LDV = { LDV_MA: number; LDV_TEN: string };

const ctrl =
    'rounded-lg border px-3 py-2 text-sm outline-none ' +
    'bg-white text-slate-700 placeholder-slate-400 border-slate-300 focus:ring-2 focus:ring-slate-300 ' +
    'dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700 dark:focus:ring-2 dark:focus:ring-slate-600';

export default function DichVuPage() {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<DichVuRow[]>([]);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const take = 20;

    // search + filter theo loại dịch vụ
    const [search, setSearch] = useState('');
    const [ldv, setLdv] = useState<number | ''>('');
    const [ldvOptions, setLdvOptions] = useState<LDV[]>([]);

    const [openCreate, setOpenCreate] = useState(false);
    const [openEdit, setOpenEdit] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);

    const loadServices = async (p = page) => {
        setLoading(true);
        try {
            const params: any = { take, skip: (p - 1) * take, withTotal: 1 };
            const q = search.trim();
            if (q) params.search = q;                 // ✅ BE expects `search`
            if (ldv !== '') params['eq.LDV_MA'] = Number(ldv); // ✅ filter by type

            const res = await api.get<ListResp<DichVuRow>>('/dich-vu', { params });
            const data = res.data || { items: [], total: 0 };
            setRows(data.items || []);
            setTotalPages(Math.max(1, Math.ceil((data.total || 0) / take)));
        } catch (e: any) {
            console.error('GET /dich-vu error:', e?.response?.data || e);
            setRows([]);
            setTotalPages(1);
        } finally {
            setLoading(false);
        }
    };

    // nạp danh sách loại dịch vụ cho select filter
    useEffect(() => {
        (async () => {
            try {
                const res = await api.get<LDV[]>('/loai-dich-vu', { params: { take: 200 } });
                setLdvOptions(res.data || []);
            } catch { setLdvOptions([]); }
        })();
    }, []);

    // lần đầu load
    useEffect(() => { loadServices(1); /* eslint-disable-next-line */ }, []);

    // tự load khi đổi Loại DV (về trang 1)
    useEffect(() => {
        setPage(1);
        loadServices(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ldv]);

    // debounce tìm kiếm 300ms
    useEffect(() => {
        const h = setTimeout(() => { setPage(1); loadServices(1); }, 300);
        return () => clearTimeout(h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    return (
        <div>
            <PageBreadcrumb pageTitle="Dịch vụ" />

            <ComponentCard
                title={`Danh sách dịch vụ (${rows.length})`}
                headerRight={
                    <>
                        {/* Từ khóa */}
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Tìm theo tên/đơn giá…"
                            className={`${ctrl} w-56`}
                        />

                        {/* Lọc theo loại dịch vụ (tự load khi đổi) */}
                        <select
                            className={ctrl}
                            value={ldv}
                            onChange={(e) => setLdv(e.target.value ? Number(e.target.value) : '')}
                        >
                            <option value="">— Tất cả loại dịch vụ —</option>
                            {ldvOptions.map((x) => (
                                <option key={x.LDV_MA} value={x.LDV_MA}>{x.LDV_TEN}</option>
                            ))}
                        </select>

                        {/* Nút Tìm kiếm vẫn giữ lại để user chủ động click nếu muốn */}
                        <Button size="sm" variant="primary" endIcon={<Search />} onClick={() => { setPage(1); loadServices(1); }}>
                            Tìm kiếm
                        </Button>

                        <Button size="sm" variant="add" startIcon={<PlusIcon />} onClick={() => setOpenCreate(true)}>
                            Thêm dịch vụ
                        </Button>
                    </>
                }
            >
                {loading ? (
                    <div className="p-6 text-gray-500">Đang tải dữ liệu…</div>
                ) : (
                    <DichVuTable
                        rows={rows}
                        onRowDoubleClick={(r) => { setEditId(r.DV_MA); setOpenEdit(true); }}
                        onEdit={(r) => { setEditId(r.DV_MA); setOpenEdit(true); }}
                        onDelete={async (r) => {
                            if (!confirm(`Xóa dịch vụ "${r.DV_TEN}"?`)) return;
                            await api.delete(`/dich-vu/${r.DV_MA}`);
                            loadServices(page);
                        }}
                    />
                )}
            </ComponentCard>

            <div className="mt-4 flex justify-end">
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => { setPage(p); loadServices(p); }} />
            </div>

            <DichVuCreateModal
                open={openCreate}
                onClose={() => setOpenCreate(false)}
                onCreated={() => { setPage(1); loadServices(1); }}
            />

            <DichVuEditModal
                open={openEdit}
                id={editId}
                onClose={() => setOpenEdit(false)}
                onUpdated={() => loadServices(page)}
            />
        </div>
    );
}
