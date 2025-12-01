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
            KH_TEN: {
                contains: guestName,
                mode: 'insensitive'
            }
        };
    } else {
        return null;
    }

    // Giả định model đặt phòng là HOP_DONG
    const booking = await prisma.HOP_DONG.findFirst({
        where: whereClause,
        // Bao gồm thông tin cần thiết để trả lời
        include: {
            KHACH_HANG: true,
            CHI_TIET_SU_DUNG_PHONG: {
                include: {
                    PHONG: {
                        include: {
                            LOAIPHONG: true
                        }
                    }
                }
            }
        },
        orderBy: {
            HDONG_NGAY_DEN: 'desc' // Lấy đặt phòng gần nhất
        }
    });

    return booking;
}

module.exports = {
    checkBookingStatus,
};