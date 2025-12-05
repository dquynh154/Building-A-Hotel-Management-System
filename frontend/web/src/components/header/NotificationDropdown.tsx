"use client";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import api from "@/lib/api";

type ServiceRequestItem = {
  HDONG_MA: number; // Mã hợp đồng
  PHONG_MA: number; // Mã phòng khách đang ở
  CTSD_STT: number; // PK
  DV_MA: number; // PK
  CTDV_STT: number;
  PHONG_TEN: string; // Tên phòng

  DICH_VU_TEN: string; // Tên dịch vụ khách yêu cầu
  KH_HOTEN: string; // Tên khách hàng
  REQUEST_TIME: string; // Thời gian yêu cầu (dùng để hiển thị)
  CTDV_TRANGTHAI: string;
};
export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifying, setNotifying] = useState(true);
  const [items, setItems] = useState<ServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(false);

  function toggleDropdown() { setIsOpen(!isOpen); }
  function closeDropdown() { setIsOpen(false); }

  const handleAction = async (item: ServiceRequestItem, action: 'approve' | 'reject') => {
    try {
      setLoading(true);
      const payload = {
        HDONG_MA: item.HDONG_MA,
        PHONG_MA: item.PHONG_MA,
        CTSD_STT: item.CTSD_STT,
        DV_MA: item.DV_MA,
        CTDV_STT: item.CTDV_STT,
      };

      // ⚠️ THAY THẾ fetch BẰNG api.post
      // API POST duyệt/từ chối: /requests/service/approve hoặc /requests/service/reject
      const res = await api.post(`/requests/service/${action}`, payload);

      if (res.status >= 200 && res.status < 300) {
        // Xóa yêu cầu đã xử lý dựa trên CTDV_STT (vì nó là duy nhất trong mảng UI hiện tại)
        setItems(prev =>
          prev.map(i =>
            i.CTDV_STT === item.CTDV_STT
              ? { ...i, CTDV_TRANGTHAI: action === "approve" ? "ACTIVE" : "CANCELLED" }
              : i
          )
        );

      } else {
        console.error("Xử lý thất bại:", res.data);
        alert(`Xử lý yêu cầu ${action} thất bại: ${res.data.error || res.data.message}`);
      }
    } catch (error) {
      console.error('Lỗi mạng/hệ thống:', error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get(`/requests/pending/service`);

        setItems(res.data);
      } catch (e) {
        // ... xử lý lỗi
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

        <ul className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
          {loading && (
            <li className="p-4 text-center text-gray-500">Đang tải...</li>
          )}
          {!loading && items.length === 0 && (
            <li className="p-4 text-center text-gray-500">Không có yêu cầu dịch vụ nào đang chờ.</li>
          )}

          {/* ✅ Cập nhật Render cho Yêu cầu Dịch vụ */}
          {!loading && items.length > 0 && items.map((it) => {
            return (
              <li key={it.CTDV_STT}>
                <div
                  className="flex items-center gap-2.5 px-4 py-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5"
                >
                  <span className="block w-full">
                    <span className="mb-1.5 block text-theme-sm text-gray-700 dark:text-gray-900">
                      <b>{it.KH_HOTEN}</b> yêu cầu thêm dịch vụ <b>{it.DICH_VU_TEN}</b> vào phòng <b> {it.PHONG_TEN}</b> (Mã HĐ: {it.HDONG_MA})
                    </span>
                    <span className="block text-xs text-gray-500">
                      {new Date(it.REQUEST_TIME).toLocaleString('vi-VN')}
                    </span>
                  </span>

                  {it.CTDV_TRANGTHAI === "PENDING" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(it, "approve")}
                        className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
                      >
                        Chấp nhận
                      </button>
                      <button
                        onClick={() => handleAction(it, "reject")}
                        className="text-xs bg-rose-600 text-white px-2 py-1 rounded hover:bg-rose-700"
                      >
                        Từ chối
                      </button>
                    </div>
                  ) : it.CTDV_TRANGTHAI === "ACTIVE" ? (
                    <span className="text-green-600 text-xs font-semibold">
                      Đã chấp nhận
                    </span>
                  ) : (
                    <span className="text-red-600 text-xs font-semibold">
                      Đã từ chối
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 text-center">
          <Link
            href="/admin/others-pages/yeu-cau-dich-vu" // Giả sử một trang quản lý yêu cầu
            className="block px-4 py-2 text-sm font-medium text-gray-700 bg-white border-t border-gray-300 rounded-b-lg hover:bg-gray-50"
          >
            Xem tất cả yêu cầu
          </Link>
        </div>
      </Dropdown>
    </div>
  );
}
