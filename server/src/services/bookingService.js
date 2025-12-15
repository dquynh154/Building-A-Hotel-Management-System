// D:\QUAN LY KHACH SAN\server\src\services\bookingService.js

const { prisma } = require('../db/prisma');

/**
 * Kiểm tra đặt phòng của khách hàng
 * @param {string | undefined} guestName Tên khách hàng
 * @param {string | undefined} bookingCode Mã đặt phòng (ID_HOPDONG)
 * @returns {Promise<any | null>} Chi tiết đặt phòng (Hợp đồng)

 * 🛠️ Xuất thông tin biên lai nhận phòng
 * @param {number} guestId - ID khách hàng từ session
 */
async function getCheckInReceipt(guestId, bookingCode = null) {
    const whereClause = {
        HDONG_TRANG_THAI: 'CONFIRMED' // Chỉ lấy các đơn đã xác nhận
    };

    // Nếu có guestId từ session, ràng buộc chỉ lấy đơn của người đó
    if (guestId) {
        whereClause.KH_MA = Number(guestId);
    }

    // Nếu khách cung cấp mã cụ thể, ưu tiên tìm theo mã
    if (bookingCode) {
        whereClause.HDONG_MA = parseInt(bookingCode, 10);
    }

    const booking = await prisma.hOP_DONG_DAT_PHONG.findFirst({
        where: whereClause,
        include: {
            KHACH_HANG: true,
            CT_DAT_TRUOC: { include: { LOAI_PHONG: true } }, // Lấy thông tin loại phòng đã đặt
            LIEN_KET: { include: { HOA_DON: true } } // Lấy thông tin hóa đơn cọc
        },
        orderBy: { HDONG_NGAYDAT: 'desc' }
    });

    if (!booking) return null;

    // Tính toán số tiền cọc đã thanh toán từ hóa đơn DEPOSIT
    const depositInvoice = booking.LIEN_KET.find(l => l.HOA_DON.HDON_LOAI === 'DEPOSIT');

    return {
        bookingId: booking.HDONG_MA,
        customerName: booking.KHACH_HANG.KH_HOTEN,
        checkIn: booking.HDONG_NGAYDAT,
        checkOut: booking.HDONG_NGAYTRA,
        rooms: booking.CT_DAT_TRUOC.map(ct => `${ct.SO_LUONG}x ${ct.LOAI_PHONG.LP_TEN}`),
        depositPaid: depositInvoice ? depositInvoice.HOA_DON.HDON_THANH_TIEN : 0,
        status: booking.HDONG_TRANG_THAI
    };
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


async function getPriceForDay(tx, lpMa, atDateTime) {
    const sp = await tx.$queryRaw`
        SELECT MIN(g.DG_DONGIA) AS PRICE
        FROM DON_GIA g
        JOIN THOI_DIEM t ON t.TD_MA = g.TD_MA
        JOIN THOI_DIEM_SPECIAL s ON s.TD_MA = t.TD_MA
        WHERE g.HT_MA = 1 AND g.LP_MA = ${lpMa}
          AND s.TD_NGAY_BAT_DAU <= ${atDateTime}
          AND s.TD_NGAY_KET_THUC >= ${atDateTime}
    `;
    let price = Number(sp?.[0]?.PRICE || 0);
    if (!price) {
        const base = await tx.$queryRaw`
            SELECT MIN(g.DG_DONGIA) AS PRICE FROM DON_GIA g
            JOIN THOI_DIEM t ON t.TD_MA = g.TD_MA
            WHERE g.HT_MA = 1 AND g.LP_MA = ${lpMa} AND t.TD_MA = 1
        `;
        price = Number(base?.[0]?.PRICE || 0);
    }
    return price;
}

function makeCheckInUTC(ymd) {
    const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 7, 0, 0)); // 14:00 VN = 07:00 UTC
}
function makeCheckOutUTC(ymd) {
    const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 5, 0, 0)); // 12:00 VN = 05:00 UTC
}

async function createBookingFromChatbot(guestId, details) {
    const { date_from, date_to, room_type, quantity = 1 } = details;
    const qtyNeed = Number(quantity);

    // Chuẩn hóa thời gian
    const checkinUtc = makeCheckInUTC(date_from);
    const checkoutUtc = makeCheckOutUTC(date_to);

    // Chuỗi format cho Raw Query
    const fromStr = checkinUtc.toISOString().slice(0, 19).replace('T', ' ');
    const toStr = checkoutUtc.toISOString().slice(0, 19).replace('T', ' ');

    return await prisma.$transaction(async (tx) => {
        // 1. Tìm Loại Phòng
        const loaiPhong = await tx.lOAI_PHONG.findFirst({
            where: { LP_TEN: { contains: room_type } }
        });
        if (!loaiPhong) throw new Error(`Không tìm thấy loại phòng: ${room_type}`);
        const lpMa = loaiPhong.LP_MA;

        // 2. KIỂM TRA PHÒNG TRỐNG (Inventory Check từ public.js)
        const totalRow = await tx.$queryRaw`SELECT COUNT(*) AS TOTAL FROM PHONG WHERE LP_MA = ${lpMa}`;
        const TOTAL = Number(totalRow?.[0]?.TOTAL || 0);

        const usedRow = await tx.$queryRaw`
            SELECT COUNT(DISTINCT P.PHONG_MA) AS USED
            FROM CHI_TIET_SU_DUNG CT
            JOIN HOP_DONG_DAT_PHONG H ON H.HDONG_MA = CT.HDONG_MA
            JOIN PHONG P ON P.PHONG_MA = CT.PHONG_MA
            WHERE P.LP_MA = ${lpMa}
              AND H.HDONG_TRANG_THAI IN ('PENDING','CONFIRMED','CHECKED_IN')
              AND COALESCE(H.HDONG_NGAYTHUCNHAN, H.HDONG_NGAYDAT) < ${toStr}
              AND COALESCE(H.HDONG_NGAYTHUCTRA,  H.HDONG_NGAYTRA)  > ${fromStr}
        `;
        const USED = Number(usedRow?.[0]?.USED || 0);

        const heldRow = await tx.$queryRaw`
            SELECT COALESCE(SUM(CT.SO_LUONG),0) AS HELD
            FROM CT_DAT_TRUOC CT
            JOIN HOP_DONG_DAT_PHONG H ON H.HDONG_MA = CT.HDONG_MA
            WHERE CT.LP_MA = ${lpMa}
              AND CT.TRANG_THAI IN ('CONFIRMED','ALLOCATED')
              AND H.HDONG_TRANG_THAI IN ('PENDING','CONFIRMED','CHECKED_IN') 
              AND COALESCE(H.HDONG_NGAYTHUCNHAN, H.HDONG_NGAYDAT) < ${toStr}
              AND COALESCE(H.HDONG_NGAYTHUCTRA,  H.HDONG_NGAYTRA)  > ${fromStr}
        `;
        const HELD = Number(heldRow?.[0]?.HELD || 0);

        const available = TOTAL - USED - HELD;
        if (available < qtyNeed) {
            throw new Error(`Loại phòng ${loaiPhong.LP_TEN} không đủ (còn ${available}).`);
        }

        // 3. Tính toán giá
        const nights = Math.max(1, Math.ceil((checkoutUtc - checkinUtc) / 86400000));
        let totalAmount = 0;
        const tileCoc = 20; // 20% theo yêu cầu mới của bạn

        for (let i = 0; i < nights; i++) {
            const d = new Date(checkinUtc);
            d.setUTCDate(d.getUTCDate() + i);
            const price = await getPriceForDay(tx, lpMa, d); // Gọi hàm tính giá theo ngày
            totalAmount += price * qtyNeed;
        }
        const depositAmount = totalAmount * (tileCoc / 100);

        // 4. Tạo Hợp đồng đặt phòng (PENDING)
        const newBooking = await tx.hOP_DONG_DAT_PHONG.create({
            data: {
                KH_MA: guestId,
                HT_MA: 1,
                HDONG_NGAYDAT: checkinUtc,
                HDONG_NGAYTRA: checkoutUtc,
                HDONG_TRANG_THAI: 'PENDING',
                HDONG_TIENCOCYEUCAU: depositAmount,
                HDONG_TONGTIENDUKIEN: totalAmount,
                HDONG_TILECOCAPDUNG: tileCoc,
                CT_DAT_TRUOC: {
                    create: {
                        LP_MA: lpMa,
                        SO_LUONG: qtyNeed,
                        DON_GIA: totalAmount / (qtyNeed * nights),
                        TONG_TIEN: totalAmount,
                        TRANG_THAI: 'CONFIRMED'
                    }
                }
            }
        });

        // 5. Tạo Hóa đơn tiền cọc
        const invoice = await tx.hOA_DON.create({
            data: {
                HDON_LOAI: 'DEPOSIT',
                HDON_TAO_LUC: new Date(),
                HDON_THANH_TIEN: depositAmount,
                HDON_TONG_TIEN:totalAmount,
                HDON_COC_DA_TRU: depositAmount,
                HDON_TRANG_THAI: 'ISSUED',
                NV_MA: 1,
                HDON_CHITIET_JSON: {
                    type: 'DEPOSIT',
                    hdong_ma: newBooking.HDONG_MA,
                    from: date_from, to: date_to, nights, adults: 1,
                    deposit_rate: tileCoc,
                    items: [{ lp_ma: lpMa, qty: qtyNeed, unit_price: totalAmount / (qtyNeed * nights), subtotal: totalAmount }],
                },
                LIEN_KET: { create: { HDONG_MA: newBooking.HDONG_MA } }
            }
        });

        // 6. Tạo bản ghi thanh toán giả lập
        const vnp_TxnRef = 'FAKE_' + Date.now();
        await tx.tHANH_TOAN.create({
            data: {
                HDON_MA: invoice.HDON_MA,
                TT_PHUONG_THUC: 'GATEWAY',
                TT_NHA_CUNG_CAP: 'FAKE',
                TT_TRANG_THAI_GIAO_DICH: 'INITIATED',
                TT_SO_TIEN: depositAmount,
                TT_MA_GIAO_DICH: vnp_TxnRef,
                TT_GHI_CHU: 'Cọc qua Chatbot (FAKE)',
            },
        });

        return { bookingId: newBooking.HDONG_MA, roomName: loaiPhong.LP_TEN, total: totalAmount, deposit: depositAmount, invoiceId: invoice.HDON_MA, txnRef: vnp_TxnRef };
    });
}


module.exports = {
    getCheckInReceipt,
    listPendingBookings,
    createBookingFromChatbot
};