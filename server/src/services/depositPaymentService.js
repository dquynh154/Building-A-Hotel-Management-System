// D:\QUAN LY KHACH SAN\server\src\services\depositPaymentService.js

const { prisma } = require('../db/prisma');

// Các trạng thái HĐ và TT
const PENDING_STATUS = 'PENDING';
const INITIATED_TT = ['INITIATED','FAILED'];
const SUCCEEDED_TT = 'SUCCEEDED';
const CONFIRMED_HDONG = 'CONFIRMED';
const DEPOSIT_HDON = 'DEPOSIT';

/**
 * 🛠️ Xử lý hoàn tất thanh toán cọc: Tìm HĐ PENDING, tìm HĐON DEPOSIT, 
 * nếu chưa thanh toán: trả về link, nếu đã thanh toán: cập nhật trạng thái HĐ.
 * @param {number} guestId - Mã khách hàng (KH_MA).
 * @param {string} bookingCode - Mã hợp đồng (HDONG_MA) khách hàng cung cấp.
 * @param {string} paymentMethod - Phương thức thanh toán (BANK_QR, CARD, v.v.).
 * @returns {Promise<{status: 'SUCCESS' | 'NEEDS_PAYMENT' | 'ERROR', message: string, hdonMa: number | null, amount: number | null, email: string | null}>}
 */
async function handleDepositPaymentUpdate(guestId, bookingCode, paymentMethod) {
    const hdongMa = parseInt(bookingCode, 10);
    if (isNaN(hdongMa)) {
        return { status: 'ERROR', message: `Mã hợp đồng '${bookingCode}' không hợp lệ. Vui lòng kiểm tra lại.`, hdonMa: null, amount: null, email: null };
    }

    try {
        // 1. TÌM VÀ XÁC THỰC HỢP ĐỒNG (HD)
        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: hdongMa, KH_MA: guestId },
            include: {
                KHACH_HANG: true, // Cần lấy email khách hàng
                LIEN_KET: { // Tìm liên kết đến Hóa đơn
                    include: {
                        HOA_DON: {
                            include: {
                                THANH_TOAN: true // Bao gồm cả chi tiết Thanh toán
                            }
                        }
                    }
                }
            }
        });

        console.log("DEBUG: Dữ liệu Booking (HDONG_MA:", hdongMa, "):", JSON.stringify(booking, null, 2));

        if (!booking) {
            return { status: 'ERROR', message: `Không tìm thấy hợp đồng ${bookingCode} của bạn.`, hdonMa: null, amount: null, email: null };
        }
        if (booking.HDONG_TRANG_THAI !== PENDING_STATUS) {
            return {
                status: 'SUCCESS', // Dùng SUCCESS để chatbot trả lời tự nhiên
                message: `Hợp đồng ${bookingCode} đã ở trạng thái ${booking.HDONG_TRANG_THAI}. Không cần thanh toán cọc nữa.`,
                hdonMa: null, amount: null, email: null
            };
        }

        // 2. TÌM HÓA ĐƠN CỌC (DEPOSIT INVOICE)
        const depositInvoiceLink = booking.LIEN_KET.find(link =>
            link.HOA_DON.HDON_LOAI === DEPOSIT_HDON
        );

        if (!depositInvoiceLink) {
            return {
                status: 'ERROR',
                message: `Không tìm thấy Hóa đơn cọc (DEPOSIT) được tạo sẵn cho hợp đồng ${bookingCode}. Vui lòng liên hệ Lễ tân.`,
                hdonMa: null, amount: null, email: null
            };
        }

        const invoice = depositInvoiceLink.HOA_DON;
        const formattedAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(invoice.HDON_THANH_TIEN);

        // 3. TÌM BẢN GHI THANH TOÁN (TT) Ở TRẠNG THÁI 'INITIATED'
        const paymentRecord = invoice.THANH_TOAN.find(tt =>
            tt.TT_TRANG_THAI_GIAO_DICH === INITIATED_TT
        );

        if (paymentRecord) {
            // Trường hợp 1: Hợp đồng PENDING, Hóa đơn DEPOSIT tồn tại, Thanh toán INITIATED tồn tại
            // => Cần tạo link để khách hàng hoàn tất thanh toán
            return {
                status: 'NEEDS_PAYMENT', // Dùng status này để kích hoạt tạo link
                message: `Hợp đồng ${bookingCode} của bạn đang chờ thanh toán cọc ${formattedAmount}.`,
                hdonMa: invoice.HDON_MA,
                amount: Number(invoice.HDON_THANH_TIEN),
                email: booking.KHACH_HANG.KH_EMAIL || "khachhang@example.com" // Cung cấp email để pay-mock hoạt động
            };
        }

        // Trường hợp 2: Thanh toán đã hoàn tất (Initiated không còn, nhưng HĐ vẫn PENDING, có thể là lỗi nghiệp vụ)
        // Chúng ta sẽ giả định rằng nếu không tìm thấy bản ghi INITIATED, thì cần tạo lại hoặc báo lỗi.
        return {
            status: 'ERROR',
            message: `Không tìm thấy giao dịch thanh toán đang chờ (${INITIATED_TT}) cho Hóa đơn cọc. Vui lòng liên hệ Lễ tân.`,
            hdonMa: null, amount: null, email: null
        };


    } catch (error) {
        console.error("❌ Lỗi nghiệp vụ khi cập nhật thanh toán cọc:", error);
        return { status: 'ERROR', message: "Đã xảy ra lỗi hệ thống khi xử lý giao dịch. Vui lòng liên hệ Lễ tân.", hdonMa: null, amount: null, email: null };
    }
}

module.exports = {
    handleDepositPaymentUpdate,
};