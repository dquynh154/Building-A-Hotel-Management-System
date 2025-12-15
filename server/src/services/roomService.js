// D:\QUAN LY KHACH SAN\server\src\services\roomService.js
const { prisma } = require('../db/prisma');

// Các trạng thái HĐ đang giữ phòng
const HOLD_STATUSES = ['CONFIRMED', 'CHECKED_IN'];

/**
 * Lấy số lượng phòng trống theo loại phòng trong một khoảng ngày (Đã được tăng cường).
 * @param {Date} fromDate - Ngày bắt đầu nhận phòng (ví dụ: 2025-11-13 00:00:00).
 * @param {Date} toDate - Ngày trả phòng (ngày tiếp theo) (ví dụ: 2025-11-14 00:00:00).
 * @param {string} roomTypeKeyword - Tên loại phòng (Ví dụ: "Phòng 2 giường đơn").
 * @returns {number} Số lượng phòng trống.
 * @returns {{price: Decimal, roomName: string} | null}
*/
// async function getAvailableRoomCount(fromDate, toDate, roomTypeKeyword) {
//     // 1. Lấy mã các PHÒNG đang bận bởi bất kỳ HĐ nào overlap với [fromDate, toDate)
//     // Lưu ý: Logic này giả định bạn có bảng CHI_TIET_SU_DUNG và HOP_DONG_DAT_PHONG
//     // Nếu bạn chỉ có PHONG_TRANGTHAI, logic sẽ đơn giản hơn.

//     // Logic của bạn:
//     const availableRooms = await prisma.pHONG.findMany({
//         where: {
//             LOAI_PHONG: {
//                 // Sử dụng 'mode: insensitive' để đảm bảo tìm kiếm không phân biệt chữ hoa/thường
//                 LP_TEN: { contains: roomTypeKeyword },
//             },
//             // PHONG_TRANGTHAI: "AVAILABLE",
//             PHONG_TRANGTHAI: {
//                 notIn: ["MAINTENANCE"]},
//             // PHONG không bị CHI_TIET_SU_DUNG chặn trong khoảng [fromDate, toDate)
//             CHI_TIET_SU_DUNG: {
//                 none: {
//                     // PHONG bị bận nếu: NGAY_TRA > fromDate VÀ NGAY_DAT < toDate
//                     HOP_DONG_DAT_PHONG: {
//                         HDONG_TRANG_THAI: { in: HOLD_STATUSES },
//                         HDONG_NGAYDAT: { lt: toDate }, // Ngày đặt < Ngày trả phòng
//                         HDONG_NGAYTRA: { gt: fromDate }, // Ngày trả > Ngày bắt đầu
//                     },
//                 },
//             },
//         },
//     });

//     return availableRooms.length;
// }

async function getAvailableRoomCount(fromDate, toDate, roomTypeKeyword) {
    // chuẩn hóa ngày để so sánh CTSD_NGAY_DA_O (đang lưu kiểu 05:00 UTC cũng ok)
    const fromDay = new Date(fromDate);
    fromDay.setHours(0, 0, 0, 0);

    const toDay = new Date(toDate);
    toDay.setHours(0, 0, 0, 0);

    const BUSY_CTSD_STATUSES = ['ACTIVE']; // không tính DOI_PHONG

    const availableRooms = await prisma.pHONG.findMany({
        where: {
            LOAI_PHONG: {
                LP_TEN: { contains: roomTypeKeyword },
            },
            PHONG_TRANGTHAI: { notIn: ['MAINTENANCE'] },

            // phòng rảnh khi KHÔNG có bất kỳ CTSD "bận" nào giao với khoảng hỏi
            CHI_TIET_SU_DUNG: {
                none: {
                    CTSD_TRANGTHAI: { in: BUSY_CTSD_STATUSES },
                    OR: [
                        // bận theo ngày (đặt theo ngày / CTSD_NGAY_DA_O có giá trị)
                        {
                            CTSD_NGAY_DA_O: {
                                gte: fromDay,
                                lt: toDay,
                            },
                        },
                        // bận theo giờ (đặt theo giờ / có khoảng giờ)
                        {
                            AND: [
                                { CTSD_O_TU_GIO: { lt: toDate } },
                                { CTSD_O_DEN_GIO: { gt: fromDate } },
                            ],
                        },
                    ],
                },
            },
        },
        select: { PHONG_MA: true },
    });

    return availableRooms.length;
}


// Bổ sung thêm hàm price (Ví dụ)
async function getRoomPrice(roomTypeKeyword) {
    // Các ID cố định theo yêu cầu của bạn
    const FIXED_HT_MA = 1; // Hình thức thuê: Ngày
    const FIXED_TD_MA = 1; // Thời điểm: Cơ bản

    try {
        const roomPriceData = await prisma.dON_GIA.findFirst({
            where: {
                // 1. Tìm LOAI_PHONG_MA bằng từ khóa
                LOAI_PHONG: {
                    LP_TEN: { contains: roomTypeKeyword },
                },
                // 2. Lọc theo Hình thức cố định
                HT_MA: FIXED_HT_MA,
                // 3. Lọc theo Thời điểm cố định
                TD_MA: FIXED_TD_MA,
            },
            select: {
                DG_DONGIA: true,
                LOAI_PHONG: {
                    select: { LP_TEN: true }
                }
            }
        });

        if (roomPriceData) {
            return {
                price: roomPriceData.DG_DONGIA,
                roomName: roomPriceData.LOAI_PHONG.LP_TEN
            };
        }

        return null;

    } catch (error) {
        console.error("Lỗi khi truy vấn giá phòng:", error);
        return null;
    }
}


module.exports = {
    getAvailableRoomCount,
    getRoomPrice,
};