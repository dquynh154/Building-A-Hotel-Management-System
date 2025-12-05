'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Button from '@/components/ui/button/Button';
import ThoiDiemCreateModal from '@/components/ui/modal/ThoiDiemSpecialCreateModal';
import { PlusIcon } from '@/icons';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';

type TD = any; // trả về có THOI_DIEM_SPECIAL
type HT = { HT_MA: number; HT_TEN: string };
type LP = { LP_MA: number; LP_TEN: string };

const TD_BASE_MA = 1; // giá cơ bản

export default function SpecialPricingPage() {
    const [tds, setTds] = useState<TD[]>([]);
    const [hts, setHts] = useState<HT[]>([]);
    const [lps, setLps] = useState<LP[]>([]);

    const [tdMa, setTdMa] = useState<number | ''>('');
    const [grid, setGrid] = useState<Record<string, string>>({});
    const [baseGrid, setBaseGrid] = useState<Record<string, string>>({});
    const [openCreateTD, setOpenCreateTD] = useState(false);

    async function reloadTDs(selectId?: number) {
        const tdRes = await api.get('/thoi-diem', { params: { take: 500 } }).catch(() => ({ data: [] }));
        const tdData = (tdRes.data || []).filter((x: any) => !!x.THOI_DIEM_SPECIAL);
        setTds(tdData);
        if (selectId) setTdMa(selectId); // chọn luôn TD vừa tạo
    }

    // load nền: TD list (SPECIAL), HT list, LP list
    useEffect(() => {
        (async () => {
            await reloadTDs();
            const [tdRes, htRes, lpRes] = await Promise.all([
                api.get('/thoi-diem', { params: { take: 500 } }).catch(() => ({ data: [] })),
                api.get('/hinh-thuc-thue', { params: { take: 200 } }).catch(() => ({ data: [] })),
                api.get('/loai-phong', { params: { take: 1000 } }).catch(() => ({ data: { items: [] } })),
            ]);
            const tdData: TD[] = (tdRes.data || []).filter((x: any) => !!x.THOI_DIEM_SPECIAL);
            setTds(tdData);

            setHts(htRes.data || []);
            const lpData = Array.isArray(lpRes.data) ? lpRes.data : (lpRes.data?.items || []);
            setLps(lpData.map((x: any) => ({ LP_MA: x.LP_MA, LP_TEN: x.LP_TEN })));
        })();
    }, []);

    // khi chọn TD → load giá TD + giá base tham khảo
    useEffect(() => {
        (async () => {
            if (!tdMa) { setGrid({}); setBaseGrid({}); return; }
            const [dg, base] = await Promise.all([
                api.get('/don-gia', { params: { TD_MA: tdMa, take: 5000 } }).catch(() => ({ data: [] })),
                api.get('/don-gia', { params: { TD_MA: TD_BASE_MA, take: 5000 } }).catch(() => ({ data: [] })),
            ]);
            const g: Record<string, string> = {};
            (dg.data || []).forEach((d: any) => { g[`${d.LP_MA}-${d.HT_MA}`] = String(d.DG_DONGIA ?? ''); });
            setGrid(g);

            const b: Record<string, string> = {};
            (base.data || []).forEach((d: any) => { b[`${d.LP_MA}-${d.HT_MA}`] = String(d.DG_DONGIA ?? ''); });
            setBaseGrid(b);
        })();
    }, [tdMa]);

    const setCell = (lp: number, ht: number, v: string) =>
        setGrid(prev => ({ ...prev, [`${lp}-${ht}`]: v }));

    const copyBaseIntoEmpty = () => {
        setGrid(prev => {
            const next = { ...prev };
            for (const lp of lps) for (const ht of hts) {
                const k = `${lp.LP_MA}-${ht.HT_MA}`;
                if (!next[k] && baseGrid[k]) next[k] = baseGrid[k];
            }
            return next;
        });
    };

    const saveAll = async () => {
        if (!tdMa) return;
        // upsert các ô có giá
        const entries = Object.entries(grid)
            .map(([k, val]) => {
                const [lp, ht] = k.split('-').map(Number);
                return { LP_MA: lp, HT_MA: ht, TD_MA: Number(tdMa), DG_DONGIA: String(val || '').trim() };
            })
            .filter(e => e.DG_DONGIA !== '');

        await Promise.all(entries.map(async e => {
            try {
                await api.put(`/don-gia/${e.LP_MA}/${e.HT_MA}/${e.TD_MA}`, { DG_DONGIA: e.DG_DONGIA });
            } catch {
                await api.post('/don-gia', e);
            }
        }));
        alert('Đã lưu giá');
    };

    const fmt = (d?: string) => {
        if (!d) return '';
        const t = new Date(d);
        const dd = String(t.getDate()).padStart(2, '0');
        const mm = String(t.getMonth() + 1).padStart(2, '0');
        const yy = t.getFullYear();
        return `${dd}/${mm}/${yy}`;
    };

    return (
        <>
            <title>Thiết lập giá</title>
        <div>
            <PageBreadcrumb pageTitle="Thiết lập giá" />
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <select
                    className="rounded border px-3 py-2 text-sm"
                    value={tdMa}
                    onChange={(e) => setTdMa(e.target.value ? Number(e.target.value) : '')}
                >
                    <option value="">— Chọn thời điểm —</option>
                    <option value={1}>Giá cơ bản</option>
                    {tds.map((td: any) => {
                        const sp = td.THOI_DIEM_SPECIAL;
                        const ten = td.TD_TEN || '(Chưa đặt tên)';
                        const label = `${fmt(sp.TD_NGAY_BAT_DAU)} – ${fmt(sp.TD_NGAY_KET_THUC)}${ten ? ' – ' + ten : ''}`;
                        return <option key={td.TD_MA} value={td.TD_MA}>{label}</option>;
                    })}
                </select>

                {/* <Button size="sm" variant="outline" onClick={copyBaseIntoEmpty}>Gợi ý từ giá cơ bản</Button> */}
                <Button size="sm" variant="add" startIcon={<PlusIcon />} onClick={() => setOpenCreateTD(true)}>
                    Thêm thời điểm
                </Button>

                <Button size="sm" variant="primary" onClick={saveAll}>Lưu tất cả</Button>
            </div>

            {tdMa ? (
                <div className="overflow-auto rounded border">
                    <table className="min-w-[900px] w-full text-sm">
                        <thead>
                            <tr>
                                <th className="sticky left-0 bg-white p-2 border-r z-10">Loại phòng</th>
                                {hts.map(ht => <th key={ht.HT_MA} className="p-2 border bg-white">{ht.HT_TEN}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {lps.map(lp => (
                                <tr key={lp.LP_MA} className="border-t bg-white">
                                    <td className="sticky left-0 bg-white p-2 border-r z-10">{lp.LP_TEN}</td>
                                    {hts.map(ht => {
                                        const k = `${lp.LP_MA}-${ht.HT_MA}`;
                                        return (
                                            <td key={k} className="p-2 border">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        inputMode="decimal"
                                                        min={0}
                                                        step="0.01"
                                                        className="w-full rounded border px-2 py-1"
                                                        value={grid[k] ?? ''}
                                                        onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                                                        onChange={(e) => setCell(lp.LP_MA, ht.HT_MA, e.target.value)}
                                                    />
                                                    {baseGrid[k] && (
                                                        <span className="whitespace-nowrap text-xs text-slate-500">(Giá cơ bản: {baseGrid[k]})</span>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="p-4 text-slate-500 border rounded">Chọn thời điểm để nhập giá.</div>
            )}
            <ThoiDiemCreateModal
                open={openCreateTD}
                onClose={() => setOpenCreateTD(false)}
                onCreated={(newId) => {
                    // reload list TD và chọn luôn TD vừa tạo để nhập giá
                    reloadTDs(newId);
                }}
            />

        </div>
        </div>
        </>
    );
}
