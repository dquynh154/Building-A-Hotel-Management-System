'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import api from '@/lib/api';

const vnd = (n: number) => (Number(n) || 0).toLocaleString('vi-VN');
const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('vi-VN', { hour12: false }) : '—';
export default function RoomDetailModal({ booking, onClose }: any) {
    const [loading, setLoading] = useState(false);

    const handleChangeRoom = async () => {
        if (!confirm(`Xác nhận đổi phòng cho ${booking.KH_TEN || 'khách lẻ'}?`)) return;
        // ở đây bạn có thể mở thêm một modal khác để chọn phòng trống
        alert("Gọi API đổi phòng ở đây nhé!");
    };

    const handleCheckout = async () => {
        alert("Gọi API trả phòng ở đây.");
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            className="max-w-md p-6 sm:p-8"
        >
            <h3 className="text-lg font-semibold mb-3">
                {booking.PHONG_TEN || `Phòng ${booking.PHONG_MA}`}
            </h3>

            <div className="space-y-2 text-sm text-gray-700">
                <div><b>Khách:</b> {booking.KH_TEN || 'Khách lẻ'}</div>
                <div><b>Thời gian:</b> {fmt(booking.TU_LUC)} → {fmt(booking.DEN_LUC)}</div>
                <div><b>Trạng thái:</b> {booking.TRANG_THAI}</div>
                <div><b>Giá:</b> {vnd(booking.GIA || booking.TONG_TIEN)}</div>
                <div className="text-xs text-gray-500 italic mt-2">
                    Dự kiến đến: {fmt(booking.TU_LUC)} – Dự kiến đi: {fmt(booking.DEN_LUC)}
                </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
                <button
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
                    onClick={onClose}
                >
                    Đóng
                </button>
                <button
                    disabled={loading}
                    onClick={handleChangeRoom}
                    className="rounded-md bg-amber-500 px-3 py-1.5 text-sm text-white hover:bg-amber-600"
                >
                    Đổi phòng
                </button>
                <button
                    disabled={loading}
                    onClick={handleCheckout}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
                >
                    Trả phòng
                </button>
            </div>
        </Modal>
    );
}
