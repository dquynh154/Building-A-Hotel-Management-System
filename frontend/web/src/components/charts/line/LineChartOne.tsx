"use client";

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface LineChartOneProps {
  labels: string[];            // danh sách ngày/tháng/năm
  dataset: number[];           // doanh thu tương ứng
  title?: string;              // không bắt buộc
}

export default function LineChartOne({ labels, dataset, title }: LineChartOneProps) {

  const options: ApexOptions = useMemo(() => ({
    legend: { show: false },
    colors: ["#465FFF"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      height: 310,
      type: "line",
      toolbar: { show: false },
    },
    stroke: {
      curve: "straight",
      width: 2,
    },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.55, opacityTo: 0 },
    },
    markers: {
      size: 0,
      strokeColors: "#fff",
      strokeWidth: 2,
      hover: { size: 6 },
    },
    grid: {
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    dataLabels: { enabled: false },

    tooltip: {
      enabled: true,
      x: { format: "dd MMM yyyy" },
    },

    xaxis: {
      type: "category",
      categories: labels,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
      labels: {
        rotate: -45,
        style: { fontSize: "11px", colors: "#6B7280" },
      },
    },

    yaxis: {
      labels: {
        style: { fontSize: "12px", colors: ["#6B7280"] },
        formatter: (value) => value.toLocaleString("vi-VN"),
      },
    },
  }), [labels]);

  const series = useMemo(() => [
    {
      name: "Doanh thu",
      data: dataset,
    },
  ], [dataset]);

  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div className="w-full">
        <ReactApexChart
          options={options}
          series={series}
          type="area"
          height={310}
        />
      </div>
    </div>
  );
}
