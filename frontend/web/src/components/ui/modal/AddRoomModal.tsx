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
    const [pendingRooms, setPendingRooms] = useState<any[]>([]);
    const [selectedLP, setSelectedLP] = useState<number | null>(null);

    // useEffect(() => {
    //     if (!open || !bookingId) return;
    //     setFetching(true);
    //     Promise.all([
    //         api.get(`/rooms/available-by-booking/${bookingId}`),
    //         api.get(`/bookings/${bookingId}/pending-rooms`),
    //     ])
    //         .then(([avail, pending]) => {
    //             setRooms(avail.data.available || []);
    //             setPendingRooms(pending.data || []);
    //         })
    //         .catch(() => {
    //             setRooms([]);
    //             setPendingRooms([]);
    //         })
    //         .finally(() => setFetching(false));
    // }, [open, bookingId]);
    // // Gọi API lấy danh sách phòng trống trong khoảng ngày của hợp đồng
    // useEffect(() => {
    //     if (!open || !bookingId) return;
    //     setFetching(true);

    //     api
    //         .get(`/rooms/available-by-booking/${bookingId}`)
    //         .then((r) => {
    //             setRooms(r.data.available || []);
    //         })
    //         .catch(() => setRooms([]))
    //         .finally(() => setFetching(false));
    // }, [open, bookingId]);
    const [showAll, setShowAll] = useState(false); // 👈 thêm state mới
    useEffect(() => {
        if (showAll) {
            setSelectedLP(null);
        }
    }, [showAll]);

    useEffect(() => {
        if (!open || !bookingId) return;
        setFetching(true);

        let query = [];
        if (selectedLP) query.push(`lp=${selectedLP}`);
        if (showAll) query.push(`all=true`);
        const qstr = query.length ? `?${query.join('&')}` : '';
        const url = `/rooms/available-by-booking/${bookingId}${qstr}`;

        Promise.all([
            api.get(url),
            api.get(`/bookings/${bookingId}/pending-rooms`),
        ])
            .then(([avail, pending]) => {
                setRooms(avail.data.available || []);
                setPendingRooms(pending.data || []);
            })
            .catch(() => {
                setRooms([]);
                setPendingRooms([]);
            })
            .finally(() => setFetching(false));
    }, [open, bookingId, selectedLP, showAll]); // 👈 thêm showAll
  

    // Thêm phòng vào hợp đồng
    const handleAdd = async () => {
        if (!selected) {
            alert('Vui lòng chọn phòng cần thêm.');
            return;
        }

        setLoading(true);
        try {
            const selectedRoom = rooms.find(r => r.id === selected);
            const res = await api.post(`/bookings/${bookingId}/add-room`, {
                PHONG_MA: selected,
                LP_MA: selectedLP,
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

            {/* {fetching ? (
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
                
            )} */}

            {fetching ? (
                <div className="py-4 text-sm text-gray-500">
                    Đang tải danh sách phòng trống…
                </div>
            ) : (
                <>
                    {rooms.length === 0 && !showAll && pendingRooms.length > 0 && (
                        <div className="py-4 text-sm text-gray-500">
                            Đã gán đủ phòng theo đặt trước.<br />
                            Vui lòng chọn <b>“Hiển thị tất cả phòng trống”</b> để thêm phòng khác.
                        </div>
                    )}

                    {rooms.length === 0 && showAll && (
                        <div className="py-4 text-sm text-gray-500">
                            Không còn phòng trống trong khoảng thời gian này.
                        </div>
                    )}

                    {rooms.length > 0 && (
                        <select
                            className="w-full border rounded-md p-2 mb-4 text-sm"
                            value={selected || ''}
                            onChange={(e) => setSelected(Number(e.target.value))}
                        >
                            <option value="">-- Chọn phòng trống --</option>
                            {rooms.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name} - {r.type}
                                </option>
                            ))}
                        </select>
                    )}

                    {pendingRooms.length > 0 && (
                        <div className="mt-3 border-t pt-2 text-sm text-gray-700">
                            <div className="font-medium mb-1">Hợp đồng đã đặt trực tuyến:</div>
                            {pendingRooms.map(r => (
                                <div key={r.LP_MA} className="px-3 py-1 text-gray-600">
                                    • {r.LP_TEN} — {r.SO_LUONG} phòng
                                </div>
                            ))}

                            <label className="flex items-center gap-2 mt-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={showAll}
                                    onChange={(e) => setShowAll(e.target.checked)}
                                />
                                Hiển thị tất cả phòng trống (kể cả khác loại)
                            </label>
                        </div>
                    )}
                </>
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
