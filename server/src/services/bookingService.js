// D:\QUAN LY KHACH SAN\server\src\services\bookingService.js

const { prisma } = require('../db/prisma');

/**
 * Kiểm tra đặt phòng của khách hàng
 * @param {string | undefined} guestName Tên khách hàng
 * @param {string | undefined} bookingCode Mã đặt phòng (ID_HOPDONG)
 * @returns {Promise<any | null>} Chi tiết đặt phòng (Hợp đồng)
 */
async function checkBookingStatus(guestName, bookingCode) {
    if (!guestName && !bookingCode) {
        return null;
    }

    const whereClause = {};

    if (bookingCode) {
        // Tìm theo Mã đặt phòng (ID_HOPDONG)
        // Vì ID_HOPDONG là Int, cần đảm bảo bookingCode là số
        const idHopDong = parseInt(bookingCode, 10);
        if (!isNaN(idHopDong)) {
            whereClause.HDONG_MA = idHopDong;
        } else {
            // Nếu bookingCode không phải là số hợp lệ
            return { error: `Mã đặt phòng '${bookingCode}' không hợp lệ. Vui lòng kiểm tra lại.` };
        }
    } else if (guestName) {
        // Tìm theo Tên khách hàng (Nếu không có mã đặt phòng)
        // Giả định tên khách hàng được lưu trong bảng KHACH_HANG
        whereClause.KHACH_HANG = {
            KH_HOTEN: {
                contains: guestName,
                // mode: 'insensitive'
            }
        };
    } else {
        return null;
    }

    if (!bookingCode && guestName) {
        whereClause.HDONG_TRANG_THAI = {
            in: ['CHECKED_IN', 'CONFIRMED'], // Chỉ tìm hợp đồng đang ở hoặc đã xác nhận
        };
    }

    // Giả định model đặt phòng là HOP_DONG
    const booking = await prisma.hOP_DONG_DAT_PHONG.findFirst({
        where: whereClause,
        // Bao gồm thông tin cần thiết để trả lời
        include: {
            KHACH_HANG: true,
            CHI_TIET_SU_DUNG: {
                include: {
                    PHONG: {
                        include: {
                            LOAI_PHONG: true
                        }
                    }
                }
            }
        },
        orderBy:[
            // ✅ BƯỚC MỚI: Ưu tiên hợp đồng đang CHECKED_IN
            { HDONG_TRANG_THAI: 'desc' }, // Đảm bảo 'CHECKED_IN' luôn xếp trên 'CONFIRMED'

            // ✅ BƯỚC MỚI: Sau đó, ưu tiên hợp đồng có ngày nhận phòng gần nhất
            { HDONG_NGAYTHUCNHAN: 'desc' },
            {HDONG_NGAYDAT: 'desc'}
        ]
    });

    return booking;
}

// D:\QUAN LY KHACH SAN\server\src\services\bookingService.js (Thêm hàm mới)

async function listPendingBookings(guestId) {
    if (!guestId) {
        return "Bạn cần đăng nhập để xem danh sách hợp đồng.";
    }

    const pendingBookings = await prisma.hOP_DONG_DAT_PHONG.findMany({
        where: {
            KH_MA: guestId,
            HDONG_TRANG_THAI: 'PENDING',
        },
        select: {
            HDONG_MA: true,
            HDONG_NGAYDAT: true,
            HDONG_NGAYTRA: true,
            HDONG_TONGTIENDUKIEN: true,
            HDONG_TIENCOCYEUCAU: true,
           
        },
        orderBy: {
            HDONG_MA: 'desc',
        },
    });

    if (pendingBookings.length === 0) {
        return "Quý khách không có hợp đồng nào đang ở trạng thái chờ thanh toán cọc (PENDING).";
    }

    const formattedList = pendingBookings.map(b => {
        const date = new Date(b.HDONG_NGAYDAT).toLocaleDateString('vi-VN');
        const total = new Intl.NumberFormat('vi-VN').format(b.HDONG_TONGTIENDUKIEN);
        const deposit = new Intl.NumberFormat('vi-VN').format(b.HDONG_TIENCOCYEUCAU);

        return `Mã HD: ${b.HDONG_MA} (Ngày đặt: ${date}) - Tiền cọc: ${deposit} đ (Tổng dự kiến: ${total} đ)`;
    }).join('\n');

    return `Tìm thấy ${pendingBookings.length} hợp đồng chờ thanh toán cọc:\n${formattedList}\n\nVui lòng cung cấp Mã HD để tiến hành thanh toán.`;
}


module.exports = {
    checkBookingStatus,
    listPendingBookings
};