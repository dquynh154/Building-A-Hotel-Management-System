'use client';

import LineChartOne from '@/components/charts/line/LineChartOne';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
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
    }, []); // lần đầu vào trang thì load luôn

    // Chuẩn bị dữ liệu cho Line Chart
    const lineChartData = useMemo(() => {
        return {
            labels: chart.map((c) => c.date),
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
        <div className="space-y-6">
            {/* Tiêu đề */}
            <div>
                <h1 className="text-2xl font-semibold text-slate-800">
                    Báo cáo doanh thu
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Xem tổng quan doanh thu theo khoảng thời gian và cách nhóm (ngày / tháng / năm).
                </p>
            </div>

            {/* Bộ lọc */}
            <div className="grid gap-4 md:grid-cols-4 bg-white p-4 rounded-lg shadow-sm border border-slate-100">
                <div className="flex flex-col">
                    <label className="text-xs font-medium text-slate-500 mb-1">
                        Từ ngày
                    </label>
                    <input
                        type="date"
                        className="border rounded-md px-3 py-2 text-sm"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                    />
                </div>

                <div className="flex flex-col">
                    <label className="text-xs font-medium text-slate-500 mb-1">
                        Đến ngày
                    </label>
                    <input
                        type="date"
                        className="border rounded-md px-3 py-2 text-sm"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                    />
                </div>

                <div className="flex flex-col">
                    <label className="text-xs font-medium text-slate-500 mb-1">
                        Nhóm theo
                    </label>
                    <select
                        className="border rounded-md px-3 py-2 text-sm"
                        value={group}
                        onChange={(e) => setGroup(e.target.value as GroupBy)}
                    >
                        <option value="day">Ngày</option>
                        <option value="month">Tháng</option>
                        <option value="year">Năm</option>
                    </select>
                </div>

                <div className="flex items-end">
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="w-full inline-flex items-center justify-center rounded-md bg-primary py-2 px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                    >
                        {loading ? 'Đang tải...' : 'Áp dụng'}
                    </button>
                </div>
            </div>

            {/* Lỗi nếu có */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-md">
                    {error}
                </div>
            )}

            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <SummaryCard
                    title="Tổng doanh thu"
                    value={summary?.total ?? 0}
                />
                <SummaryCard
                    title="Tổng giảm giá"
                    value={summary?.discount ?? 0}
                />
                <SummaryCard
                    title="Tổng phí"
                    value={summary?.fee ?? 0}
                />
            </div>

            {/* Chart + Table */}
            <div className="grid gap-6 xl:grid-cols-3">
                {/* Chart */}
                <div className="xl:col-span-2 bg-white rounded-lg shadow-sm border border-slate-100 p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-slate-700">
                            Doanh thu theo {group === 'day' ? 'ngày' : group === 'month' ? 'tháng' : 'năm'}
                        </h2>
                    </div>

                    {chart.length === 0 ? (
                        <div className="text-sm text-slate-500">Không có dữ liệu.</div>
                    ) : (
                        <div className="h-72">
                           
                                <LineChartOne
                                    key={lineChartData.labels.join('-')} 
                                    labels={lineChartData.labels}
                                    dataset={lineChartData.datasets[0].data}
                                />

                        </div>
                    )}
                </div>

                {/* Bảng chi tiết */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-4">
                    <h2 className="text-sm font-semibold text-slate-700 mb-4">
                        Chi tiết theo {group === 'day' ? 'ngày' : group === 'month' ? 'tháng' : 'năm'}
                    </h2>

                    <div className="overflow-auto max-h-[420px]">
                        <table className="min-w-full text-xs">
                            <thead className="sticky top-0 bg-slate-50 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium text-slate-500">
                                        {group === 'day' ? 'Ngày' : group === 'month' ? 'Tháng' : 'Năm'}
                                    </th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-500">
                                        Doanh thu
                                    </th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-500">
                                        Giảm giá
                                    </th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-500">
                                        Phí
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {table.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            className="px-3 py-4 text-center text-slate-400"
                                        >
                                            Không có dữ liệu.
                                        </td>
                                    </tr>
                                )}

                                {table.map((row) => (
                                    <tr key={row.date} className="border-t border-slate-100">
                                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                                            {row.date}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-700">
                                            {formatCurrency(row.total)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-700">
                                            {formatCurrency(row.discount)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-slate-700">
                                            {formatCurrency(row.fee)}
                                        </td>
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

function SummaryCard({ title, value }: { title: string; value: number }) {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-100 p-4">
            <p className="text-xs text-slate-500 mb-1">{title}</p>
            <p className="text-lg font-semibold text-slate-800">
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
