'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import PhongTable, { PhongRow } from '@/components/tables/PhongTable';
import LoaiPhongTable, { LoaiPhongRow } from '@/components/tables/LoaiPhongTable';
import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Button from "@/components/ui/button/Button";
import { Search, PlusIcon } from "@/icons";
import Pagination from "@/components/tables/Pagination";  // thêm import Pagination
import PhongCreateModal from "@/components/ui/modal/PhongCreateModal";
import LoaiPhongCreateModal from '@/components/ui/modal/LoaiPhongCreateModal';
import LoaiPhongEditModal from "@/components/ui/modal/LoaiPhongEditModal";
import PhongEditModal from "@/components/ui/modal/PhongEditModal";

type HT = { HT_MA: number; HT_TEN: string };
type TD = { TD_MA: number; TD_TEN: string; TD_TRANGTHAI: boolean };
type DonGiaRow = { LP_MA: number; HT_MA: number; TD_MA: number; DG_DONGIA: string | number };

type Status = "ALL" | "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "CHUA_DON";

// ⚠️ Chỉ định TD_MA của "cơ bản" (THOI_DIEM_BASE).
// Bạn set cứng ở FE, hoặc backend cung cấp qua API. Tạm thời hard-code:
const TD_BASE_MA = 1; // đổi số này theo dữ liệu thực tế

export default function PhongPage() {
    const [pageRooms, setPageRooms] = useState(1);
    const [totalPagesRooms, setTotalPagesRooms] = useState(1);

    const [pageTypes, setPageTypes] = useState(1);
    const [totalPagesTypes, setTotalPagesTypes] = useState(1);
    const take = 20;
    const skipRooms = (pageRooms - 1) * take;
    const skipTypes = (pageTypes - 1) * take;


    const [activeTab, setActiveTab] = useState<'types' | 'rooms'>('types');
    const [rooms, setRooms] = useState<PhongRow[]>([]);
    const [typerooms, setTypeRooms] = useState<LoaiPhongRow[]>([]);
    const [htList, setHtList] = useState<HT[]>([]);
    const [tdSpecialList, setTdSpecialList] = useState<TD[]>([]);
    const [tdSpecial, setTdSpecial] = useState<number | ''>(''); // chọn 1 TD special

    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<Status>('ALL');

    // map giá: LP_MA -> { HT_MA: DG_DONGIA }
    const [baseByLP_HT, setBaseByLP_HT] = useState<Record<number, Record<number, number | string>>>({});
    const [specialByLP_HT, setSpecialByLP_HT] = useState<Record<number, Record<number, number | string>>>({});

    const lpList = useMemo(() => Array.from(new Set(rooms.map(r => r.LP_MA))), [rooms]);

    const loadRooms = async (p = pageRooms) => {
        setLoading(true);
        try {
            const params: any = { take, skip: (p - 1) * take, withTotal: 1 };
            if (search.trim()) params.search = search.trim();
            if (status !== 'ALL') params['eq.PHONG_TRANGTHAI'] = status;

            const res = await api.get('/phong', { params });
            const data = res.data;
            setRooms(data.items || []);                                 // <-- dùng items
            setTotalPagesRooms(Math.max(1, Math.ceil((data.total || 0) / take))); // <
        } finally { setLoading(false); }
    };

    const loadTypeRooms = async (p = pageTypes) => {
        setLoading(true);
        try {
            const params: any = { take, skip: (p - 1) * take, withTotal: 1 };
            if (search.trim()) params.search = search.trim();

            const res = await api.get('/loai-phong', { params });
            const data = res.data;
            setTypeRooms(data.items || []);                              // <-- dùng items
            setTotalPagesTypes(Math.max(1, Math.ceil((data.total || 0) / take)));
        } finally { setLoading(false); }
    };

    const loadHTandTD = async () => {
        const [htRes, tdRes] = await Promise.all([
            api.get<HT[]>('/hinh-thuc-thue', { params: { take: 100 } }).catch(() => ({ data: [] as HT[] })),
            // Lấy toàn bộ THOI_DIEM, rồi bạn có thể lọc "SPECIAL" ở BE sau này.
            api.get<TD[]>('/thoi-diem', { params: { take: 200 } }).catch(() => ({ data: [] as TD[] })),
        ]);
        setHtList(htRes.data || []);
        // tạm thời: hiển thị tất cả TD để chọn special (trừ base)
        setTdSpecialList((tdRes.data || []).filter(td => td.TD_MA !== TD_BASE_MA));
    };

    const loadBasePrices = async () => {
        // lấy tất cả đơn giá của TD cơ bản → mọi LP_MA & HT_MA
        const res = await api.get<DonGiaRow[]>('/don-gia', {
            params: { TD_MA: TD_BASE_MA, take: 2000 }
        }).catch(() => ({ data: [] as DonGiaRow[] }));
        const map: Record<number, Record<number, number | string>> = {};
        (res.data || []).forEach(d => {
            if (!map[d.LP_MA]) map[d.LP_MA] = {};
            map[d.LP_MA][d.HT_MA] = d.DG_DONGIA;
        });
        setBaseByLP_HT(map);
    };

    const loadSpecialPrices = async (td_ma: number) => {
        const res = await api.get<DonGiaRow[]>('/don-gia', {
            params: { TD_MA: td_ma, take: 2000 }
        }).catch(() => ({ data: [] as DonGiaRow[] }));
        const map: Record<number, Record<number, number | string>> = {};
        (res.data || []).forEach(d => {
            if (!map[d.LP_MA]) map[d.LP_MA] = {};
            map[d.LP_MA][d.HT_MA] = d.DG_DONGIA;
        });
        setSpecialByLP_HT(map);
    };

    const ctrl =
        "rounded-lg border px-3 py-2 text-sm outline-none " +
        // light
        "bg-white text-slate-700 placeholder-slate-400 border-slate-300 focus:ring-2 focus:ring-slate-300 " +
        // dark
        "dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700 dark:focus:ring-2 dark:focus:ring-slate-600";
    const countByLP = useMemo(() => {
        const m: Record<number, number> = {};
        rooms.forEach(r => {
            if (r.LP_MA != null) m[r.LP_MA] = (m[r.LP_MA] ?? 0) + 1;
        });
        return m;
    }, [rooms]);

    const [openCreateLoaiPhong, setOpenCreateLoaiPhong] = useState(false);
    const [lpTen, setLpTen] = useState("");
    const [lpSoNguoi, setLpSoNguoi] = useState<number | "">("");
    const [saving, setSaving] = useState(false);
    const [errMsg, setErrMsg] = useState<string | null>(null);
    const handleSaveLoaiPhong = async () => {
        if (!lpTen.trim()) { setErrMsg("Vui lòng nhập tên loại phòng"); return; }
        setSaving(true); setErrMsg(null);
        try {
            await api.post("/loai-phong", {
                LP_TEN: lpTen.trim(),
                ...(lpSoNguoi !== "" ? { LP_SONGUOI: Number(lpSoNguoi) } : {}),
            });
            // reset form + đóng modal
            setLpTen(""); setLpSoNguoi(""); setOpenCreateLoaiPhong(false);
            // reload bảng Loại phòng (về trang 1 nếu cần)
            // loadTypeRooms(1); setPageTypes?.(1);  // tuỳ bạn đặt state phân trang
            loadTypeRooms();
        } catch (e: any) {
            setErrMsg(e?.response?.data?.message || "Lưu thất bại");
        } finally { setSaving(false); }
    };

    const [openCreatePhong, setOpenCreatePhong] = useState(false);
    const [editLoaiPhongId, setEditLoaiPhongId] = useState<number | null>(null);
    const [openEditLoaiPhong, setOpenEditLoaiPhong] = useState(false);
    const openEdit = (row: LoaiPhongRow) => {
        setEditLoaiPhongId(row.LP_MA);
        setOpenEditLoaiPhong(true);
    };
    const [editPhongId, setEditPhongId] = useState<number | null>(null);
    const [openEditPhong, setOpenEditPhong] = useState(false);
    const openEditRoom = (row: PhongRow) => {
        setEditPhongId(row.PHONG_MA);   // dùng đúng key của payload phòng
        setOpenEditPhong(true);
    };
    
    useEffect(() => {
        // loadRooms();
        loadHTandTD();
        loadBasePrices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (tdSpecial) loadSpecialPrices(Number(tdSpecial));
        else setSpecialByLP_HT({});
    }, [tdSpecial]);

    useEffect(() => {
        if (activeTab === 'rooms') {
            setPageRooms(1);
            loadRooms(1);
            
            loadBasePrices();               // nếu giá cần cho bảng phòng
        } else {
            loadRooms(1);
            setPageTypes(1);
            loadTypeRooms(1);
            
            loadBasePrices();               // nếu giá cần hiển thị ở bảng loại phòng
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    return (
        <div>
            <PageBreadcrumb pageTitle="Loại phòng & Phòng" />
            <div className="mb-4 flex items-center justify-between gap-2">
                <div className="mb-4 flex items-center gap-2">
                    <Button size="sm" variant={activeTab === 'types' ? 'primary' : 'outline'} onClick={() => setActiveTab('types')}>
                        Loại phòng
                    </Button>
                    <Button size="sm" variant={activeTab === 'rooms' ? 'primary' : 'outline'} onClick={() => setActiveTab('rooms')}>
                        Danh sách phòng
                    </Button>
                </div>

                <Button
                    size="sm"
                    variant="primary"
                    startIcon={<PlusIcon />}
                    onClick={() => {
                        if (activeTab === 'types') {
                            setOpenCreateLoaiPhong(true);
                        } else {
                            setOpenCreatePhong(true);
                        }
                    }}
                >
                    {activeTab === 'types' ? 'Thêm loại phòng' : 'Thêm phòng'}
                </Button>
            </div>

            {loading ? (
                <div className="p-6 text-gray-500">Đang tải dữ liệu…</div>
            ) : (

                <ComponentCard title={
                    activeTab === 'rooms'
                        ? `Danh sách phòng (${rooms.length}${lpList.length ? ` | ${lpList.length} loại phòng` : ''})`
                        : `Loại phòng (${typerooms.length})`
                }
                    headerRight={
                        <>
                            {activeTab === 'rooms' ? (
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Tìm tên phòng…"
                                    className={`${ctrl} w-56`}
                                />
                            ) : (
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Tìm tên loại phòng…"
                                    className={`${ctrl} w-56`}
                                />
                            )}

                            {activeTab === 'rooms' && (
                                <>
                                    <select
                                        className={ctrl}
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value as Status)}
                                    >
                                        <option value="ALL">Tất cả trạng thái</option>
                                        <option value="AVAILABLE">Trống</option>
                                        <option value="OCCUPIED">Đang ở</option>
                                        <option value="CHUA_DON">Chưa dọn</option>
                                        <option value="MAINTENANCE">Bảo trì</option>
                                    </select>
                                </>
                            )}                          

                            <select
                                className={ctrl}
                                value={tdSpecial}
                                onChange={(e) => setTdSpecial(e.target.value ? Number(e.target.value) : '')}
                            >
                                <option value="">— Giá đặc biệt (tuỳ chọn) —</option>
                                {tdSpecialList.map(td => (
                                    <option key={td.TD_MA} value={td.TD_MA}>{td.TD_TEN}</option>
                                ))}
                            </select>


                            <Button size="sm" variant="primary" endIcon={<Search />}
                                onClick={() => {
                                    if (activeTab === 'rooms') { setPageRooms(1); loadRooms(1); }
                                    else { setPageTypes(1); loadTypeRooms(1); }
                                }}
                            >
                                Tìm kiếm
                            </Button>

                        </>
                    }
                >
                    {activeTab === 'rooms' ? (
                        <PhongTable
                            rows={rooms}
                            htList={htList}
                            baseByLP_HT={baseByLP_HT}
                            specialByLP_HT={Object.keys(specialByLP_HT).length ? specialByLP_HT : undefined}
                            specialLabel={
                                tdSpecial
                                    ? tdSpecialList.find(t => t.TD_MA === tdSpecial)?.TD_TEN
                                    : undefined
                            }
                            onRowDoubleClick={openEditRoom}
                        />
                    ) : (
                        <LoaiPhongTable
                            rows={typerooms}
                            htList={htList}
                            baseByLP_HT={baseByLP_HT}
                            specialByLP_HT={Object.keys(specialByLP_HT).length ? specialByLP_HT : undefined}
                            specialLabel={
                                tdSpecial
                                    ? tdSpecialList.find(t => t.TD_MA === tdSpecial)?.TD_TEN
                                    : undefined
                            }
                            countByLP={countByLP}
                            onRowDoubleClick={openEdit}  
                        />
                    )}



                </ComponentCard>
            )}


            {activeTab === 'rooms' && (
                <div className="mt-4 flex justify-end">
                    <Pagination
                        currentPage={pageRooms}
                        totalPages={totalPagesRooms}
                        onPageChange={(p) => { setPageRooms(p); loadRooms(p); }}
                    />
                </div>
            )}

            {activeTab === 'types' && (
                <div className="mt-4 flex justify-end">
                    <Pagination
                        currentPage={pageTypes}
                        totalPages={totalPagesTypes}
                        onPageChange={(p) => { setPageTypes(p); loadTypeRooms(p); }}
                    />
                </div>
            )}


            <LoaiPhongCreateModal
                open={openCreateLoaiPhong}
                onClose={() => setOpenCreateLoaiPhong(false)}
                onCreated={() => {
                    // reload đúng tab Loại phòng
                    // nếu bạn có phân trang riêng cho tab types, có thể reset về 1
                    // setPageTypes(1);
                    loadTypeRooms(1);
                }}
            />

            <PhongCreateModal
                open={openCreatePhong}
                onClose={() => setOpenCreatePhong(false)}
                onCreated={() => {
                    // reload đúng tab “Danh sách phòng”
                    // nếu có phân trang riêng:
                    // setPageRooms(1);
                    loadRooms(1);
                }}
            />
            <LoaiPhongEditModal
                open={openEditLoaiPhong}
                id={editLoaiPhongId}
                onClose={() => setOpenEditLoaiPhong(false)}
                onUpdated={() => loadTypeRooms(/* về page hiện tại */)}
            />
            
            <PhongEditModal
                open={openEditPhong}
                id={editPhongId}
                onClose={() => setOpenEditPhong(false)}
                onUpdated={() => loadRooms(/* về page hiện tại */)}
            />

        </div>
    );
}
