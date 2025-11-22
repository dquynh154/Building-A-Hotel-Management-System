'use client';

import LineChartOne from '@/components/charts/line/LineChartOne';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import DatePicker from '@/components/form/date-picker';
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

type GroupBy = 'day' | 'month' | 'year';

interface RevenueSummary {
    total: number;
    discount: number;
    fee: number;
}

interface RevenueRow {
    date: string;
    total: number;
    discount: number;
    fee: number;
}

interface RevenueResponse {
    summary: RevenueSummary;
    chart: { date: string; total: number }[];
    table: RevenueRow[];
}
const toYMD = (value: string) => {
    if (!value) return "";
    const [d, m, y] = value.split("-");
    return `${y}-${m}-${d}`;
};
function formatDate(iso: string) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}-${m}-${y}`;  // dd-mm-yyyy
}

export default function RevenueReportPage() {
    const [from, setFrom] = useState<string>(() => {
        // mặc định: đầu tháng hiện tại
        const d = new Date();
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        return first.toISOString().slice(0, 10);
    });
    const [to, setTo] = useState<string>(() => {
        const d = new Date();
        return d.toISOString().slice(0, 10);
    });
    console.log("FROM STATE =", from);
    console.log("TO STATE =", to);

    const [group, setGroup] = useState<GroupBy>('day');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [summary, setSummary] = useState<RevenueSummary | null>(null);
    const [table, setTable] = useState<RevenueRow[]>([]);
    const [chart, setChart] = useState<{ date: string; total: number }[]>([]);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await api.get("/bao-cao/doanh-thu", {
                params: {
                    from,
                    to,
                    group,
                },
            });

            const data: RevenueResponse = res.data;

            setSummary(data.summary);
            setTable(data.table || []);
            setChart(data.chart || []);

        } catch (e: any) {
            console.error(e);
            setError(e?.response?.data?.message || "Đã xảy ra lỗi");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    // Chuẩn bị dữ liệu cho Line Chart
    const lineChartData = useMemo(() => {
        return {
            labels: chart.map((c) => formatDate(c.date)),
            datasets: [
                {
                    label: 'Doanh thu',
                    data: chart.map((c) => c.total),
                    // tuỳ theo LineChart của TailAdmin mà cậu chỉnh thêm màu sắc / borderWidth...
                },
            ],
        };
    }, [chart]);
    console.log("labels", lineChartData.labels);
    console.log("dataset", lineChartData.datasets[0].data);

    return (
        <div className="space-y-8">

            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Báo cáo doanh thu</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Xem doanh thu theo khoảng thời gian & cách nhóm (ngày / tháng / năm).
                </p>
            </div>


            {/* Bộ lọc */}
            {/* Bộ lọc đẹp hơn */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-m font-semibold text-slate-700 mb-4">Bộ lọc báo cáo</h2>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

                    {/* Từ ngày */}
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-600">Từ ngày</label>
                        <DatePicker
                            id="fromDate"
                            placeholder="Chọn ngày"
                            allowPastDates
                            defaultDate={from ? new Date(from) : undefined}
                            onChange={(d, ds) => setFrom(toYMD(ds))}
                        />
                    </div>

                    {/* Đến ngày */}
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-600">Đến ngày</label>
                        <DatePicker
                            id="toDate"
                            placeholder="Chọn ngày"
                            allowPastDates
                            defaultDate={to ? new Date(to) : undefined}
                            onChange={(d, ds) => setTo(toYMD(ds))}
                        />
                    </div>

                    {/* Group */}
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-600">Nhóm theo</label>
                        <select
                            className="h-11 rounded-lg border border-slate-300 px-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition"
                            value={group}
                            onChange={(e) => setGroup(e.target.value as GroupBy)}
                        >
                            <option value="day">Ngày</option>
                            <option value="month">Tháng</option>
                            <option value="year">Năm</option>
                        </select>
                    </div>

                    {/* Button */}
                    <div className="flex items-end">
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="w-full h-11 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 shadow"
                        >
                            {loading ? "Đang tải..." : "Áp dụng"}
                        </button>
                    </div>

                </div>
            </div>




            {/* Lỗi nếu có */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-md">
                    {error}
                </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <SummaryCard
                    title="Tổng doanh thu"
                    value={summary?.total ?? 0}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                />

                <SummaryCard
                    title="Tổng giảm giá"
                    value={summary?.discount ?? 0}
                    color="text-orange-600"
                    bg="bg-orange-50"
                />

                {/* <SummaryCard
                    title="Tổng phí"
                    value={summary?.fee ?? 0}
                    color="text-indigo-600"
                    bg="bg-indigo-50"
                /> */}

            </div>


            {/* Chart + Table */}
            <div className="grid gap-6 xl:grid-cols-3">
                {/* Chart */}
                <div className="xl:col-span-2 bg-white rounded-lg shadow-sm border border-slate-100 p-4">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                        <h2 className="text-m font-semibold text-slate-700 mb-4">
                            Doanh thu theo {group === "day" ? "ngày" : group === "month" ? "tháng" : "năm"}
                        </h2>

                        {chart.length === 0 ? (
                            <div className="text-sm text-slate-500">Không có dữ liệu.</div>
                        ) : (
                            <div className="h-80">
                                <LineChartOne
                                    key={lineChartData.labels.join('-')}
                                    labels={lineChartData.labels}
                                    dataset={lineChartData.datasets[0].data}
                                />
                            </div>
                        )}
                    </div>

                </div>

                {/* Bảng chi tiết */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h2 className="text-m font-semibold text-slate-700 mb-4">
                        Chi tiết theo {group === "day" ? "ngày" : group === "month" ? "tháng" : "năm"}
                    </h2>

                    <div className="overflow-auto max-h-[420px] rounded-lg border border-slate-200">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-2 text-left">Ngày</th>
                                    <th className="px-4 py-2 text-right">Doanh thu</th>
                                    <th className="px-4 py-2 text-right">Giảm giá</th>
                                    {/* <th className="px-4 py-2 text-right">Phí</th> */}
                                </tr>
                            </thead>

                            <tbody>
                                {table.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-4 text-center text-slate-400">
                                            Không có dữ liệu.
                                        </td>
                                    </tr>
                                )}

                                {table.map((row) => (
                                    <tr key={row.date} className="border-t border-slate-200">
                                        <td className="px-4 py-2">{formatDate(row.date)}</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(row.total)}</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(row.discount)}</td>
                                        {/* <td className="px-4 py-2 text-right">{formatCurrency(row.fee)}</td> */}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}

// ================== Helper components ==================

function SummaryCard(
    { title, value, color, bg }:
        { title: string; value: number; color: string; bg: string }
) {
    return (
        <div className={`p-5 rounded-xl border border-slate-200 shadow-sm ${bg}`}>
            <p className="text-sm font-medium text-slate-600">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>
                {formatCurrency(value)}
            </p>
        </div>
    );
}


function formatCurrency(v: number) {
    return v.toLocaleString('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
    });
}
