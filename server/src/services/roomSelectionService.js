// D:\QUAN LY KHACH SAN\server\src\services\roomSelectionService.js
const { prisma } = require('../db/prisma');

/**
 * Hàm phân tích tiêu chí khách hàng và đề xuất các loại phòng phù hợp nhất.
 * Nó thực hiện Lọc, Chấm điểm và Sắp xếp.
 * * @param {number} paxCount - Số lượng người (Int).
 * @param {string | undefined} amenityKeywords - Các tiện nghi, cách nhau bởi dấu phẩy (ví dụ: "bữa sáng, yên tĩnh").
 * @param {string | undefined} priceRange - Khoảng ngân sách (ví dụ: "dưới 1 triệu", "trung bình").
 * @returns {Promise<Array<Object>>} Danh sách các loại phòng được chấm điểm và sắp xếp.
 */
async function suggestRooms(paxCount, amenityKeywords, priceRange) {
    const FIXED_HT_MA = 1; // Hình thức thuê: Ngày
    const FIXED_TD_MA = 1; // Thời điểm: Cơ bản

    // --- 1. Chuẩn hóa Tiêu chí ---
    const requiredPax = paxCount || 1; // Mặc định 1 người nếu không có

    // Chuẩn hóa keywords thành mảng, loại bỏ khoảng trắng và chuyển về chữ thường
    const keywords = amenityKeywords
        ? amenityKeywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k.length > 0)
        : [];

    // Chuyển priceRange thành MaxPrice (ví dụ: "dưới 2 triệu" => 2000000)
    let maxPrice = Infinity;
    if (priceRange) {
        if (priceRange.includes('triệu')) {
            const match = priceRange.match(/dưới\s*(\d+)/i);
            if (match) {
                maxPrice = parseInt(match[1]) * 1000000;
            }
        }
        // Thêm các logic xử lý "rẻ" hay "cao cấp" sau
    }

    // --- 2. Truy vấn tất cả loại phòng phù hợp (Lọc cứng theo số người) ---
    const eligibleRooms = await prisma.lOAI_PHONG.findMany({
        where: {
            LP_SONGUOI: { gte: requiredPax } // Chỉ lấy phòng đủ chỗ cho số người yêu cầu
        },
        include: {
            // Lấy giá cơ bản (HT_MA=1, TD_MA=1)
            DON_GIA: {
                where: {
                    HT_MA: FIXED_HT_MA,
                    TD_MA: FIXED_TD_MA
                },
                select: {
                    DG_DONGIA: true
                }
            },
            // Lấy tiện nghi
            TRANGBI_TIENNGHI: {
                include: {
                    TIEN_NGHI: {
                        select: { TN_TEN: true } // Tên tiện nghi
                    }
                }
            }
        }
    });

    // --- 3. Chấm điểm (Scoring) và Phân tích ---
    const scoredRooms = eligibleRooms.map(room => {
        let score = 0;
        let reasons = [];

        const priceData = room.DON_GIA[0];
        const roomPrice = priceData ? parseFloat(priceData.DG_DONGIA) : null;
        const roomName = room.LP_TEN;
        const roomPax = room.LP_SONGUOI;

        // A. Lọc theo Ngân sách (Nếu có)
        if (roomPrice && roomPrice > maxPrice) {
            return null; // Loại bỏ phòng vượt quá ngân sách cứng
        }

        // B. Tiêu chí 1: Độ phù hợp số người (Tối ưu hóa)
        if (roomPax === requiredPax) {
            score += 5; // Điểm cao nếu vừa đủ chỗ
            reasons.push(`Vừa đủ cho ${requiredPax} người.`);
        } else if (roomPax > requiredPax) {
            score += 2; // Điểm thấp hơn nếu thừa chỗ (ví dụ: 4 người ở phòng 6 người)
            reasons.push(`Đủ chỗ (${roomPax} người), có thể rộng rãi hơn.`);
        }

        // C. Tiêu chí 2: Tiện nghi Khớp
        const roomAmenities = room.TRANGBI_TIENNGHI.map(t => t.TIEN_NGHI.TN_TEN.toLowerCase());

        keywords.forEach(keyword => {
            // Check Tiện nghi chính thức
            if (roomAmenities.includes(keyword)) {
                score += 8;
                reasons.push(`Có tiện nghi: ${keyword}.`);
            }
            // Check trong Tên phòng/Mô tả cứng (ví dụ: "bữa sáng")
            else if (keyword.includes("bữa sáng") && roomName.includes("Sang Trọng")) {
                score += 8;
                reasons.push("Có kèm bữa sáng (theo thông tin phòng).");
            }
        });

        // D. Tiêu chí 3: Giá (Ưu tiên)
        if (roomPrice && priceRange) {
            score += 3;
            reasons.push(`Giá ${roomPrice.toLocaleString('vi-VN')} VND nằm trong ngân sách.`);
        }

        // Trả về đối tượng kết quả
        return {
            roomName,
            pax: roomPax,
            price: roomPrice,
            score,
            reasons,
        };
    }).filter(r => r !== null); // Lọc bỏ những phòng bị loại vì quá ngân sách

    // --- 4. Sắp xếp và Giới hạn ---
    const finalSuggestions = scoredRooms
        .sort((a, b) => b.score - a.score) // Sắp xếp giảm dần theo điểm
        .slice(0, 3); // Chỉ lấy Top 3 gợi ý

    return finalSuggestions;
}

module.exports = {
    suggestRooms,
};