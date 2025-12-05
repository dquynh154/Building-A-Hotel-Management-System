// D:\QUAN LY KHACH SAN\server\src\services\hotelInteractionService.js
const { prisma } = require('../db/prisma');

// Các trạng thái HĐ đang giữ phòng
const CHECKED_IN = 'CHECKED_IN';

/**
 * 🛠️ BƯỚC 1: Tìm Hợp đồng và Phòng đang CHECKED_IN của khách hàng.
 * @param {number} guestId - Mã khách hàng (KH_MA)
 * @returns {Promise<{hdongMa: number, phongMa: number} | null>}
 */
async function findActiveBookingDetails(guestId) {
    // 1. Tìm Hợp đồng CHECKED_IN gần nhất của khách
    const activeBooking = await prisma.hOP_DONG_DAT_PHONG.findMany({
        where: {
            KH_MA: guestId,
            HDONG_TRANG_THAI: CHECKED_IN,
        },
        // 2. Lấy thông tin phòng đang sử dụng
        include: {
            CHI_TIET_SU_DUNG: {
                where: {
                    CTSD_TRANGTHAI: 'ACTIVE' // Chi tiết sử dụng đang hoạt động
                },
                select: {
                    PHONG_MA: true,
                    PHONG: {
                        select: {
                            PHONG_TEN: true // Lấy Số phòng để hỏi lại khách
                        }
                    }
                },
            }
        }
    });

    const activeRooms = [];

    // Thu thập chi tiết tất cả các phòng đang hoạt động
    activeBooking.forEach(booking => {
        booking.CHI_TIET_SU_DUNG.forEach(ctsd => {
            if (ctsd.PHONG) {
                activeRooms.push({
                    hdongMa: booking.HDONG_MA,
                    phongMa: ctsd.PHONG_MA,
                    phongTen: ctsd.PHONG.PHONG_TEN // ✅ SỬA: Dùng PHONG_TEN
                });
            }
        });
    });

    if (activeRooms.length === 0) {
        return null;
    }

    return activeRooms;
}
function normalizeRepairKeyword(keyword) {
    const repairKeywords = ['hỏng', 'hư', 'không lạnh', 'không hoạt động', 'lỗi', 'cháy'];
    // Nếu từ khóa của khách chứa từ chỉ sự cố VÀ có đề cập đến đồ dùng
    if (repairKeywords.some(k => keyword.toLowerCase().includes(k))) {
        return "Sửa chữa"; // ✅ Trả về tên dịch vụ cố định
    }
    return keyword; // Nếu không phải sửa chữa, giữ nguyên từ khóa gốc
}

/**
 * 🛠️ BƯỚC 1: Tìm Hợp đồng và Phòng đang CHECKED_IN của khách hàng.
 * @param {number} guestId - Mã khách hàng (KH_MA)
 * @returns {Promise<Array<{hdongMa: number, phongMa: number, phongTen: string, ctsdStt: number}>>}
 */
async function findActiveBookingDetails(guestId) {
    // ... (Code cũ)
    const activeBooking = await prisma.hOP_DONG_DAT_PHONG.findMany({
        where: {
            KH_MA: guestId,
            HDONG_TRANG_THAI: CHECKED_IN,
        },
        include: {
            CHI_TIET_SU_DUNG: {
                where: {
                    CTSD_TRANGTHAI: 'ACTIVE' // Chi tiết sử dụng đang hoạt động
                },
                select: {
                    PHONG_MA: true,
                    CTSD_STT: true, // ✅ Lấy CTSD_STT (rất quan trọng cho PK)
                    PHONG: {
                        select: {
                            PHONG_TEN: true // Lấy Số phòng để hỏi lại khách
                        }
                    }
                },
            }
        }
    });

    const activeRooms = [];

    // Thu thập chi tiết tất cả các phòng đang hoạt động
    activeBooking.forEach(booking => {
        booking.CHI_TIET_SU_DUNG.forEach(ctsd => {
            if (ctsd.PHONG) {
                activeRooms.push({
                    hdongMa: booking.HDONG_MA,
                    phongMa: ctsd.PHONG_MA,
                    phongTen: ctsd.PHONG.PHONG_TEN,
                    ctsdStt: ctsd.CTSD_STT, // ✅ Thêm CTSD_STT vào kết quả trả về
                });
            }
        });
    });

    if (activeRooms.length === 0) {
        return null;
    }

    return activeRooms;
}


/**
 * 🛠️ BƯỚC 2: Gửi yêu cầu dịch vụ (Tạo bản ghi CTDV ở trạng thái PENDING).
 * @param {number} guestId - Mã khách hàng (KH_MA).
 * @param {string} itemKeyword - Từ khóa dịch vụ.
 * @param {number} quantity - Số lượng.
 * @param {string | null} roomNumber - Số phòng khách chỉ định.
 * @returns {Promise<string>} Thông báo xác nhận.
 */
async function addServiceToBooking(guestId, itemKeyword, quantity = 1, roomNumber = null) {
    // 1. Tìm thông tin đặt phòng đang hoạt động
    const bookingDetails = await findActiveBookingDetails(guestId);

    if (!bookingDetails || bookingDetails.length === 0) {
        return "Rất tiếc, tôi không thể xác định đặt phòng đang hoạt động của quý khách để gửi yêu cầu này.";
    }

    // 2. Xác định phòng mục tiêu (Giữ nguyên logic phức tạp)
    let targetRoom = null;
    const roomNumberStr = roomNumber ? String(roomNumber) : null;
    const normalizedRoomNumber = roomNumberStr
        ? roomNumberStr.toLowerCase().replace(/phòng\s*/, '').trim()
        : null;

    if (normalizedRoomNumber) {
        targetRoom = bookingDetails.find(r => {
            const dbPhongTen = r.phongTen ? r.phongTen.toLowerCase().replace(/phòng\s*/, '').trim() : null;
            return dbPhongTen && dbPhongTen === normalizedRoomNumber;
        });

        if (!targetRoom) {
            return "Hiện tại bạn không lưu trú ở phòng này. Vui lòng kiểm tra lại số phòng hoặc liên hệ Lễ tân để được hỗ trợ.";
        }
    }

    if (bookingDetails.length > 1 && !targetRoom) {
        const roomNames = bookingDetails.map(r => r.phongTen).join(', ');
        return `Quý khách hiện đang có nhiều phòng đang hoạt động (${roomNames}). Vui lòng **chỉ rõ Số phòng** (ví dụ: "Phòng 101") mà quý khách muốn yêu cầu dịch vụ.`;
    }

    if (!targetRoom) {
        targetRoom = bookingDetails[0];
    }
    const { hdongMa, phongMa, ctsdStt } = targetRoom; // ✅ Lấy ctsdStt

    // 3. Tìm mã Dịch vụ (DV_MA) và Đơn giá (DV_DONGIA) từ DB
    const normalizedKeyword = normalizeRepairKeyword(itemKeyword);
    const service = await prisma.dICH_VU.findFirst({
        where: {
            DV_TEN: {
                equals: normalizedKeyword,
            }
        }
    });

    if (!service) {
        return `Tôi xin lỗi, tôi không tìm thấy dịch vụ/tiện ích '${itemKeyword}' trong danh mục. Vui lòng hỏi lại.`;
    }

    // 4. Tính toán giá và tìm STT lớn nhất (giữ nguyên)
    const unitPrice = parseFloat(service.DV_DONGIA);
    const totalAmount = unitPrice * quantity;

    // Tìm CTDV_STT lớn nhất (trong phạm vi Hợp đồng)
    const maxStt = await prisma.cHI_TIET_DICH_VU.aggregate({
        where: { HDONG_MA: hdongMa },
        _max: { CTDV_STT: true }
    });
    const newCtdvStt = (maxStt._max.CTDV_STT || 0) + 1; // ✅ Đổi tên biến

    // 5. Ghi nhận YÊU CẦU DỊCH VỤ vào CHI_TIET_DICH_VU với trạng thái PENDING
    await prisma.cHI_TIET_DICH_VU.create({
        data: {
            HDONG_MA: hdongMa,
            PHONG_MA: phongMa,
            CTSD_STT: ctsdStt, // ✅ Dùng CTSD_STT đã tìm được
            DV_MA: service.DV_MA,
            CTDV_STT: newCtdvStt, // ✅ Dùng CTDV_STT mới

            CTDV_NGAY: new Date(), // Ngày yêu cầu
            CTDV_SOLUONG: quantity,
            CTDV_DONGIA: service.DV_DONGIA,
            CTDV_GHICHU: itemKeyword,
            CTDV_TRANGTHAI: 'PENDING', // ✅ TRẠNG THÁI MỚI: CHỜ DUYỆT
            CTDV_FROM: 'CHATBOT'
        }
    });

    console.log(`✅ [DB COMMIT]: Đã tạo yêu cầu DV_MA=${service.DV_MA} (SL: ${quantity}) vào HDONG_MA=${hdongMa} - TRẠNG THÁI PENDING`);

    const formattedAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(totalAmount);

    // 6. Trả về thông báo xác nhận đã gửi yêu cầu
    return `Yêu cầu dịch vụ '${itemKeyword}' (SL: ${quantity}) đã được ghi nhận. Yêu cầu này cần được Lễ tân chấp thuận và sẽ được phục vụ ngay sau đó.`;
}

module.exports = {
    addServiceToBooking,
};