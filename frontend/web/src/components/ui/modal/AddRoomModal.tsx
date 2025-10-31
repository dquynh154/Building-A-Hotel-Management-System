'use client';
import { Modal } from '@/components/ui/modal';
import api from '@/lib/api';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
export default function AddRoomModal({ open, onClose, booking, bookingId, onAdded }: any) {
    const [rooms, setRooms] = useState<any[]>([]);
    const [selected, setSelected] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    
    // Gọi API lấy danh sách phòng trống trong khoảng ngày của hợp đồng
    useEffect(() => {
        if (!open || !bookingId) return;
        setFetching(true);

        api
            .get(`/rooms/available-by-booking/${bookingId}`)
            .then((r) => {
                setRooms(r.data.available || []);
            })
            .catch(() => setRooms([]))
            .finally(() => setFetching(false));
    }, [open, bookingId]);

    // Thêm phòng vào hợp đồng
    const handleAdd = async () => {
        if (!selected) {
            alert('Vui lòng chọn phòng cần thêm.');
            return;
        }

        setLoading(true);
        try {
            const res = await api.post(`/bookings/${bookingId}/add-room`, {
                PHONG_MA: selected,
            });

            alert(res.data?.message || 'Đã thêm phòng vào hợp đồng.');
            onAdded?.(); // reload lại trang chi tiết hợp đồng
            onClose();   // đóng modal
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Không thể thêm phòng.');
        } finally {
            setLoading(false);
        }
    };





    return (
        <Modal isOpen={open} onClose={onClose} className="max-w-md p-6">
            <h3 className="text-lg font-semibold mb-3">Thêm phòng vào hợp đồng</h3>

            {fetching ? (
                <div className="py-4 text-sm text-gray-500">Đang tải danh sách phòng trống…</div>
            ) : rooms.length === 0 ? (
                <div className="py-4 text-sm text-gray-500">
                    Không còn phòng trống trong khoảng thời gian này.
                </div>
            ) : (
                <select
                    className="w-full border rounded-md p-2 mb-4 text-sm"
                    value={selected || ''}
                    onChange={(e) => setSelected(Number(e.target.value))}
                >
                    <option value="">-- Chọn phòng trống --</option>
                    {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                            {r.name}
                        </option>
                    ))}
                </select>
            )}

            <div className="flex justify-end gap-2 mt-4">
                <button
                    onClick={onClose}
                    className="border px-4 py-1.5 rounded-md text-sm hover:bg-gray-100"
                >
                    Hủy
                </button>
                <button
                    onClick={handleAdd}
                    disabled={loading || !selected}
                    className="bg-green-600 text-white px-4 py-1.5 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                    {loading ? 'Đang thêm...' : 'Thêm phòng'}
                </button>
            </div>
        </Modal>
    );
}
