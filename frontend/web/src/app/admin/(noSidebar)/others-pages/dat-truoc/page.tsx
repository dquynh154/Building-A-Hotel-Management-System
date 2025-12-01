'use client';

import { useEffect, useState } from 'react';

type Row = {
    HDONG_MA: number;
    HDONG_NGAYDAT: string;
    HDONG_NGAYTRA: string;
    HDONG_TIENCOCYEUCAU: string;
    HDONG_TAO_LUC: string;
    KHACH_HANG: { KH_HOTEN: string | null; KH_EMAIL: string | null; KH_SDT: string | null } | null;
    CT: { CTDP_ID: number; SO_LUONG: number; DON_GIA: number; TONG_TIEN: number; LOAI_PHONG: { LP_TEN: string } }[];
};

export default function AdminDatTruocPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
                const res = await fetch(`${BASE}/admin/dat-truoc?status=needs_action&take=50`, { credentials: 'include' });
                const json = await res.json();
                setRows(Array.isArray(json?.items) ? json.items : []);
            } catch { /* noop */ }
            finally { setLoading(false); }
        })();
    }, []);

    return (
        <div className="mx-auto max-w-6xl p-6">
            <h1 className="mb-4 text-2xl font-bold">Đặt phòng trực tuyến đang chờ</h1>
            {loading && <div>Đang tải…</div>}

            {!loading && rows.length === 0 && <div className="text-gray-600">Không có bản ghi.</div>}

            <div className="space-y-3">
                {rows.map(r => (
                    <div key={r.HDONG_MA} id={`hd_${r.HDONG_MA}`} className="rounded-lg border bg-white p-4">
                        <div className="flex items-center justify-between">
                            <div className="font-semibold">
                                HĐ #{r.HDONG_MA} — {r.KHACH_HANG?.KH_HOTEN || 'Khách vãng lai'}
                            </div>
                            <div className="text-sm text-rose-700 font-semibold">
                                Cọc yêu cầu: {Number(r.HDONG_TIENCOCYEUCAU || 0).toLocaleString('vi-VN')}đ
                            </div>
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                            {new Date(r.HDONG_NGAYDAT).toLocaleDateString('vi-VN')} → {new Date(r.HDONG_NGAYTRA).toLocaleDateString('vi-VN')}
                        </div>
                        <div className="mt-2 text-sm">
                            {r.CT.map(c => (
                                <div key={c.CTDP_ID} className="flex items-center justify-between">
                                    <span>{c.LOAI_PHONG.LP_TEN} × {c.SO_LUONG}</span>
                                    <span>{Number(c.TONG_TIEN).toLocaleString('vi-VN')}đ</span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                            {/* <a
                                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                                href={`/admin/xep-phong?hopdong=${r.HDONG_MA}`}
                            >
                                Xếp phòng / Xác nhận
                            </a> */}
                            <a
                                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                                href={`/admin/others-pages/chi-tiet/${r.HDONG_MA}`}
                            >
                                Xếp phòng / Xác nhận
                            </a>
                        </div>  
                    </div>
                ))}
            </div>
        </div>
    );
}
