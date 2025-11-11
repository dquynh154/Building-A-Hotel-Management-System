'use client';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import api from '@/lib/api';
import Lightbox from 'yet-another-react-lightbox';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

interface RoomDetailModalProps {
    open: boolean;
    onClose: () => void;
    room: {
        LP_MA: number;
        LP_TEN: string;
        DTICH?: string;
        MOTA?: string;
        VIEW?: string;
        BEDS?: string;
        IMAGES?: string[];
        TIENNGHI?: string[];
    } | null;
}

export default function RoomDetailModal({ open, onClose, room }: RoomDetailModalProps) {
    const [images, setImages] = useState<string[]>([]);
    const [current, setCurrent] = useState(0);
    const [openLightbox, setOpenLightbox] = useState(false);
    const [photoIndex, setPhotoIndex] = useState(0);

    useEffect(() => {
        if (!room?.LP_MA) return;
        (async () => {
            try {
                const res = await api.get(`/loai-phong/${room.LP_MA}/images`);
                const json = res.data;
                if (Array.isArray(json)) {
                    const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
                    const urls = json.map((img: any) =>
                        img.URL?.startsWith('http') ? img.URL : `${BASE}${img.URL}`,
                    );
                    setImages(urls);
                } else setImages([]);
            } catch (err) {
                console.error('Lỗi tải ảnh loại phòng:', err);
                setImages([]);
            }
        })();
    }, [room?.LP_MA]);

    if (!room) return null;
    const amenities = room.TIENNGHI || [];
    const photos = images.map((url) => ({ src: url }));

    return (
        <>
            <Modal isOpen={open} onClose={onClose} className="max-w-5xl p-6 overflow-y-auto">
                {/* ----- Tiêu đề ----- */}
                <h2 className="text-xl font-bold text-slate-900 mb-5">Thông tin phòng</h2>

                {/* ----- Ảnh nhỏ bên trái + thông tin bên phải ----- */}
                <div className="grid grid-cols-[500px_1fr] gap-6 items-start">
                    {/* Ảnh chính */}
                    <div
                        className="relative cursor-pointer rounded-lg overflow-hidden shadow"
                        onClick={() => {
                            setPhotoIndex(0);
                            setOpenLightbox(true);
                        }}
                    >
                        {images.length > 0 ? (
                            <img
                                src={images[current]}
                                alt={room.LP_TEN}
                                className="w-[500px] h-[300px] object-cover rounded-lg"
                            />
                        ) : (
                            <div className="w-[220px] h-[160px] bg-gray-100 flex items-center justify-center text-gray-400 rounded-lg">
                                Không có ảnh
                            </div>
                        )}
                        {/* Ảnh nhỏ */}
                        
                    </div>
                   

                    {/* Thông tin */}
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 uppercase mb-2">{room.LP_TEN}</h3>
                        <p className="text-gray-700 text-base mb-2 flex items-center gap-3">
                            <b>Giường:</b>{room.BEDS || '1 giường Queen hoặc 2 giường đơn'} &nbsp;|&nbsp;<b>Diện tích:</b> {room.DTICH || '20m²'}

                        </p>
                        <p className="text-gray-800 text-[15px] leading-relaxed">
                            {room.MOTA ||
                                'Phòng được thiết kế hiện đại, đầy đủ tiện nghi, phù hợp cho khách công tác hoặc nghỉ dưỡng.'}
                        </p>
                        {room.VIEW && (
                            <p className="mt-2 text-gray-700 text-[15px]">
                                <b>Hướng nhìn:</b> {room.VIEW}
                            </p>
                        )}
                    </div>
                    
                </div>

                {/* ----- Tiện ích bên dưới ----- */}
                <div className="mt-3">
                    {images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto">
                            {images.map((img, i) => (
                                <img
                                    key={i}
                                    src={img}
                                    className={`w-20 h-20 object-cover rounded cursor-pointer border-2 ${i === current ? 'border-rose-600' : 'border-transparent'}`}
                                    onClick={() => setCurrent(i)}
                                />
                            ))}
                        </div>
                    )}
                    <div className='mt-6'>
                    <h4 className="text-lg font-semibold text-gray-900 mb-3">Tiện ích</h4>
                    <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-2 gap-x-4 text-[15px] text-gray-800">
                        {amenities.length > 0 ? (
                            amenities.map((a, i) => (
                                <li key={i} className="flex items-center gap-2">
                                    <span className="text-emerald-600">✓</span>
                                    {a}
                                </li>
                            ))
                        ) : (
                            <li>Không có thông tin</li>
                        )}
                    </ul>
                    </div>
                </div>

                {/* ----- Footer ----- */}
                <div className="text-right mt-6">
                    <button
                        onClick={onClose}
                        className="bg-rose-600 text-white px-6 py-2 rounded-lg hover:bg-rose-700 text-base font-semibold"
                    >
                        Đóng
                    </button>
                </div>
            </Modal>

            {/* Lightbox xem ảnh lớn */}
            <Lightbox
                open={openLightbox}
                close={() => setOpenLightbox(false)}
                index={photoIndex}
                slides={photos}
                plugins={[Thumbnails]}
                portal={{ root: typeof document !== 'undefined' ? document.body : undefined }}
            />
        </>
    );
}
