'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import Button from '@/components/ui/button/Button';
import api from '@/lib/api';

export default function ChangeRoomModal({ booking, onClose }: {
    booking: any;
    onClose: () => void;
}) {
    const [roomTypes, setRoomTypes] = useState<any[]>([]);
    const [rooms, setRooms] = useState<any[]>([]);
    const [selectedType, setSelectedType] = useState<number | null>(null);
    const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
    const [priceMode, setPriceMode] = useState<'old' | 'new'>('old');
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!booking?.HDONG_MA) return;
        setLoading(true);
        Promise.all([
            api.get('/loai-phong'), // ✅ danh sách loại phòng
            api.get(`/rooms/available-by-booking/${booking.HDONG_MA}`), // ✅ danh sách phòng trống theo HĐ
        ])
            .then(([typesRes, roomsRes]) => {
                setRoomTypes(typesRes.data || []);
                setRooms(roomsRes.data?.available || []);
            })
            .catch(() => setErr('Không thể tải danh sách phòng'))
            .finally(() => setLoading(false));
    }, [booking?.HDONG_MA]);

    const handleSubmit = async () => {
        if (!selectedRoom) return;
        setLoading(true);
        try {
            await api.post(`/bookings/${booking.HDONG_MA}/change-room`, {
                oldRoomId: booking.PHONG_MA,
                newRoomId: selectedRoom,
                reason: priceMode === 'new' ? 'Áp dụng giá hạng phòng mới' : 'Giữ nguyên giá phòng cũ',
            });
            onClose();
            window.location.reload();
        } catch (e: any) {
            setErr(e?.response?.data?.message || 'Đổi phòng thất bại');
        } finally {
            setLoading(false);
        }
    };

    const filteredRooms = selectedType
        ? rooms.filter(r => r.LP_MA === selectedType)
        : rooms;

    return (
        <Modal isOpen onClose={onClose} className="max-w-md p-6">
            <h3 className="text-base font-semibold mb-3">
                Xác nhận đổi phòng {booking?.PHONG_TEN}
            </h3>

            {err && <div className="text-sm text-red-500 mb-2">{err}</div>}

            {/* 1️⃣ Chọn hạng phòng */}
            {/* <label className="block text-sm font-medium text-gray-700 mb-1">
                Chọn hạng phòng bạn muốn đổi sang:
            </label>
            <select
                className="w-full border rounded-md p-2 text-sm mb-3"
                value={selectedType || ''}
                onChange={(e) => setSelectedType(Number(e.target.value) || null)}
            >
                <option value="">-- Chọn hạng phòng --</option>
                {roomTypes.map(t => (
                    <option key={t.LP_MA} value={t.LP_MA}>{t.LP_TEN}</option>
                ))}
            </select> */}

            {/* 2️⃣ Chọn phòng cụ thể */}
            <select
                className="w-full border rounded-md p-2 text-sm mb-4"
                value={selectedRoom || ''}
                onChange={(e) => setSelectedRoom(Number(e.target.value) || null)}
            >
                <option value="">-- Chọn phòng cụ thể --</option>
                {filteredRooms.map(r => (
                    <option key={r.id} value={r.id}>
                        {r.name} — {r.type}
                    </option>
                ))}

            </select>

            {/* 3️⃣ Giữ giá hay áp dụng giá mới */}
            {/* <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Có thay đổi về hạng phòng, bạn muốn:
                </label>
                <div className="flex flex-col gap-1 text-sm">
                    <label>
                        <input
                            type="radio"
                            checked={priceMode === 'old'}
                            onChange={() => setPriceMode('old')}
                        />{' '}
                        Giữ nguyên giá phòng
                    </label>
                    <label>
                        <input
                            type="radio"
                            checked={priceMode === 'new'}
                            onChange={() => setPriceMode('new')}
                        />{' '}
                        Áp dụng giá hạng phòng mới
                    </label>
                </div>
            </div> */}

            {/* 4️⃣ Nút hành động */}
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Hủy</Button>
                <Button onClick={handleSubmit} disabled={loading || !selectedRoom}>
                    {loading ? 'Đang đổi...' : 'Xác nhận'}
                </Button>
            </div>
        </Modal>
    );
}
