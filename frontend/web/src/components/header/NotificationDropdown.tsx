"use client";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

type NotiItem = {
  HDONG_MA: number;
  HDONG_NGAYDAT: string;
  HDONG_NGAYTRA: string;
  HDONG_TIENCOCYECAU: string;
  HDONG_TAO_LUC: string;
  KHACH_HANG: { KH_MA: number; KH_HOTEN: string | null; KH_EMAIL: string | null; KH_SDT: string | null };
  CT: { CTDP_ID: number; SO_LUONG: number; DON_GIA: number; TONG_TIEN: number; LOAI_PHONG: { LP_MA: number; LP_TEN: string } }[];
};

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifying, setNotifying] = useState(true);
  const [items, setItems] = useState<NotiItem[]>([]);
  const [loading, setLoading] = useState(false);

  function toggleDropdown() { setIsOpen(!isOpen); }
  function closeDropdown() { setIsOpen(false); }

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        setLoading(true);
        const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "";
        const res = await fetch(`${BASE}/admin/dat-truoc?status=needs_action&take=50`, { credentials: "include" });
        const json = await res.json();
        setItems(Array.isArray(json?.items) ? json.items : []);
        setNotifying(false);
      } catch {
        /* noop */
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const count = items.length;

  return (
    <div className="relative">
      <button
        className="relative dropdown-toggle flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={() => { toggleDropdown(); setNotifying(false); }}
      >
        {count > 0 && (
          <span className="absolute -right-1 -top-1 z-10 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
        <svg className="fill-current" width="20" height="20" viewBox="0 0 20 20">
          <path
            fillRule="evenodd" clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen} onClose={closeDropdown}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Thông báo</h5>
          <button onClick={closeDropdown} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ✕
          </button>
        </div>

        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {loading && <li className="p-3 text-sm text-gray-500">Đang tải…</li>}

          {!loading && items.length === 0 && (
            <li className="p-3 text-sm text-gray-500">Chưa có đặt phòng trực tuyến nào đang chờ.</li>
          )}

          {items.map((it) => {
            const lpText = it.CT.map(c => `${c.LOAI_PHONG.LP_TEN} × ${c.SO_LUONG}`).join(' • ');
            const name = it.KHACH_HANG?.KH_HOTEN || 'Khách vãng lai';
            const tienCoc = Number(it.HDONG_TIENCOCYECAU || 0).toLocaleString('vi-VN');

            return (
              <li key={it.HDONG_MA}>
                <DropdownItem
                  onItemClick={closeDropdown}
                  className="flex gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5"
                  href={`/admin/others-pages/dat-truoc?status=pending#hd_${it.HDONG_MA}`}                >
                  <span className="relative block w-full h-10 rounded-full z-1 max-w-10">
                    <Image width={40} height={40} src="/images/user/user-02.jpg" alt="User" className="w-full rounded-full" />
                    <span className="absolute bottom-0 right-0 z-10 h-2.5 w-full max-w-2.5 rounded-full border-[1.5px] border-white bg-success-500 dark:border-gray-900"></span>
                  </span>

                  <span className="block">
                    <span className="mb-1.5 block text-theme-sm text-gray-700 dark:text-gray-300">
                      <b>{name}</b> vừa đặt phòng – cọc yêu cầu <b>{tienCoc}đ</b>
                    </span>
                    <span className="block text-xs text-gray-500">
                      {lpText || '—'}
                    </span>
                  </span>
                </DropdownItem>
              </li>
            );
          })}
        </ul>

        <Link
          href="/admin/others-pages/dat-truoc?status=needs_action"
          className="block px-4 py-2 mt-3 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          Xem tất cả đặt phòng chờ
        </Link>
      </Dropdown>
    </div>
  );
}
