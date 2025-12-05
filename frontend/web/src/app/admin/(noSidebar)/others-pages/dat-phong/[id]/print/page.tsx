'use client';
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import Image from 'next/image';

function vnd(n: number) {
    return Number(n || 0).toLocaleString('vi-VN');
}
function fmt(iso?: string | Date) {
    if (!iso) return '—';
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    if (Number.isNaN(+d)) return '—';
    return d.toLocaleString('vi-VN', { hour12: false });
}

export default function BookingPrintPage() {
    const { id } = useParams() as { id: string };
    const [bk, setBk] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/bookings/${id}`, { params: { _: Date.now() } });
                setBk(data);
            } catch (e: any) {
                alert(e?.response?.data?.message || 'Không tải được phiếu đặt phòng');
            } finally {
                setLoading(false);
                setTimeout(() => {
                    let printed = false;

                    // Khi hộp thoại in đóng hoặc người dùng quay lại focus, quay về trang chi tiết
                    const backToDetail = () => {
                        if (!printed) {
                            printed = true;
                            window.location.href = `/admin/others-pages/chi-tiet/${id}`;
                        }
                    };

                    // Dùng cả hai cách để đảm bảo Chrome/Edge/Firefox đều chạy
                    window.onafterprint = backToDetail;
                    window.addEventListener('focus', backToDetail, { once: true });

                    // Mở hộp thoại in
                    window.print();
                }, 300);

            }
        })();
    }, [id]);

    if (loading || !bk)
        return <div className="p-6 text-slate-500">Đang tải phiếu đặt phòng…</div>;

    const kh = bk.KHACH_HANG ?? {};
    const rawRooms = bk.CHI_TIET_SU_DUNG ?? [];
    const staff = bk.NHAN_VIEN ?? null;
    // Gom chi tiết sử dụng theo từng phòng
    const groupedRooms = new Map<number, { room: any; count: number }>();

    rawRooms.forEach((r: any) => {
        const key = r.PHONG_MA;
        const prev = groupedRooms.get(key);
        if (prev) {
            prev.count += 1; // mỗi dòng = 1 ngày
        } else {
            groupedRooms.set(key, { room: r, count: 1 });
        }
    });

    const rooms = Array.from(groupedRooms.values());

    const total = Number(bk?.HDONG_TONGTIENDUKIEN ?? 0);
    const deposit = Number(bk?.HDONG_TIENCOCYEUCAU ?? 0);
    const remain = Math.max(0, total - deposit);

    return (
        <>
            <title>Phiếu đặt phòng</title>
        <div className="mx-auto my-6 w-[840px] bg-white p-8 text-[13px] text-slate-800 print:m-0 print:w-full print:p-0">
            {/* Header */}
            <div className="mb-4 text-center">
                <Image
                    src="/images/logo/logo-5.png"
                    alt="Logo"
                    width={150}
                    height={40}
                    className="mx-auto"
                    priority
                />
                <div className="mt-2 font-semibold">Khách sạn Wendy</div>
                <div className="text-2xl font-extrabold tracking-wide">PHIẾU ĐẶT PHÒNG</div>
                <div className="mt-1 text-sm opacity-70">
                    Mã hợp đồng: {bk.HDONG_MA} &nbsp;•&nbsp; Ngày tạo:{' '}
                    {fmt(bk.HDONG_TAO_LUC || bk.createdAt)}&nbsp;•&nbsp; Nhân viên:{' '}
                    {staff.NV_HOTEN || '—'}
                </div>
                <div className="opacity-70">
                    ĐC: Khu II, Đ. 3 Tháng 2, Xuân Khánh, Ninh Kiều, Cần Thơ | SDT: 0123456789
                </div>
            </div>

            {/* Thông tin KH / Booking */}
            <div className="mt-4 grid grid-cols-2 gap-6">
                <div>
                    <div>
                        <span className="opacity-70">Khách hàng:</span>{' '}
                        <b>{kh.KH_HOTEN || '—'}</b>
                    </div>
                    {kh.KH_SDT && (
                        <div>
                            <span className="opacity-70">SĐT:</span> {kh.KH_SDT}
                        </div>
                    )}
                    {kh.KH_DIACHI && (
                        <div>
                            <span className="opacity-70">Địa chỉ:</span> {kh.KH_DIACHI}
                        </div>
                    )}
                </div>
                <div className="text-right">
                    <div>
                        <span className="opacity-70">Ngày nhận:</span>{' '}
                        {fmt(bk.HDONG_NGAYDAT)}
                    </div>
                    <div>
                        <span className="opacity-70">Ngày trả:</span>{' '}
                        {fmt(bk.HDONG_NGAYTRA)}
                    </div>
                </div>
            </div>

            {/* Danh sách phòng */}
            <table className="mt-6 w-full border-collapse">
                <thead>
                    <tr className="border-y">
                        <th className="py-2 text-left">Nội dung</th>
                        <th className="py-2 w-16 text-right">SL</th>
                        <th className="py-2 w-28 text-right">Đơn giá</th>
                        <th className="py-2 w-32 text-right">Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    {rooms.map(({ room, count }, i) => {
                        const loaiPhong = room.PHONG?.LOAI_PHONG?.LP_TEN || '—';
                        const phong = room.PHONG?.PHONG_TEN || `Phòng ${room.PHONG_MA}`;
                        const hinhThuc = bk.HINH_THUC_THUE?.HT_TEN || '—';
                        const tu = bk.HDONG_NGAYDAT;
                        const den = bk.HDONG_NGAYTRA;
                        const soLuong = count; // 👈 số dòng CTSD = số ngày
                        const donGia = Number(room.CTSD_DON_GIA || 0);
                        const thanhTien = soLuong * donGia;

                        return (
                            <tr key={i} className="border-b">
                                <td className="py-2">
                                    <div className="font-medium">{loaiPhong}</div>
                                    <div className="text-xs text-gray-500">
                                        ({hinhThuc}) - {phong} <br />
                                        {fmt(tu)} → {fmt(den)}
                                    </div>
                                </td>
                                <td className="py-2 text-right">{soLuong}</td>
                                <td className="py-2 text-right tabular-nums">{vnd(donGia)}</td>
                                <td className="py-2 text-right tabular-nums font-medium">{vnd(thanhTien)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>



            {/* Tổng hợp */}
            <div className="mt-4 grid grid-cols-[1fr_auto] items-start">
                <div />
                <div className="inline-grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 min-w-[260px]">
                    <span className="opacity-70">Thành tiền:</span>{' '}
                    <span className="text-right tabular-nums font-semibold">
                        {vnd(total)}
                    </span>
                    <span className="opacity-70">Tiền cọc:</span>{' '}
                    <span className="text-right tabular-nums">-{vnd(deposit)}</span>
                    <span className="opacity-70 font-semibold">Tổng cộng:</span>{' '}
                    <span className="text-right tabular-nums font-semibold">
                        {vnd(remain)}
                    </span>
                </div>
            </div>

            {/* <div className="mt-10 grid grid-cols-3 text-center text-sm">
                <div>
                    Người lập
                    <div className="mt-10 font-medium">{bk.STAFF?.NV_HOTEN || ' '}</div>
                </div>
                <div>Người đặt phòng</div>
                <div>Khách hàng</div>
            </div> */}

            <div className="mt-6 text-center text-xs text-gray-500 italic">
                Phiếu này dùng để xác nhận đặt phòng. Xin vui lòng mang theo khi đến nhận phòng.
            </div>

            <style jsx global>{`
        @media print {
          @page {
            margin: 12mm;
          }
          body {
            background: white;
          }
        }
      `}</style>
        </div>
        </>
    );
}
