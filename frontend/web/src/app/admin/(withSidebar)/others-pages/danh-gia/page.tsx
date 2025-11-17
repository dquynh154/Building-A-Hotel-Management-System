'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import ComponentCard from '@/components/common/ComponentCard';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import Button from '@/components/ui/button/Button';
import Pagination from '@/components/tables/Pagination';
import DanhGiaTable, { DanhGiaRow } from '@/components/tables/DanhGiaTable';
import PhanHoiModal from '@/components/ui/modal/PhanHoiModal';

type ListResp<T> = { items: T[]; total: number };

const ctrl =
    'rounded-lg border px-3 py-2 text-sm outline-none ' +
    'bg-white text-slate-700 placeholder-slate-400 border-slate-300 focus:ring-2 focus:ring-slate-300 ' +
    'dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700 dark:focus:ring-2 dark:focus:ring-slate-600';

export default function DanhGiaPage() {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<DanhGiaRow[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const take = 20;

    // filter
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<string>('');
    const [stars, setStars] = useState<string>('');
    const [hdong, setHdong] = useState<string>('');

    const load = async (p = page) => {
        setLoading(true);
        try {
            const params: any = { take, skip: (p - 1) * take, withTotal: 1 };
            const s = search.trim();
            if (s) params.search = s;
            if (status) params.status = status;
            if (stars) params.stars = stars;
            if (hdong) params.hdong_ma = hdong;

            const res = await api.get<ListResp<DanhGiaRow>>('/danh-gia', { params });
            const data = res.data || { items: [], total: 0 };
            setRows(data.items || []);
            setTotalPages(Math.max(1, Math.ceil((data.total || 0) / take)));
        } catch (e) {
            setRows([]);
            setTotalPages(1);
            console.error('GET /danh-gia error:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);
    // filter change
    useEffect(() => { setPage(1); load(1); /* eslint-disable-next-line */ }, [status, stars]);
    // debounce search & hdong
    useEffect(() => {
        const h = setTimeout(() => { setPage(1); load(1); }, 300);
        return () => clearTimeout(h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, hdong]);

    // modal phản hồi
    const [openPH, setOpenPH] = useState(false);
    const [rowPH, setRowPH] = useState<DanhGiaRow | null>(null);

    return (
        <div>
            <PageBreadcrumb pageTitle="Đánh giá của khách" />

            <ComponentCard
                title={`Danh sách đánh giá (${rows.length})`}
                headerRight={
                    <>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Tìm theo tiêu đề / nội dung / tên khách…"
                            className={`${ctrl} w-72`}
                        />
                        <input
                            value={hdong}
                            onChange={(e) => setHdong(e.target.value)}
                            placeholder="Hợp đồng #"
                            className={`${ctrl} w-32`}
                        />
                        <select className={ctrl} value={status} onChange={(e) => setStatus(e.target.value)}>
                            <option value="">— Tất cả trạng thái —</option>
                            <option value="PUBLISHED">Đang hiển thị</option>
                            <option value="ARCHIVED">Đã ẩn</option>
                        </select>
                        <select className={ctrl} value={stars} onChange={(e) => setStars(e.target.value)}>
                            <option value="">— Sao —</option>
                            {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n}★</option>)}
                        </select>

                        <Button size="sm" variant="primary" onClick={() => { setPage(1); load(1); }}>
                            Tìm kiếm
                        </Button>
                    </>
                }
            >
                {loading ? (
                    <div className="p-6 text-gray-500">Đang tải dữ liệu…</div>
                ) : (
                    <DanhGiaTable
                        rows={rows}
                        onReply={(r) => { setRowPH(r); setOpenPH(true); }}
                        onToggleStatus={async (r) => {
                            const next = r.DG_TRANG_THAI === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED';
                            await api.patch(`/danh-gia/${r.DG_MA}/status`, { status: next });
                            load(page);
                        }}
                        onView={(r) => { setRowPH(r); setOpenPH(true); }}
                    />
                )}
            </ComponentCard>

            <div className="mt-4 flex justify-end">
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => { setPage(p); load(p); }} />
            </div>

            <PhanHoiModal
                open={openPH}
                review={rowPH}
                onClose={() => setOpenPH(false)}
                onSaved={() => load(page)}
            />
        </div>
    );
}
