// controllers/booking_pos.js
const { prisma } = require('../db/prisma');

/** =========================
 *  Helpers
 * ======================= */
function toNumber(n, d = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? x : d;
}
function toYMD(d) {
    const dt = new Date(d);
    return dt.toISOString().slice(0, 10);
}
function isInRange(ymd, fromYMD, toYMD) {
    return ymd >= fromYMD && ymd <= toYMD;
}
// Chuyển YMD → Date 05:00 UTC (tức 12:00 VN)
function toFixedUTC5(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 5, 0, 0));
}


/** Lấy STT kế tiếp cho CHI_TIET_DICH_VU theo (HDONG_MA, PHONG_MA, CTSD_STT) */
async function getNextServiceStt(hdId, phongId, ctsdStt) {
    const rows = await prisma.cHI_TIET_DICH_VU.findMany({
        where: {
            HDONG_MA: hdId,
            PHONG_MA: phongId,
            CTSD_STT: ctsdStt,
        },
        select: { CTDV_STT: true },
        orderBy: { CTDV_STT: 'desc' },
        take: 1,
    });
    const curMax = rows?.[0]?.CTDV_STT || 0;
    return curMax + 1;
}
const VN_OFFSET_MIN = 7 * 60; // Asia/Ho_Chi_Minh = UTC+7 (không DST)
const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000);

/** Trả về [prevNoonUTC, nextNoonUTC] cho khung 12:00-12:00 GIỜ VN, nhưng ở dạng UTC */
function vnNoonWindowUTC(nowUtc) {
    // đổi now UTC -> giờ VN
    const vnNow = addMinutes(nowUtc, VN_OFFSET_MIN);
    const y = vnNow.getFullYear();
    const m = vnNow.getMonth();
    const d = vnNow.getDate();

    // 12:00 giờ VN của hôm nay -> UTC = 05:00Z
    const todayNoonUtc = new Date(Date.UTC(y, m, d, 5, 0, 0));

    // nếu đang trước 12:00 VN: đêm là [hôm qua 12:00 VN, hôm nay 12:00 VN)
    if (vnNow.getHours() < 12) {
        const prevNoonUtc = new Date(todayNoonUtc.getTime() - 24 * 3600 * 1000);
        return [prevNoonUtc, todayNoonUtc];
    }
    // sau 12:00 VN: đêm là [hôm nay 12:00 VN, ngày mai 12:00 VN)
    const nextNoonUtc = new Date(todayNoonUtc.getTime() + 24 * 3600 * 1000);
    return [todayNoonUtc, nextNoonUtc];
}

/** =========================
 *  GET /bookings/:id/full
 *  Gom header + các dòng phòng (CTSD) + dịch vụ (CTDV)
 * ======================= */
async function getBookingFull(req, res, next) {
    try {
        const id = toNumber(req.params.id);
        if (!id) return res.status(400).json({ message: 'ID không hợp lệ' });

        // Header HĐ
        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            select: {
                HDONG_MA: true,
                KH_MA: true,
                HT_MA: true,
                HDONG_NGAYDAT: true,
                HDONG_NGAYTRA: true,
                HDONG_TRANG_THAI: true,
                HDONG_GHICHU: true,
                KHACH_HANG: { select: { KH_HOTEN: true, KH_SDT: true } },
                HINH_THUC_THUE: { select: { HT_TEN: true } },
                HDONG_TIENCOCYEUCAU: true,
                HDONG_NGAYTHUCNHAN: true,
                HDONG_NGAYTHUCTRA: true,
            },
        });
        if (!hd) return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });

        // Các dòng PHÒNG - CHI_TIET_SU_DUNG
        const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: {
                HDONG_MA: id,
                CTSD_TRANGTHAI: { in: ['ACTIVE', 'DOI_PHONG', 'INVOICED'] },
            },
            select: {
                CTSD_STT: true,
                PHONG_MA: true,
                CTSD_NGAY_DA_O: true,
                CTSD_O_TU_GIO: true,
                CTSD_O_DEN_GIO: true,
                CTSD_SO_LUONG: true,
                CTSD_DON_GIA: true,
                CTSD_TONG_TIEN: true,
                CTSD_TRANGTHAI: true,
                PHONG: {
                    select: {
                        PHONG_TEN: true,
                        LOAI_PHONG: { select: { LP_TEN: true } },
                    },
                },
            },
            orderBy: [
                { CTSD_NGAY_DA_O: 'asc' }, // null (giờ) sẽ lên đầu, sau đó sắp theo O_TU_GIO
                { CTSD_O_TU_GIO: 'asc' },
            ],
        });
        const isHourly = hd.HT_MA === 2;   // tuỳ hệ thống của bạn GIỜ là 1 hay 2
        const isNightly = hd.HT_MA === 1;

        // === TÍNH TỔNG THỰC TẾ GỒM CẢ INVOICED ===
        let statusFilter;
        if (isHourly) {
            // Theo giờ → tính ACTIVE + DOI_PHONG + INVOICED
            statusFilter = ['ACTIVE', 'DOI_PHONG', 'INVOICED'];
        } else {
            // Theo ngày → chỉ tính ACTIVE + INVOICED
            statusFilter = ['ACTIVE', 'INVOICED'];
        }

        const allCtsdForTotal = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: {
                HDONG_MA: id,
                CTSD_TRANGTHAI: { in: statusFilter },
            },
            select: { CTSD_TONG_TIEN: true },
        });

        const totalRooms = allCtsdForTotal.reduce(
            (s, r) => s + Number(r.CTSD_TONG_TIEN || 0),
            0
        );

        const rooms = ctsd.map((r) => {
            const isHour = !!r.CTSD_O_TU_GIO; // theo giờ nếu có cột giờ
            return {
                lineId: r.CTSD_STT,
                PHONG_MA: r.PHONG_MA,
                roomName: r.PHONG?.PHONG_TEN || `#${r.PHONG_MA}`,
                roomType: r.PHONG?.LOAI_PHONG?.LP_TEN || '',
                donvi: isHour ? 'HOUR' : 'NIGHT',
                ngay: r.CTSD_NGAY_DA_O, // Date/null
                tu_gio: r.CTSD_O_TU_GIO, // Date/null
                den_gio: r.CTSD_O_DEN_GIO, // Date/null
                so_luong: r.CTSD_SO_LUONG,
                don_gia: Number(r.CTSD_DON_GIA),
                tong_tien: Number(r.CTSD_TONG_TIEN),
                CTSD_TRANGTHAI: r.CTSD_TRANGTHAI
            };
        });

        // Các dòng DỊCH VỤ - CHI_TIET_DICH_VU (đúng theo schema)
        const ctdv = await prisma.cHI_TIET_DICH_VU.findMany({
            where: {
                HDONG_MA: id,
                CTDV_TRANGTHAI: { in: ['ACTIVE', 'DOI_PHONG'] },
            },
            select: {
                CTDV_STT: true,
                HDONG_MA: true,
                PHONG_MA: true,
                CTSD_STT: true,
                DV_MA: true,
                CTDV_NGAY: true,
                CTDV_SOLUONG: true,
                CTDV_DONGIA: true,
                CTDV_GHICHU: true,
                DICH_VU: { select: { DV_TEN: true } },
                PHONG: { select: { PHONG_TEN: true } },
            },
            orderBy: [{ CTDV_NGAY: 'asc' }],
        });

        const services = ctdv.map((s) => ({
            // Khớp shape FE
            lineStt: s.CTDV_STT, // chú ý: không có id đơn, dùng STT
            PHONG_MA: s.PHONG_MA,
            roomName: s.PHONG?.PHONG_TEN || '',
            ctsdLineId: s.CTSD_STT, // gắn với dòng phòng
            DV_MA: s.DV_MA,
            dvTen: s.DICH_VU?.DV_TEN || '',
            ngay: s.CTDV_NGAY,
            so_luong: s.CTDV_SOLUONG,
            don_gia: Number(s.CTDV_DONGIA),
            ghi_chu: s.CTDV_GHICHU || null,
            thanh_tien: Number(s.CTDV_DONGIA) * s.CTDV_SOLUONG,
        }));

        // const totalRooms = rooms.reduce((s, r) => s + (r.tong_tien || 0), 0);
        const totalServices = services.reduce((s, v) => s + (v.thanh_tien || 0), 0);

        res.json({
            booking: {
                id: hd.HDONG_MA,
                khach: {
                    ten: hd.KHACH_HANG?.KH_HOTEN || '',
                    sdt: hd.KHACH_HANG?.KH_SDT || '',
                },
                htLabel: hd.HINH_THUC_THUE?.HT_TEN || '',
                from: hd.HDONG_NGAYDAT,
                to: hd.HDONG_NGAYTRA,
                trang_thai: hd.HDONG_TRANG_THAI,
                ghi_chu: hd.HDONG_GHICHU || null,
                tien_coc: hd.HDONG_TIENCOCYEUCAU || null,
                thuc_nhan: hd.HDONG_NGAYTHUCNHAN || null,
                thuc_tra: hd.HDONG_NGAYTHUCTRA || null,
            },
            rooms,
            services,
            totals: {
                rooms: totalRooms,
                services: totalServices,
                grand: totalRooms + totalServices,
            },
        });
    } catch (err) {
        next(err);
    }
}

/** =========================
 *  GET /products
 *  (giữ route cũ) → trả về danh mục DỊCH_VỤ cho POS
 * ======================= */
async function searchProducts(req, res, next) {
    try {
        const q = String(req.query.search ?? '').trim();
        // MySQL: KHÔNG dùng mode:'insensitive'
        // Nếu DB bạn đang dùng collation CI (utf8mb4_unicode_ci, …) thì contains đã mặc định không phân biệt hoa-thường.
        const or = [];
        if (q.length > 0) {
            or.push({ DV_TEN: { contains: q } });
            if (/^\d+$/.test(q)) or.push({ DV_MA: Number(q) });
        }
        const where = or.length ? { OR: or } : {};
        const items = await prisma.dICH_VU.findMany({
            where,
            select: { DV_MA: true, DV_TEN: true, DV_DONGIA: true, LOAI_DICH_VU: { select: { LDV_TEN: true } } },
            orderBy: { DV_TEN: 'asc' },
            take: Math.min(toNumber(req.query.take, 100), 200),
        });

        res.json(
            items.map((x) => ({
                DV_MA: x.DV_MA,
                DV_TEN: x.DV_TEN,
                LDV_TEN: x.LOAI_DICH_VU?.LDV_TEN || null,
                PRICE: Number(x.DV_DONGIA || 0),
            }))
        );
    } catch (e) {
        next(e);
    }
}

/** =========================
 *  POST /bookings/:id/services
 *  Body: { DV_MA, PHONG_MA, CTSD_STT, CTDV_SOLUONG?, CTDV_DONGIA?, CTDV_NGAY?, CTDV_GHICHU? }
 *  - Đơn giá: nếu không gửi -> lấy DV_DONGIA từ DICH_VU
 *  - CTDV_STT: tự tăng theo (HDONG_MA, PHONG_MA, CTSD_STT)
 * ======================= */
/** =========================
 *  POST /bookings/:id/services
 *  Body (tối thiểu): { DV_MA, PHONG_MA, CTDV_SOLUONG?, CTDV_DONGIA?, CTDV_NGAY?, CTDV_GHICHU? }
 *  - KHÔNG cần FE gửi CTSD_STT. BE tự suy theo "now" + PHONG_MA + HT_MA.
 *  - Chỉ cho thêm khi HĐ đang CHECKED_IN và chưa quá hạn trả phòng.
 * ======================= */

/** Tìm CTSD bao phủ thời điểm `instant` (UTC) cho 1 phòng trong hợp đồng.
 *  Ưu tiên theo giờ; nếu không có thì dò theo ngày với dung sai ±18h; cuối cùng fallback theo cửa sổ hợp đồng.
 */
async function findCtsdForService(prisma, {
    hdId,
    phongMa,
    htMa,        // 1: theo đêm, 2: theo giờ
    instant,     // Date
    windowStart, // Date | null
    windowEnd    // Date | null
}) {
    // 1) Thuê theo GIỜ → match O_TU_GIO / O_DEN_GIO bằng chính thời điểm dịch vụ
    if (Number(htMa) === 2) {
        const byTime = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: {
                HDONG_MA: hdId,
                PHONG_MA: phongMa,
                CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
                CTSD_O_TU_GIO: { lte: instant },
                OR: [
                    { CTSD_O_DEN_GIO: null },
                    { CTSD_O_DEN_GIO: { gt: instant } },
                ],
            },
            select: { CTSD_STT: true },
            orderBy: [{ CTSD_STT: 'asc' }],
        });
        if (byTime) return byTime;
    }

    // 2) Thuê theo ĐÊM → CTSD_NGAY_DA_O là “đinh 12:00 VN” (05:00Z), nên dò với dung sai ±18h
    const before = new Date(instant.getTime() - 18 * 3600 * 1000);
    const after = new Date(instant.getTime() + 18 * 3600 * 1000);
    const noonLike = await prisma.cHI_TIET_SU_DUNG.findFirst({
        where: {
            HDONG_MA: hdId,
            PHONG_MA: phongMa,
            CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
            CTSD_NGAY_DA_O: { gte: before, lte: after },
        },
        select: { CTSD_STT: true },
        orderBy: [{ CTSD_STT: 'asc' }],
    });
    if (noonLike) return noonLike;

    // 3) Fallback: nếu instant nằm trong [windowStart, windowEnd) của HĐ → lấy CTSD ACTIVE bất kỳ của phòng
    if (windowStart && windowEnd && instant >= windowStart && instant < windowEnd) {
        const anyRow = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: {
                HDONG_MA: hdId,
                PHONG_MA: phongMa,
                CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
            },
            select: { CTSD_STT: true },
            orderBy: [{ CTSD_STT: 'asc' }],
        });
        if (anyRow) return anyRow;
    }

    return null;
}


async function addService(req, res, next) {
    try {
        const hdId = Number(req.params.id) || 0;
        const {
            DV_MA,
            PHONG_MA,
            CTDV_SOLUONG = 1,
            CTDV_DONGIA,
            CTDV_NGAY,          // nếu không gửi -> dùng thời điểm hiện tại
            CTDV_GHICHU = null,
            // KHÔNG nhận CTSD_STT từ FE – BE sẽ tự xác định dòng phòng phủ thời điểm
        } = req.body || {};

        if (!hdId || !DV_MA || !PHONG_MA) {
            return res.status(400).json({ message: 'Thiếu DV_MA / PHONG_MA / hoặc HDONG_MA không hợp lệ' });
        }

        // ========== 1) Kiểm tra HĐ ==========
        const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: hdId },
            select: {
                HT_MA: true,
                HDONG_TRANG_THAI: true,
                HDONG_NGAYDAT: true,
                HDONG_NGAYTRA: true,
                HDONG_NGAYTHUCNHAN: true,
                HDONG_NGAYTHUCTRA: true,
            }
        });
        if (!hd) return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });
        // const instant = req.body?.at ? new Date(req.body.at) : new Date();
        // Thời điểm dịch vụ (instant) – mặc định là "ngay bây giờ"
        const instant = CTDV_NGAY ? new Date(CTDV_NGAY) : new Date();
        if (Number.isNaN(+instant)) {
            return res.status(400).json({ message: 'Thời điểm thêm dịch vụ (at) không hợp lệ' });
        }

        // CỬA SỔ HIỆU LỰC: ưu tiên mốc "THỰC", fallback sang "DỰ KIẾN"
        const windowStart = hd.HDONG_NGAYTHUCNHAN ?? hd.HDONG_NGAYDAT;
        const windowEnd = hd.HDONG_NGAYTHUCTRA ?? hd.HDONG_NGAYTRA;

        if (!windowStart || !windowEnd) {
            return res.status(409).json({ message: 'Khoảng hiệu lực hợp đồng chưa đầy đủ' });
        }

        // Quy ước [start, end): cho phép =start, chặn =end
        const start = new Date(windowStart);
        const end = new Date(windowEnd);

        if (!(instant >= start && instant < end)) {
            return res.status(409).json({
                message:
                    'Thời điểm thêm dịch vụ nằm ngoài khoảng hiệu lực của hợp đồng (đã quá hạn hoặc chưa tới thời gian nhận).',
                detail: {
                    instant: instant.toISOString(),
                    windowStart: start.toISOString(),
                    windowEnd: end.toISOString(),
                },
            });
        }

        // (tuỳ chính sách) Nếu muốn CHỈ cho thêm dịch vụ khi đã nhận phòng:
        if (hd.HDONG_TRANG_THAI !== 'CHECKED_IN') {
            return res.status(409).json({ message: 'Chỉ thêm dịch vụ sau khi đã nhận phòng (CHECKED_IN).' });
        }



        // ========== 2) Xác định CTSD_STT của phòng bao phủ "instant" ==========
        if (!windowStart || !windowEnd) {
            return res.status(409).json({ message: 'Khoảng hiệu lực hợp đồng chưa đầy đủ' });
        }

        const ctsdRow = await findCtsdForService(prisma, {
            hdId,
            phongMa: Number(PHONG_MA),
            htMa: Number(hd.HT_MA),
            instant,
            windowStart: new Date(windowStart),
            windowEnd: new Date(windowEnd),
        });

        if (!ctsdRow) {
            return res.status(409).json({
                message: 'Không tìm thấy dòng phòng (CTSD) bao phủ thời điểm hiện tại để gắn dịch vụ. Kiểm tra phòng/giờ/ngày hoặc trạng thái dòng phòng.'
            });
        }

        const resolvedCtsdStt = ctsdRow.CTSD_STT;

        // ========== 3) Lấy đơn giá mặc định nếu không gửi ==========
        let unitPrice = Number(CTDV_DONGIA);
        if (!Number.isFinite(unitPrice)) {
            const dv = await prisma.dICH_VU.findUnique({
                where: { DV_MA: Number(DV_MA) },
                select: { DV_DONGIA: true }
            });
            unitPrice = Number(dv?.DV_DONGIA || 0);
        }
        const qty = Math.max(1, Number(CTDV_SOLUONG) || 1);

        // ========== 4) Lấy CTDV_STT kế tiếp cho (HDONG_MA, PHONG_MA, CTSD_STT) ==========
        const last = await prisma.cHI_TIET_DICH_VU.findFirst({
            where: {
                HDONG_MA: hdId,
                PHONG_MA: Number(PHONG_MA),
                CTSD_STT: Number(resolvedCtsdStt)
            },
            select: { CTDV_STT: true },
            orderBy: { CTDV_STT: 'desc' }
        });
        const nextStt = (last?.CTDV_STT || 0) + 1;

        // ========== 5) Tạo dòng dịch vụ ==========
        const created = await prisma.cHI_TIET_DICH_VU.create({
            data: {
                HDONG_MA: hdId,
                PHONG_MA: Number(PHONG_MA),
                CTSD_STT: Number(resolvedCtsdStt),
                DV_MA: Number(DV_MA),
                CTDV_STT: Number(nextStt),

                CTDV_NGAY: instant,
                CTDV_SOLUONG: qty,
                CTDV_DONGIA: unitPrice,
                CTDV_GHICHU: CTDV_GHICHU ? String(CTDV_GHICHU).trim() : null
            },
            select: {
                CTDV_STT: true,
                DV_MA: true,
                CTDV_SOLUONG: true,
                CTDV_DONGIA: true,
                CTDV_NGAY: true,
                CTDV_GHICHU: true,
                PHONG_MA: true,
                CTSD_STT: true,
                DICH_VU: { select: { DV_TEN: true } },
                PHONG: { select: { PHONG_TEN: true } }
            }
        });

        // ========== 6) Trả về shape FE ==========
        res.status(201).json({
            lineStt: created.CTDV_STT,
            PHONG_MA: created.PHONG_MA,
            roomName: created.PHONG?.PHONG_TEN || '',
            ctsdLineId: created.CTSD_STT,
            DV_MA: created.DV_MA,
            dvTen: created.DICH_VU?.DV_TEN || '',
            ngay: created.CTDV_NGAY,
            so_luong: created.CTDV_SOLUONG,
            don_gia: Number(created.CTDV_DONGIA),
            ghi_chu: created.CTDV_GHICHU || null,
            thanh_tien: Number(created.CTDV_DONGIA) * created.CTDV_SOLUONG
        });
    } catch (e) {
        next(e);
    }
}



/** =========================
 *  PATCH /bookings/:id/services/:ctdvStt
 *  Body: { PHONG_MA, CTSD_STT, DV_MA, CTDV_SOLUONG?, CTDV_DONGIA?, CTDV_GHICHU? }
 *  - Yêu cầu đủ bộ khóa (PHONG_MA, CTSD_STT, DV_MA, CTDV_STT)
 * ======================= */
async function updateService(req, res, next) {
    try {
        const hdId = toNumber(req.params.id);
        const ctdvStt = toNumber(req.params.ctdvStt);
        // const { PHONG_MA, CTSD_STT, DV_MA, CTDV_SOLUONG, CTDV_DONGIA, CTDV_GHICHU } = req.body || {};

        // if (!hdId || !ctdvStt || !PHONG_MA || !CTSD_STT || !DV_MA) {
        //     return res
        //         .status(400)
        //         .json({ message: 'Thiếu khoá: HDONG_MA / PHONG_MA / CTSD_STT / DV_MA / CTDV_STT' });
        // }
        let { PHONG_MA, CTSD_STT, DV_MA, CTDV_SOLUONG, CTDV_DONGIA, CTDV_GHICHU } = req.body;

        if (!PHONG_MA || !CTSD_STT || !DV_MA) {
            const r = await prisma.cHI_TIET_DICH_VU.findFirst({
                where: { HDONG_MA: hdId, CTDV_STT: ctdvStt },
                select: { PHONG_MA: true, CTSD_STT: true, DV_MA: true }
            });
            if (!r) return res.status(404).json({ message: 'Không tìm thấy dịch vụ' });

            PHONG_MA = r.PHONG_MA;
            CTSD_STT = r.CTSD_STT;
            DV_MA = r.DV_MA;
        }

        if (!CTDV_SOLUONG) {
            return res.status(400).json({ message: "Thiếu số lượng cập nhật." });
        }

        // Tìm bản ghi
        const cur = await prisma.cHI_TIET_DICH_VU.findUnique({
            where: {
                HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: {
                    HDONG_MA: Number(hdId),
                    PHONG_MA: Number(PHONG_MA),
                    CTSD_STT: Number(CTSD_STT),
                    DV_MA: Number(DV_MA),
                    CTDV_STT: Number(ctdvStt),
                },
            },
            select: { CTDV_SOLUONG: true, CTDV_DONGIA: true },
        });
        if (!cur) return res.status(404).json({ message: 'Không tìm thấy dòng dịch vụ' });

        const qty = CTDV_SOLUONG != null ? Math.max(0, toNumber(CTDV_SOLUONG)) : Number(cur.CTDV_SOLUONG || 0);
        const price = CTDV_DONGIA != null ? toNumber(CTDV_DONGIA) : Number(cur.CTDV_DONGIA || 0);

        const updated = await prisma.cHI_TIET_DICH_VU.update({
            where: {
                HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: {
                    HDONG_MA: Number(hdId),
                    PHONG_MA: Number(PHONG_MA),
                    CTSD_STT: Number(CTSD_STT),
                    DV_MA: Number(DV_MA),
                    CTDV_STT: Number(ctdvStt),
                },
            },
            data: {
                CTDV_SOLUONG: qty,
                CTDV_DONGIA: price,
                ...(CTDV_GHICHU !== undefined
                    ? { CTDV_GHICHU: CTDV_GHICHU ? String(CTDV_GHICHU).trim() : null }
                    : {}),
            },
            select: {
                CTDV_STT: true,
                DV_MA: true,
                CTDV_SOLUONG: true,
                CTDV_DONGIA: true,
                CTDV_NGAY: true,
                CTDV_GHICHU: true,
                PHONG_MA: true,
                CTSD_STT: true,
                DICH_VU: { select: { DV_TEN: true } },
                PHONG: { select: { PHONG_TEN: true } },
            },
        });

        res.json({
            lineStt: updated.CTDV_STT,
            PHONG_MA: updated.PHONG_MA,
            roomName: updated.PHONG?.PHONG_TEN || '',
            ctsdLineId: updated.CTSD_STT,
            DV_MA: updated.DV_MA,
            dvTen: updated.DICH_VU?.DV_TEN || '',
            ngay: updated.CTDV_NGAY,
            so_luong: updated.CTDV_SOLUONG,
            don_gia: Number(updated.CTDV_DONGIA),
            ghi_chu: updated.CTDV_GHICHU || null,
            thanh_tien: Number(updated.CTDV_DONGIA) * updated.CTDV_SOLUONG,
        });
    } catch (e) {
        next(e);
    }
}

/** =========================
 *  DELETE /bookings/:id/services/:ctdvStt
 *  Body: { PHONG_MA, CTSD_STT, DV_MA }  (đủ bộ khoá)
 * ======================= */
// async function removeService(req, res, next) {
//     try {
//         const hdId = toNumber(req.params.id);
//         const ctdvStt = toNumber(req.params.ctdvStt);
//         const { PHONG_MA, CTSD_STT, DV_MA } = req.body || {};

//         if (!hdId || !ctdvStt || !PHONG_MA || !CTSD_STT || !DV_MA) {
//             return res
//                 .status(400)
//                 .json({ message: 'Thiếu khoá: HDONG_MA / PHONG_MA / CTSD_STT / DV_MA / CTDV_STT' });
//         }

//         await prisma.cHI_TIET_DICH_VU.delete({
//             where: {
//                 HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: {
//                     HDONG_MA: Number(hdId),
//                     PHONG_MA: Number(PHONG_MA),
//                     CTSD_STT: Number(CTSD_STT),
//                     DV_MA: Number(DV_MA),
//                     CTDV_STT: Number(ctdvStt),
//                 },
//             },
//         });

//         res.json({ ok: true });
//     } catch (e) {
//         next(e);
//     }
// }

async function removeService(req, res, next) {
    try {
        const hdId = Number(req.params.id);
        const ctdvStt = Number(req.params.ctdvStt);

        // FE không gửi body → tự tìm record để lấy bộ khoá
        const record = await prisma.cHI_TIET_DICH_VU.findFirst({
            where: {
                HDONG_MA: hdId,
                CTDV_STT: ctdvStt
            },
            select: { PHONG_MA: true, CTSD_STT: true, DV_MA: true }
        });

        if (!record)
            return res.status(404).json({ message: 'Không tìm thấy dòng dịch vụ' });

        await prisma.cHI_TIET_DICH_VU.delete({
            where: {
                HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: {
                    HDONG_MA: hdId,
                    PHONG_MA: record.PHONG_MA,
                    CTSD_STT: record.CTSD_STT,
                    DV_MA: record.DV_MA,
                    CTDV_STT: ctdvStt,
                }
            }
        });

        res.json({ ok: true });
    } catch (e) { next(e); }
}


// POST /bookings/:id/add-room
// async function addItemToExisting(req, res, next) {
//     try {
//         const bookingId = Number(req.params.id);
//         const { PHONG_MA, LP_MA: LP_MA_REQ } = req.body || {};

//         if (!bookingId || !PHONG_MA)
//             return res.status(400).json({ message: 'Thiếu dữ liệu.' });

//         // 1️⃣ Lấy hợp đồng
//         const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
//             where: { HDONG_MA: bookingId },
//             include: { HINH_THUC_THUE: true },
//         });
//         if (!booking)
//             return res.status(404).json({ message: 'Không tìm thấy hợp đồng.' });

//         const { HDONG_NGAYDAT, HDONG_NGAYTRA, HT_MA } = booking;

//         // 2️⃣ Lấy LP_MA của phòng
//         const phong = await prisma.pHONG.findUnique({
//             where: { PHONG_MA: Number(PHONG_MA) },
//             select: { LP_MA: true, PHONG_TEN: true },
//         });
//         if (!phong) return res.status(404).json({ message: 'Không tìm thấy phòng.' });

//         const { LP_MA } = phong;

//         // 3️⃣ Lấy THOI_DIEM hiện hành
//         const td = await prisma.tHOI_DIEM.findFirst({
//             where: { TD_TRANGTHAI: true },
//             select: { TD_MA: true },
//         });
//         if (!td) return res.status(404).json({ message: 'Không có thời điểm định giá.' });

//         // 4️⃣ Tra đơn giá
//         const donGiaRow = await prisma.dON_GIA.findUnique({
//             where: {
//                 LP_MA_HT_MA_TD_MA: {
//                     LP_MA,
//                     HT_MA,
//                     TD_MA: td.TD_MA,
//                 },
//             },
//             select: { DG_DONGIA: true },
//         });
//         if (!donGiaRow)
//             return res.status(404).json({ message: 'Không tìm thấy đơn giá phù hợp.' });

//         const donGia = Number(donGiaRow.DG_DONGIA);

//         // 5️⃣ Sinh các ngày giữa khoảng đặt (fix mốc UTC 05:00:00)
//         const start = new Date(HDONG_NGAYDAT);
//         const end = new Date(HDONG_NGAYTRA);
//         const dates = [];

//         for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
//             // ép mỗi ngày về đúng 05:00 UTC (tức 12:00 VN)
//             const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 5, 0, 0));
//             dates.push(utc);
//         }


//         if (dates.length === 0)
//             return res.status(400).json({ message: 'Không xác định được số đêm để thêm.' });

//         // 6️⃣ Lấy CTSD_STT hiện tại và bắt đầu tăng dần
//         const last = await prisma.cHI_TIET_SU_DUNG.findFirst({
//             where: { HDONG_MA: bookingId, PHONG_MA: Number(PHONG_MA) },
//             orderBy: { CTSD_STT: 'desc' },
//             select: { CTSD_STT: true },
//         });
//         let nextStt = (last?.CTSD_STT ?? 0) + 1;



//         // 7️⃣ Tạo nhiều bản ghi CTSD (1 bản ghi/đêm)
//         const dataToInsert = dates.map((ngay) => ({
//             HDONG_MA: bookingId,
//             PHONG_MA: Number(PHONG_MA),
//             CTSD_STT: nextStt++,
//             CTSD_NGAY_DA_O: ngay,
//             CTSD_SO_LUONG: 1,
//             CTSD_DON_GIA: donGia,
//             CTSD_TONG_TIEN: donGia,
//             CTSD_TRANGTHAI: 'ACTIVE',
//         }));

//         await prisma.cHI_TIET_SU_DUNG.createMany({ data: dataToInsert });
//         await prisma.cT_DAT_TRUOC.updateMany({
//             where: {
//                 HDONG_MA: bookingId,
//                 LP_MA: LP_MA || phong.LP_MA,
//                 TRANG_THAI: { in: ['CONFIRMED'] },
//             },
//             data: { TRANG_THAI: 'ALLOCATED' },
//         });
//         res.status(201).json({
//             message: `Đã thêm ${phong.PHONG_TEN} vào hợp đồng.`,
//             donGia,
//         });
//     } catch (err) {
//         console.error(err);
//         next(err);
//     }
// }

// POST /bookings/:id/add-room
async function addItemToExisting(req, res, next) {
    try {
        const bookingId = Number(req.params.id);
        const { PHONG_MA } = req.body || {};

        if (!bookingId || !PHONG_MA)
            return res.status(400).json({ message: 'Thiếu dữ liệu.' });

        // 1) Lấy hợp đồng
        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: bookingId },
            include: { HINH_THUC_THUE: true },
        });
        if (!booking)
            return res.status(404).json({ message: 'Không tìm thấy hợp đồng.' });

        const {
            HDONG_NGAYDAT,
            HDONG_NGAYTRA,
            HT_MA,
        } = booking;

        // 2) Lấy LP_MA của phòng thêm
        const phong = await prisma.pHONG.findUnique({
            where: { PHONG_MA: Number(PHONG_MA) },
            select: { LP_MA: true, PHONG_TEN: true },
        });
        if (!phong)
            return res.status(404).json({ message: 'Không tìm thấy phòng.' });

        const LP_MA = phong.LP_MA;

        // ================================
        // 3) Lấy BASE TD
        // ================================
        const baseTD = await prisma.tHOI_DIEM.findFirst({
            where: { TD_TRANGTHAI: true, THOI_DIEM_BASE: { isNot: null } },
            select: { TD_MA: true },
            orderBy: { TD_MA: 'asc' },
        });
        const baseTD_MA = baseTD?.TD_MA;
        if (!baseTD_MA)
            return res.status(404).json({ message: 'Không có thời điểm cơ bản.' });

        // ================================
        // 4) Lấy SPECIAL giao khoảng thời gian booking
        // ================================
        const startDate = new Date(HDONG_NGAYDAT);
        const endDate = new Date(HDONG_NGAYTRA);

        let specials = await prisma.tHOI_DIEM_SPECIAL.findMany({
            where: {
                THOI_DIEM: { TD_TRANGTHAI: true },
                TD_NGAY_BAT_DAU: { lte: endDate },
                TD_NGAY_KET_THUC: { gte: startDate },
            },
            select: {
                TD_MA: true,
                TD_NGAY_BAT_DAU: true,
                TD_NGAY_KET_THUC: true,
            },
        });

        // Convert sang dạng YYYY-MM-DD để so sánh ổn định
        function toYMD(d) {
            return new Date(d).toISOString().slice(0, 10);
        }

        specials = specials.map(sp => ({
            TD_MA: sp.TD_MA,
            fromYMD: toYMD(sp.TD_NGAY_BAT_DAU),
            toYMD: toYMD(sp.TD_NGAY_KET_THUC),
        }));

        function isInRange(d, a, b) {
            return d >= a && d <= b;
        }

        // ================================
        // 5) Helper lấy đơn giá cho 1 TD
        // ================================
        const priceCache = new Map();
        async function getPrice(td_ma) {
            if (priceCache.has(td_ma)) return priceCache.get(td_ma);

            const rec = await prisma.dON_GIA.findUnique({
                where: {
                    LP_MA_HT_MA_TD_MA: {
                        LP_MA,
                        HT_MA,
                        TD_MA: td_ma,
                    },
                },
                select: { DG_DONGIA: true },
            });

            const val = rec ? Number(rec.DG_DONGIA) : null;
            priceCache.set(td_ma, val);
            return val;
        }

        // ================================
        // 6) Sinh danh sách ngày để tính tiền
        // ================================
        const days = [];
        let d = new Date(startDate);
        while (d < endDate) {
            days.push(toYMD(d));
            d.setDate(d.getDate() + 1);
        }

        if (days.length === 0)
            return res.status(400).json({ message: 'Không xác định được số đêm.' });

        // ================================
        // 7) Lấy STT hiện tại
        // ================================
        const last = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: { HDONG_MA: bookingId, PHONG_MA: Number(PHONG_MA) },
            orderBy: { CTSD_STT: 'desc' },
            select: { CTSD_STT: true },
        });
        let nextStt = (last?.CTSD_STT ?? 0) + 1;

        // ================================
        // 8) Tạo CTSD cho từng ngày, lấy đúng giá SPECIAL / BASE
        // ================================
        const CTSD_data = [];

        for (const ymd of days) {
            // Xác định TD của ngày này
            let td_ma = baseTD_MA;

            for (const sp of specials) {
                if (isInRange(ymd, sp.fromYMD, sp.toYMD)) {
                    td_ma = sp.TD_MA;
                    break;
                }
            }

            const price = await getPrice(td_ma);
            if (!price)
                return res.status(400).json({ message: `Thiếu đơn giá cho ${ymd}` });

            CTSD_data.push({
                HDONG_MA: bookingId,
                PHONG_MA: Number(PHONG_MA),
                CTSD_STT: nextStt++,
                CTSD_NGAY_DA_O: new Date(`${ymd}T12:00:00+07:00`), // ngày chuẩn, không 05:00 UTC nữa
                CTSD_SO_LUONG: 1,
                CTSD_DON_GIA: price,
                CTSD_TONG_TIEN: price,
                CTSD_TRANGTHAI: 'ACTIVE',
            });
        }
        // ================================
        // 9) Cập nhật trạng thái CT_DAT_TRUOC (KHÔNG trừ số lượng)
        // ================================
        await prisma.cT_DAT_TRUOC.updateMany({
            where: {
                HDONG_MA: bookingId,
                TRANG_THAI: 'CONFIRMED',
            },
            data: {
                TRANG_THAI: 'ASSIGNED',
            },
        });

        // Lưu vào DB
        await prisma.cHI_TIET_SU_DUNG.createMany({ data: CTSD_data });

        res.status(201).json({
            message: `Đã thêm ${phong.PHONG_TEN} vào hợp đồng.`,
            chiTiet: CTSD_data,
        });

    } catch (err) {
        console.error(err);
        next(err);
    }
}

// GET /bookings/:id/pending-rooms
async function pendingRooms(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ message: 'Thiếu ID hợp đồng' });

        const rows = await prisma.cT_DAT_TRUOC.findMany({
            where: { HDONG_MA: id, TRANG_THAI: { in: ['CONFIRMED', 'ASSIGNED'] }, },
            include: { LOAI_PHONG: { select: { LP_TEN: true } } },
        });

        res.json(rows.map(r => ({
            LP_MA: r.LP_MA,
            LP_TEN: r.LOAI_PHONG?.LP_TEN || '',
            SO_LUONG: r.SO_LUONG,
        })));
    } catch (e) { next(e); }
}

// POST /bookings/:id/add-room-checkin
async function addRoomForCheckedIn(req, res, next) {
    try {
        const bookingId = Number(req.params.id);
        const { PHONG_MA } = req.body;

        if (!bookingId || !PHONG_MA)
            return res.status(400).json({ message: "Thiếu dữ liệu." });

        // 1) Lấy hợp đồng
        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: bookingId },
            include: { HINH_THUC_THUE: true }
        });

        if (!booking)
            return res.status(404).json({ message: "Không tìm thấy hợp đồng." });

        if (booking.HDONG_TRANG_THAI !== "CHECKED_IN")
            return res.status(400).json({ message: "Chỉ hợp đồng đang CHECKED_IN mới được thêm phòng." });

        const { HT_MA, HDONG_NGAYTRA } = booking;

        const now = new Date();                     // thời điểm thêm phòng
        const checkout = new Date(HDONG_NGAYTRA); // trả phòng thực tế

        if (now >= checkout)
            return res.status(400).json({ message: "Hợp đồng sắp trả phòng – không thể thêm phòng." });

        // 2) Lấy phòng
        const phong = await prisma.pHONG.findUnique({
            where: { PHONG_MA: Number(PHONG_MA) },
            select: { LP_MA: true, PHONG_TEN: true }
        });

        if (!phong)
            return res.status(404).json({ message: "Không tìm thấy phòng." });

        // 3) Lấy thời điểm định giá
        const td = await prisma.tHOI_DIEM.findFirst({
            where: { TD_TRANGTHAI: true },
            select: { TD_MA: true }
        });

        if (!td)
            return res.status(404).json({ message: "Không có thời điểm định giá." });

        // 4) Tra đơn giá theo loại phòng + hình thức thuê + thời điểm
        const donGiaRow = await prisma.dON_GIA.findUnique({
            where: {
                LP_MA_HT_MA_TD_MA: {
                    LP_MA: phong.LP_MA,
                    HT_MA,
                    TD_MA: td.TD_MA
                }
            },
            select: { DG_DONGIA: true }
        });

        if (!donGiaRow)
            return res.status(404).json({ message: "Không tìm thấy đơn giá phù hợp." });

        const donGia = Number(donGiaRow.DG_DONGIA);

        // 5) Lấy STT mới
        const last = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: { HDONG_MA: bookingId, PHONG_MA: Number(PHONG_MA) },
            orderBy: { CTSD_STT: "desc" },
            select: { CTSD_STT: true }
        });

        let nextStt = (last?.CTSD_STT ?? 0) + 1;

        // ========= CASE 1: Thuê THEO GIỜ =========
        if (HT_MA === 2) {
            const diffMs = checkout.getTime() - now.getTime();
            const hours = Math.ceil(diffMs / (60 * 60 * 1000)); // làm tròn lên

            const created = await prisma.cHI_TIET_SU_DUNG.create({
                data: {
                    HDONG_MA: bookingId,
                    PHONG_MA: Number(PHONG_MA),
                    CTSD_STT: nextStt,
                    CTSD_O_TU_GIO: now,
                    CTSD_O_DEN_GIO: checkout,
                    CTSD_SO_LUONG: hours,
                    CTSD_DON_GIA: donGia,
                    CTSD_TONG_TIEN: donGia * hours,
                    CTSD_TRANGTHAI: "ACTIVE"
                }
            });

            // cập nhật phòng → OCCUPIED
            await prisma.pHONG.update({
                where: { PHONG_MA: Number(PHONG_MA) },
                data: { PHONG_TRANGTHAI: "OCCUPIED" }
            });

            return res.status(201).json({
                message: `Đã thêm phòng ${phong.PHONG_TEN} (thuê giờ).`,
                gio_con_lai: hours,
                donGia
            });
        }

        // ========= CASE 2: Thuê THEO NGÀY =========
        const dates = [];
        // chuẩn hóa ngày bắt đầu về 05:00 UTC
        const startDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0));

        // chuẩn hóa ngày trả về 05:00 UTC
        const endDay = new Date(Date.UTC(checkout.getFullYear(), checkout.getMonth(), checkout.getDate(), 5, 0, 0));

        let d = new Date(startDay);

        while (d < endDay) {
            dates.push(new Date(d));
            d.setUTCDate(d.getUTCDate() + 1);
        }

        if (dates.length === 0)
            return res.status(400).json({ message: "Không xác định được số đêm còn lại." });

        const rowsToInsert = dates.map(date => ({
            HDONG_MA: bookingId,
            PHONG_MA: Number(PHONG_MA),
            CTSD_STT: nextStt++,
            CTSD_NGAY_DA_O: date,
            CTSD_SO_LUONG: 1,
            CTSD_DON_GIA: donGia,
            CTSD_TONG_TIEN: donGia,
            CTSD_TRANGTHAI: "ACTIVE"
        }));

        await prisma.cHI_TIET_SU_DUNG.createMany({ data: rowsToInsert });

        await prisma.pHONG.update({
            where: { PHONG_MA: Number(PHONG_MA) },
            data: { PHONG_TRANGTHAI: "OCCUPIED" }
        });

        return res.status(201).json({
            message: `Đã thêm phòng ${phong.PHONG_TEN} (${dates.length} đêm).`,
            so_dem: dates.length,
            donGia
        });

    } catch (e) {
        console.error("ERR add-room-checkin:", e);
        next(e);
    }
}

module.exports = { addRoomForCheckedIn };


// DELETE /bookings/:id/rooms/:phongId
async function removeRoom(req, res) {
    const id = Number(req.params.id);
    const phongId = Number(req.params.phongId);

    const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
        where: { HDONG_MA: id },
        select: { HDONG_TRANG_THAI: true },
    });
    if (!booking) return res.status(404).json({ message: 'Không tìm thấy hợp đồng.' });
    if (booking.HDONG_TRANG_THAI !== 'CONFIRMED')
        return res.status(400).json({ message: 'Chỉ có thể xóa phòng khi hợp đồng chưa check-in.' });

    await prisma.cHI_TIET_SU_DUNG.deleteMany({
        where: {
            HDONG_MA: Number(id),
            PHONG_MA: Number(phongId),
        },
    });
    await prisma.cT_DAT_TRUOC.updateMany({
        where: { HDONG_MA: Number(id), LP_MA: phongId.LP_MA },
        data: { TRANG_THAI: 'CONFIRMED' } // cho phép gán lại
    });

    res.json({ success: true });
}

// POST /bookings/:id/change-room
// async function changeRoom(req, res, next) {
//     try {
//         const bookingId = Number(req.params.id);
//         const { oldRoomId, newRoomId, reason } = req.body || {};

//         if (!bookingId || !oldRoomId || !newRoomId) {
//             return res.status(400).json({ message: "Thiếu thông tin đổi phòng." });
//         }

//         // 1️⃣ Lấy hợp đồng
//         const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
//             where: { HDONG_MA: bookingId },
//             include: {
//                 HINH_THUC_THUE: true,
//                 CHI_TIET_SU_DUNG: true,
//             },
//         });

//         if (!booking) return res.status(404).json({ message: "Không tìm thấy hợp đồng." });
//         if (booking.HDONG_TRANG_THAI !== "CHECKED_IN") {
//             return res.status(400).json({ message: "Chỉ đổi phòng khi khách đang ở." });
//         }

//         // 2️⃣ Kiểm tra phòng mới có trống không trong khoảng còn lại
//         const now = new Date();
//         const available = await prisma.cHI_TIET_SU_DUNG.findFirst({
//             where: {
//                 PHONG_MA: newRoomId,
//                 HOP_DONG_DAT_PHONG: {
//                     HDONG_TRANG_THAI: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] },
//                     HDONG_NGAYDAT: { lt: booking.HDONG_NGAYTRA },
//                     HDONG_NGAYTRA: { gt: now },
//                 },
//             },
//         });
//         if (available) {
//             return res.status(409).json({ message: "Phòng mới đang có người đặt hoặc sử dụng." });
//         }

//         // 3️⃣ Lấy thông tin phòng mới & đơn giá
//         const phongMoi = await prisma.pHONG.findUnique({
//             where: { PHONG_MA: newRoomId },
//             include: { LOAI_PHONG: true },
//         });
//         if (!phongMoi) return res.status(404).json({ message: "Không tìm thấy phòng mới." });

//         // Lấy đơn giá từ bảng DON_GIA
//         const donGiaObj = await prisma.dON_GIA.findFirst({
//             where: {
//                 LP_MA: phongMoi.LP_MA,
//                 HT_MA: booking.HT_MA,
//             },
//             select: { DG_DONGIA: true },
//         });
//         const donGia = Number(donGiaObj?.DG_DONGIA || 0);

//         // 4️⃣ Xử lý theo hình thức
//         const isHourly = booking.HT_MA === 1; // ví dụ HT_MA=1 là theo giờ, 2 là theo ngày
//         const isNightly = booking.HT_MA === 2;

//         if (isHourly) {
//             // THEO GIỜ
//             await prisma.$transaction(async (tx) => {
//                 // a) Kết thúc CTSD phòng cũ
//                 await tx.cHI_TIET_SU_DUNG.updateMany({
//                     where: {
//                         HDONG_MA: bookingId,
//                         PHONG_MA: oldRoomId,
//                         CTSD_TRANGTHAI: "ACTIVE",
//                     },
//                     data: {
//                         CTSD_O_DEN_GIO: now,
//                         CTSD_TRANGTHAI: "DOI_PHONG",
//                     },
//                 });

//                 // b) Tạo CTSD mới
//                 const last = await tx.cHI_TIET_SU_DUNG.findFirst({
//                     where: { HDONG_MA: bookingId, PHONG_MA: newRoomId },
//                     orderBy: { CTSD_STT: "desc" },
//                     select: { CTSD_STT: true },
//                 });
//                 const nextStt = (last?.CTSD_STT ?? 0) + 1;

//                 await tx.cHI_TIET_SU_DUNG.create({
//                     data: {
//                         HDONG_MA: bookingId,
//                         PHONG_MA: newRoomId,
//                         CTSD_STT: nextStt,
//                         CTSD_O_TU_GIO: now,
//                         CTSD_O_DEN_GIO: booking.HDONG_NGAYTRA,
//                         CTSD_SO_LUONG: 1,
//                         CTSD_DON_GIA: donGia,
//                         CTSD_TONG_TIEN: donGia,
//                         CTSD_TRANGTHAI: "ACTIVE",
//                     },
//                 });

//                 // c) Cập nhật trạng thái phòng
//                 await tx.pHONG.update({
//                     where: { PHONG_MA: oldRoomId },
//                     data: { PHONG_TRANGTHAI: "CHUA_DON" },
//                 });
//                 await tx.pHONG.update({
//                     where: { PHONG_MA: newRoomId },
//                     data: { PHONG_TRANGTHAI: "OCCUPIED" },
//                 });

//                 // d) Ghi lịch sử đổi phòng
//                 await tx.lICH_SU_DOI_PHONG?.create?.({
//                     data: {
//                         HDONG_MA: bookingId,
//                         PHONG_CU: oldRoomId,
//                         PHONG_MOI: newRoomId,
//                         THOI_GIAN_DOI: now,
//                         LY_DO: reason || null,
//                     },
//                 });
//             });
//         } else if (isNightly) {
//             // THEO NGÀY
//             const end = new Date(booking.HDONG_NGAYTRA);
//             const start = new Date(now);
//             start.setUTCHours(5, 0, 0, 0); // fix mốc 05:00 UTC

//             const dates = [];
//             for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
//                 const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 5, 0, 0));
//                 dates.push(utc);
//             }

//             await prisma.$transaction(async (tx) => {
//                 // a) Cập nhật CTSD cũ
//                 await tx.cHI_TIET_SU_DUNG.updateMany({
//                     where: {
//                         HDONG_MA: bookingId,
//                         PHONG_MA: oldRoomId,
//                         CTSD_TRANGTHAI: "ACTIVE",
//                         CTSD_NGAY_DA_O: { gte: start },
//                     },
//                     data: { CTSD_TRANGTHAI: "DOI_PHONG" },
//                 });

//                 // b) Tạo CTSD mới
//                 const last = await tx.cHI_TIET_SU_DUNG.findFirst({
//                     where: { HDONG_MA: bookingId, PHONG_MA: newRoomId },
//                     orderBy: { CTSD_STT: "desc" },
//                     select: { CTSD_STT: true },
//                 });
//                 let nextStt = (last?.CTSD_STT ?? 0) + 1;

//                 for (const day of dates) {
//                     await tx.cHI_TIET_SU_DUNG.create({
//                         data: {
//                             HDONG_MA: bookingId,
//                             PHONG_MA: newRoomId,
//                             CTSD_STT: nextStt++,
//                             CTSD_NGAY_DA_O: day,
//                             CTSD_SO_LUONG: 1,
//                             CTSD_DON_GIA: donGia,
//                             CTSD_TONG_TIEN: donGia,
//                             CTSD_TRANGTHAI: "ACTIVE",
//                         },
//                     });
//                 }

//                 // c) Cập nhật trạng thái phòng
//                 await tx.pHONG.update({
//                     where: { PHONG_MA: oldRoomId },
//                     data: { PHONG_TRANGTHAI: "CHUA_DON" },
//                 });
//                 await tx.pHONG.update({
//                     where: { PHONG_MA: newRoomId },
//                     data: { PHONG_TRANGTHAI: "OCCUPIED" },
//                 });


//             });
//         }

//         res.json({
//             success: true,
//             message: `Đã đổi từ phòng ${oldRoomId} sang ${phongMoi.PHONG_TEN} thành công.`,
//         });
//     } catch (e) {
//         next(e);
//     }
// }

async function changeRoom(req, res, next) {
    try {
        const bookingId = Number(req.params.id);
        const { oldRoomId, newRoomId, reason } = req.body || {};

        if (!bookingId || !oldRoomId || !newRoomId) {
            return res.status(400).json({ message: "Thiếu thông tin đổi phòng." });
        }

        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: bookingId },
            include: { HINH_THUC_THUE: true },
        });

        if (!booking) return res.status(404).json({ message: "Không tìm thấy hợp đồng." });
        if (booking.HDONG_TRANG_THAI !== "CHECKED_IN") {
            return res.status(400).json({ message: "Chỉ đổi phòng khi khách đang ở." });
        }

        const now = new Date();
        const { HDONG_NGAYDAT, HDONG_NGAYTRA, HT_MA } = booking;
        const htTen = (booking.HINH_THUC_THUE?.HT_TEN || '').toUpperCase();
        const isHourly = htTen.includes('GIỜ') || HT_MA === 2;
        const isNightly = htTen.includes('NGÀY') || HT_MA === 1;

        // Check phòng mới có ACTIVE CTSD hay không
        const conflict = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: {
                PHONG_MA: Number(newRoomId),
                CTSD_TRANGTHAI: 'ACTIVE',
                HOP_DONG_DAT_PHONG: {
                    HDONG_TRANG_THAI: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
                    HDONG_MA: { not: bookingId }
                }
            }
        });

        if (conflict) {
            return res.status(409).json({ message: "Phòng mới đang có người sử dụng hoặc đặt chồng." });
        }

        const phongMoi = await prisma.pHONG.findUnique({
            where: { PHONG_MA: Number(newRoomId) },
            include: { LOAI_PHONG: true },
        });
        if (!phongMoi) return res.status(404).json({ message: "Không tìm thấy phòng mới." });

        const LP_MA_MOI = phongMoi.LP_MA;

        // ==========================
        // THEO GIỜ
        
        if (isHourly) {
            await prisma.$transaction(async (tx) => {
                // 🔹 Lấy LP_MA của phòng cũ & phòng mới
                const phongCu = await tx.pHONG.findUnique({
                    where: { PHONG_MA: Number(oldRoomId) },
                    select: { LP_MA: true },
                });
                if (!phongCu) throw new Error('Không tìm thấy phòng cũ');

                // 🔹 Tìm TD_MA (thời điểm) áp dụng cho "NOW" (thời điểm đổi phòng)
                const baseTD = await tx.tHOI_DIEM.findFirst({
                    where: { TD_TRANGTHAI: true, THOI_DIEM_BASE: { isNot: null } },
                    select: { TD_MA: true },
                    orderBy: { TD_MA: 'asc' },
                });
                const baseTD_MA = baseTD?.TD_MA || null;
                const todayYMD = toYMD(now);

                let specials = await tx.tHOI_DIEM_SPECIAL.findMany({
                    where: {
                        THOI_DIEM: { TD_TRANGTHAI: true },
                        TD_NGAY_BAT_DAU: { lte: now },
                        TD_NGAY_KET_THUC: { gte: now },
                    },
                    select: { TD_MA: true, TD_NGAY_BAT_DAU: true, TD_NGAY_KET_THUC: true },
                });

                specials = specials.map(sp => ({
                    TD_MA: sp.TD_MA,
                    fromYMD: toYMD(sp.TD_NGAY_BAT_DAU),
                    toYMD: toYMD(sp.TD_NGAY_KET_THUC),
                }));

                let td_ma = baseTD_MA;
                for (const sp of specials) {
                    if (isInRange(todayYMD, sp.fromYMD, sp.toYMD)) {
                        td_ma = sp.TD_MA;
                        break;
                    }
                }
                if (!td_ma) throw new Error('Không tìm thấy TD_MA cho đổi phòng theo giờ');

                // 🔹 Lấy đơn giá giờ của PHÒNG CŨ từ DON_GIA
                const donGiaOldRec = await tx.dON_GIA.findUnique({
                    where: {
                        LP_MA_HT_MA_TD_MA: {
                            LP_MA: phongCu.LP_MA,
                            HT_MA,
                            TD_MA: td_ma,
                        },
                    },
                    select: { DG_DONGIA: true },
                });
                if (!donGiaOldRec) {
                    throw new Error('Chưa khai báo đơn giá cho phòng cũ (theo giờ).');
                }
                const unitOld = Number(donGiaOldRec.DG_DONGIA);

                // 1️⃣ Tìm dòng CTSD theo giờ đang ACTIVE của phòng cũ
                const oldCtsd = await tx.cHI_TIET_SU_DUNG.findFirst({
                    where: {
                        HDONG_MA: bookingId,
                        PHONG_MA: Number(oldRoomId),
                        CTSD_TRANGTHAI: 'ACTIVE',
                        CTSD_O_TU_GIO: { not: null },
                    },
                    orderBy: { CTSD_STT: 'desc' },
                });

                if (oldCtsd) {
                    // Tính tiền cho đoạn đã ở phòng cũ (từ O_TU_GIO tới now) theo block 30'
                    const from = new Date(oldCtsd.CTSD_O_TU_GIO);
                    const diffMs = now.getTime() - from.getTime();
                    const blockMinutes = 30;
                    const billedMinutes = Math.ceil(diffMs / (blockMinutes * 60 * 1000)) * blockMinutes;
                    const hours = billedMinutes / 60;

                    const tongOld = unitOld * hours;   // ✅ dùng DG_DONGIA (đơn giá giờ) cho phòng cũ

                    await tx.cHI_TIET_SU_DUNG.update({
                        where: {
                            HDONG_MA_PHONG_MA_CTSD_STT: {
                                HDONG_MA: bookingId,
                                PHONG_MA: Number(oldRoomId),
                                CTSD_STT: oldCtsd.CTSD_STT,
                            },
                        },
                        data: {
                            CTSD_O_DEN_GIO: now,
                            CTSD_TONG_TIEN: tongOld,
                            CTSD_TRANGTHAI: 'DOI_PHONG',
                        },
                    });
                }

                // 🔹 Lấy đơn giá giờ của PHÒNG MỚI từ DON_GIA (cùng TD_MA)
                const donGiaNewRec = await tx.dON_GIA.findUnique({
                    where: {
                        LP_MA_HT_MA_TD_MA: {
                            LP_MA: LP_MA_MOI,
                            HT_MA,
                            TD_MA: td_ma,
                        },
                    },
                    select: { DG_DONGIA: true },
                });
                if (!donGiaNewRec) {
                    throw new Error('Chưa khai báo đơn giá cho phòng mới (theo giờ).');
                }
                const unitNew = Number(donGiaNewRec.DG_DONGIA);

                // 2️⃣ Tính tiền cho đoạn ở PHÒNG MỚI = từ now đến HDONG_NGAYTRA
                const fromNew = now;
                const toNew = new Date(booking.HDONG_NGAYTRA);
                const diffMsNew = toNew.getTime() - fromNew.getTime();
                const blockMinutes = 30;
                const billedMinutesNew = Math.ceil(diffMsNew / (blockMinutes * 60 * 1000)) * blockMinutes;
                const hoursNew = billedMinutesNew / 60;
                const tongTienNew = unitNew * hoursNew;

                // 3️⃣ Lấy CTSD_STT kế tiếp cho phòng mới
                const last = await tx.cHI_TIET_SU_DUNG.findFirst({
                    where: { HDONG_MA: bookingId, PHONG_MA: Number(newRoomId) },
                    orderBy: { CTSD_STT: 'desc' },
                    select: { CTSD_STT: true },
                });
                const nextStt = (last?.CTSD_STT ?? 0) + 1;

                // 4️⃣ Tạo CTSD mới cho phòng mới (theo giờ)
                await tx.cHI_TIET_SU_DUNG.create({
                    data: {
                        HDONG_MA: bookingId,
                        PHONG_MA: Number(newRoomId),
                        CTSD_STT: nextStt,
                        CTSD_O_TU_GIO: now,
                        CTSD_O_DEN_GIO: booking.HDONG_NGAYTRA,   // giờ dự kiến trả
                        CTSD_SO_LUONG: 1,
                        CTSD_DON_GIA: unitNew,
                        CTSD_TONG_TIEN: tongTienNew,             // ✅ tính luôn theo DG_DONGIA phòng mới
                        CTSD_TRANGTHAI: 'ACTIVE',
                    },
                });

                // 5️⃣ Cập nhật trạng thái phòng
                await tx.pHONG.update({
                    where: { PHONG_MA: Number(oldRoomId) },
                    data: { PHONG_TRANGTHAI: 'CHUA_DON' },
                });

                await tx.pHONG.update({
                    where: { PHONG_MA: Number(newRoomId) },
                    data: { PHONG_TRANGTHAI: 'OCCUPIED' },
                });
            });

            return res.json({
                success: true,
                message: `Đã đổi từ phòng ${oldRoomId} sang ${phongMoi.PHONG_TEN} (theo giờ).`,
            });
        }


        // ==========================
        // THEO NGÀY
        // ==========================
        const startDate = new Date(HDONG_NGAYDAT);
        const endDate = new Date(HDONG_NGAYTRA);

        const todayYMD = toYMD(now);
        const startYMD = toYMD(startDate);
        const endYMD = toYMD(endDate);

        const effectiveYMD = todayYMD < startYMD ? startYMD : todayYMD;
        if (effectiveYMD >= endYMD) {
            return res.status(400).json({ message: "Không còn đêm nào để đổi phòng." });
        }

        const baseTD = await prisma.tHOI_DIEM.findFirst({
            where: { TD_TRANGTHAI: true, THOI_DIEM_BASE: { isNot: null } },
            select: { TD_MA: true },
            orderBy: { TD_MA: 'asc' },
        });

        const baseTD_MA = baseTD.TD_MA;

        let specials = await prisma.tHOI_DIEM_SPECIAL.findMany({
            where: {
                THOI_DIEM: { TD_TRANGTHAI: true },
                TD_NGAY_BAT_DAU: { lte: endDate },
                TD_NGAY_KET_THUC: { gte: startDate },
            },
            select: { TD_MA: true, TD_NGAY_BAT_DAU: true, TD_NGAY_KET_THUC: true },
        });

        specials = specials.map(sp => ({
            TD_MA: sp.TD_MA,
            fromYMD: toYMD(sp.TD_NGAY_BAT_DAU),
            toYMD: toYMD(sp.TD_NGAY_KET_THUC),
        }));

        const days = [];
        {
            let d = new Date(effectiveYMD);
            let dEnd = new Date(endYMD);
            while (d < dEnd) {
                days.push(toYMD(d));
                d.setDate(d.getDate() + 1);
            }
        }

        const priceCache = new Map();
        async function getPrice(td_ma, tx) {
            if (priceCache.has(td_ma)) return priceCache.get(td_ma);
            const rec = await tx.dON_GIA.findUnique({
                where: {
                    LP_MA_HT_MA_TD_MA: { LP_MA: LP_MA_MOI, HT_MA, TD_MA: td_ma },
                },
                select: { DG_DONGIA: true },
            });
            const val = rec ? Number(rec.DG_DONGIA) : null;
            priceCache.set(td_ma, val);
            return val;
        }

        await prisma.$transaction(async (tx) => {
            await tx.cHI_TIET_SU_DUNG.updateMany({
                where: {
                    HDONG_MA: bookingId,
                    PHONG_MA: Number(oldRoomId),
                    CTSD_TRANGTHAI: 'ACTIVE',
                    CTSD_NGAY_DA_O: { gte: new Date(effectiveYMD) },
                },
                data: { CTSD_TRANGTHAI: 'DOI_PHONG' },
            });

            const last = await tx.cHI_TIET_SU_DUNG.findFirst({
                where: { HDONG_MA: bookingId, PHONG_MA: Number(newRoomId) },
                orderBy: { CTSD_STT: 'desc' },
                select: { CTSD_STT: true },
            });

            let nextStt = (last?.CTSD_STT ?? 0) + 1;

            for (const ymd of days) {
                let td_ma = baseTD_MA;
                for (const sp of specials) {
                    if (isInRange(ymd, sp.fromYMD, sp.toYMD)) {
                        td_ma = sp.TD_MA;
                        break;
                    }
                }

                const price = await getPrice(td_ma, tx);
                if (!price) throw new Error(`Thiếu đơn giá cho ngày ${ymd}`);

                await tx.cHI_TIET_SU_DUNG.create({
                    data: {
                        HDONG_MA: bookingId,
                        PHONG_MA: Number(newRoomId),
                        CTSD_STT: nextStt++,
                        CTSD_NGAY_DA_O: toFixedUTC5(ymd),
                        CTSD_SO_LUONG: 1,
                        CTSD_DON_GIA: price,
                        CTSD_TONG_TIEN: price,
                        CTSD_TRANGTHAI: 'ACTIVE',
                    },
                });
            }

            await tx.pHONG.update({
                where: { PHONG_MA: Number(oldRoomId) },
                data: { PHONG_TRANGTHAI: 'CHUA_DON' },
            });

            await tx.pHONG.update({
                where: { PHONG_MA: Number(newRoomId) },
                data: { PHONG_TRANGTHAI: 'OCCUPIED' },
            });
        });

        return res.json({
            success: true,
            message: `Đã đổi từ phòng ${oldRoomId} sang ${phongMoi.PHONG_TEN} (theo ngày).`,
        });

    } catch (e) {
        next(e);
    }
}

// POST /bookings/:id/no-show
async function markNoShow(req, res, next) {
    try {
        const id = Number(req.params.id);

        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            include: {
                CHI_TIET_SU_DUNG: true,
                CT_DAT_TRUOC: true,
            },
        });

        if (!booking)
            return res.status(404).json({ message: "Không tìm thấy hợp đồng" });

        if (booking.HDONG_TRANG_THAI !== "CONFIRMED")
            return res.status(400).json({ message: "Chỉ hợp đồng CONFIRMED mới được NO-SHOW" });

        // 1) cập nhật trạng thái hợp đồng
        await prisma.hOP_DONG_DAT_PHONG.update({
            where: { HDONG_MA: id },
            data: { HDONG_TRANG_THAI: "NO_SHOW" }
        });

        // 2) xóa CTSD
        await prisma.cHI_TIET_SU_DUNG.deleteMany({
            where: { HDONG_MA: id }
        });

        // 3) trả phòng về AVAILABLE


        // 4) hủy CT_DAT_TRUOC
        await prisma.cT_DAT_TRUOC.updateMany({
            where: { HDONG_MA: id },
            data: { TRANG_THAI: "CANCELLED" }
        });

        // 5) hóa đơn tiền cọc → VOID
        await prisma.hOA_DON.updateMany({
            where: {
                HDON_LOAI: "DEPOSIT",
                LIEN_KET: {
                    some: { HDONG_MA: id }
                }
            },
            data: {
                HDON_TRANG_THAI: "VOID"
            }
        });


        return res.json({ message: "Đã NO_SHOW hợp đồng." });
    } catch (e) {
        console.error(e);
        next(e);
    }
}



// controllers/booking_pos.js
// =======================================================
//  AJDUST CHECKOUT — xử lý cả extend & reduce (ngày + giờ)
// =======================================================
function getRangeFromCTSD(ctsd) {
    // Hợp đồng theo giờ
    if (ctsd.CTSD_O_TU_GIO && ctsd.CTSD_O_DEN_GIO) {
        return {
            start: new Date(ctsd.CTSD_O_TU_GIO),
            end: new Date(ctsd.CTSD_O_DEN_GIO),
            type: "HOUR"
        };
    }

    // Hợp đồng theo ngày
    if (ctsd.CTSD_NGAY_DA_O) {
        const start = new Date(ctsd.CTSD_NGAY_DA_O);
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return { start, end, type: "DAY" };
    }

    return null;
}
function isOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && aEnd > bStart;
}
async function checkOverlapFull(roomIds, bookingId, newStart, newEnd) {
    // Lấy toàn bộ CTSD ACTIVE của các hợp đồng khác
    const rows = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: {
            PHONG_MA: { in: roomIds },
            HDONG_MA: { not: bookingId },
            CTSD_TRANGTHAI: "ACTIVE"
        },
        include: {
            PHONG: { select: { PHONG_TEN: true } },
            HOP_DONG_DAT_PHONG: true
        }
    });

    for (const r of rows) {
        const range = getRangeFromCTSD(r);
        if (!range) continue;

        if (isOverlap(newStart, newEnd, range.start, range.end)) {
            return {
                conflict: true,
                roomName: r.PHONG.PHONG_TEN,
                booking: r.HDONG_MA,
                start: range.start,
                end: range.end,
                type: range.type
            };
        }
    }

    return { conflict: false };
}
async function reduceDay(booking, newTo, res) {
    const id = booking.HDONG_MA;
    const oldTo = new Date(booking.HDONG_NGAYTRA);
    const checkinTime = new Date(booking.HDONG_NGAYTHUCNHAN || booking.HDONG_NGAYDAT);
    if (newTo <= checkinTime) {
        return res.status(400).json({
            message: "Ngày trả mới không được nhỏ hơn ngày nhận phòng."
        });
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Không cho newTo < hôm nay
    if (newTo < today) {
        return res.status(400).json({
            message: "Không thể rút ngắn ngày trả về quá khứ."
        });
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const reduceNights = Math.floor((oldTo - newTo) / dayMs);

    if (reduceNights <= 0) {
        return res.status(400).json({ message: "Không có đêm nào để giảm." });
    }

    await prisma.cHI_TIET_SU_DUNG.deleteMany({
        where: {
            HDONG_MA: id,
            CTSD_TRANGTHAI: "ACTIVE",
            CTSD_NGAY_DA_O: {
                not: null,
                gte: newTo,
                lt: oldTo
            }
        }
    });

    await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: id },
        data: { HDONG_NGAYTRA: newTo }
    });

    return res.json({
        message: "Trả phòng sớm (theo ngày) thành công.",
        newCheckout: newTo,
        reducedNights: reduceNights
    });
}
async function reduceHour(booking, newTo, res) {
    const checkinTime = new Date(booking.HDONG_NGAYTHUCNHAN || booking.HDONG_NGAYDAT);
    if (newTo <= checkinTime) {
        return res.status(400).json({
            message: "Giờ trả mới không được nhỏ hơn giờ nhận phòng."
        });
    }

    const now = new Date();

    // 1) Không cho rút về quá khứ hoặc bằng thời điểm hiện tại
    if (newTo <= now) {
        return res.status(400).json({
            message: "Giờ trả mới phải lớn hơn thời điểm hiện tại."
        });
    }

    const rows = booking.CHI_TIET_SU_DUNG.filter(
        r => r.CTSD_TRANGTHAI === "ACTIVE" &&
            r.CTSD_O_TU_GIO && r.CTSD_O_DEN_GIO
    );

    for (const r of rows) {
        const start = new Date(r.CTSD_O_TU_GIO);
        const oldEnd = new Date(r.CTSD_O_DEN_GIO);

        if (newTo <= start) {
            return res.status(400).json({ message: "Giờ mới không hợp lệ." });
        }

        const oldMs = oldEnd - start;
        const newMs = newTo - start;
        if (oldMs <= 0) continue;

        const factor = newMs / oldMs;
        const oldTotal = Number(r.CTSD_TONG_TIEN || r.CTSD_DON_GIA || 0);
        const newTotal = Math.round(oldTotal * factor);

        await prisma.cHI_TIET_SU_DUNG.update({
            where: {
                HDONG_MA_PHONG_MA_CTSD_STT: {
                    HDONG_MA: r.HDONG_MA,
                    PHONG_MA: r.PHONG_MA,
                    CTSD_STT: r.CTSD_STT,
                },
            },
            data: {
                CTSD_O_DEN_GIO: newTo,
                CTSD_TONG_TIEN: newTotal
            }
        });
    }

    await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: booking.HDONG_MA },
        data: { HDONG_NGAYTRA: newTo }
    });

    return res.json({
        message: "Trả phòng sớm (theo giờ) thành công.",
        newCheckout: newTo
    });
}
async function extendDayLogic(booking, newTo, res) {
    const id = booking.HDONG_MA;
    const oldTo = new Date(booking.HDONG_NGAYTRA);
    const dayMs = 24 * 60 * 60 * 1000;

    const extraNights = Math.floor((newTo - oldTo) / dayMs);
    if (extraNights <= 0) {
        return res.status(400).json({ message: "Không có đêm để tăng." });
    }

    const rooms = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA: id, CTSD_TRANGTHAI: "ACTIVE" },
        select: { PHONG_MA: true },
        distinct: ["PHONG_MA"],
    });

    const roomIds = rooms.map(r => r.PHONG_MA);

    const overlap = await checkOverlapFull(
        roomIds,
        id,
        oldTo,
        newTo
    );

    if (overlap.conflict) {
        return res.status(400).json({
            message: `Không thể gia hạn. Phòng ${overlap.roomName} đã có hợp đồng #${overlap.booking} từ ${overlap.start.toLocaleString("vi-VN")} → ${overlap.end.toLocaleString("vi-VN")}.`,
        });
    }

    // Lấy max STT + giá
    const maxByRoom = await prisma.cHI_TIET_SU_DUNG.groupBy({
        by: ["PHONG_MA"],
        where: { HDONG_MA: id },
        _max: { CTSD_STT: true },
    });

    const maxMap = new Map();
    maxByRoom.forEach(r => maxMap.set(r.PHONG_MA, r._max.CTSD_STT || 0));

    const samples = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: {
            HDONG_MA: id,
            PHONG_MA: { in: roomIds },
            CTSD_NGAY_DA_O: { not: null }
        },
        select: { PHONG_MA: true, CTSD_DON_GIA: true }
    });

    const priceMap = new Map();
    samples.forEach(s => {
        if (!priceMap.has(s.PHONG_MA)) {
            priceMap.set(s.PHONG_MA, Number(s.CTSD_DON_GIA));
        }
    });

    // Tạo CTSD mới
    const dataToInsert = [];

    for (const roomId of roomIds) {
        let nextStt = (maxMap.get(roomId) || 0) + 1;
        const unit = priceMap.get(roomId) || 0;

        for (let i = 0; i < extraNights; i++) {
            const night = new Date(oldTo.getTime() + i * dayMs);

            dataToInsert.push({
                HDONG_MA: id,
                PHONG_MA: roomId,
                CTSD_STT: nextStt++,
                CTSD_NGAY_DA_O: night,
                CTSD_O_TU_GIO: null,
                CTSD_O_DEN_GIO: null,
                CTSD_SO_LUONG: 1,
                CTSD_DON_GIA: unit,
                CTSD_TONG_TIEN: unit,
                CTSD_TRANGTHAI: "ACTIVE",
            });
        }
    }

    if (dataToInsert.length) {
        await prisma.cHI_TIET_SU_DUNG.createMany({ data: dataToInsert });
    }

    await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: id },
        data: { HDONG_NGAYTRA: newTo }
    });

    return res.json({
        message: "Gia hạn theo ngày thành công.",
        newCheckout: newTo
    });
}
async function extendHourLogic(booking, newTo, res) {
    const id = booking.HDONG_MA;
    const oldTo = new Date(booking.HDONG_NGAYTRA);

    const rows = booking.CHI_TIET_SU_DUNG.filter(
        r => r.CTSD_TRANGTHAI === "ACTIVE" &&
            r.CTSD_O_TU_GIO && r.CTSD_O_DEN_GIO
    );

    const roomIds = [...new Set(rows.map(r => r.PHONG_MA))];

    const overlap = await checkOverlapFull(roomIds, id, oldTo, newTo);

    if (overlap.conflict) {
        return res.status(400).json({
            message: `Không thể gia hạn giờ. Phòng ${overlap.roomName} đã có hợp đồng #${overlap.booking} từ ${overlap.start.toLocaleString("vi-VN")} → ${overlap.end.toLocaleString("vi-VN")}.`,
        });
    }

    for (const r of rows) {
        const start = new Date(r.CTSD_O_TU_GIO);
        const oldEnd = new Date(r.CTSD_O_DEN_GIO);

        const oldMs = oldEnd - start;
        const newMs = newTo - start;
        if (oldMs <= 0) continue;

        const factor = newMs / oldMs;
        const newTotal = Math.round(Number(r.CTSD_TONG_TIEN) * factor);

        await prisma.cHI_TIET_SU_DUNG.update({
            where: {
                HDONG_MA_PHONG_MA_CTSD_STT: {
                    HDONG_MA: id,
                    PHONG_MA: r.PHONG_MA,
                    CTSD_STT: r.CTSD_STT
                }
            },
            data: {
                CTSD_O_DEN_GIO: newTo,
                CTSD_TONG_TIEN: newTotal
            }
        });
    }

    await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: id },
        data: { HDONG_NGAYTRA: newTo }
    });

    return res.json({
        message: "Gia hạn theo giờ thành công.",
        newCheckout: newTo
    });
}
async function adjustCheckout(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { newCheckout } = req.body;
        const newTo = new Date(newCheckout);

        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            include: {
                HINH_THUC_THUE: true,
                CHI_TIET_SU_DUNG: true
            }
        });

        const oldTo = new Date(booking.HDONG_NGAYTRA);
        const isHour = /giờ/i.test(booking.HINH_THUC_THUE.HT_TEN);

        if (newTo < oldTo) {
            return isHour ? reduceHour(booking, newTo, res) : reduceDay(booking, newTo, res);
        }

        if (newTo > oldTo) {
            return isHour ? extendHourLogic(booking, newTo, res) : extendDayLogic(booking, newTo, res);
        }

        return res.json({ message: "Không thay đổi" });

    } catch (e) {
        next(e);
    }
}


async function applyLateFee(req, res, next) {
    try {
        const id = Number(req.params.id);

        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            include: {
                CHI_TIET_SU_DUNG: true,
            },
        });

        if (!booking) {
            return res.status(404).json({ message: "Không tìm thấy hợp đồng." });
        }

        // ===================== TÍNH SỐ PHÚT TRỄ =====================
        const plannedCheckout = new Date(booking.HDONG_NGAYTRA).getTime();
        const now = Date.now();
        const diffMinutes = (now - plannedCheckout) / 60000;

        if (diffMinutes <= 15) {
            return res.status(400).json({
                message: "Chưa đủ 15 phút để tính phí trả phòng trễ."
            });
        }

        // Block giờ (làm tròn lên)
        const hoursLate = Math.ceil(diffMinutes / 60);

        // ===================== LẤY DỊCH VỤ =====================
        const feeService = await prisma.dICH_VU.findFirst({
            where: { DV_TEN: "Phí trả phòng trễ (giờ)" },
        });

        if (!feeService) {
            return res.status(500).json({
                message: "Không tìm thấy dịch vụ 'Phí trả phòng trễ (giờ)'."
            });
        }

        // ===================== LẤY CTSD MỚI NHẤT MỖI PHÒNG =====================
        const latestCtsd = await prisma.cHI_TIET_SU_DUNG.groupBy({
            by: ["PHONG_MA"],
            where: {
                HDONG_MA: id,
                CTSD_TRANGTHAI: "ACTIVE",
            },
            _max: {
                CTSD_STT: true,
            },
        });

        if (!latestCtsd.length) {
            return res.status(400).json({
                message: "Không có phòng ACTIVE trong hợp đồng."
            });
        }

        // ===================== XỬ LÝ TỪNG PHÒNG =====================
        for (const row of latestCtsd) {
            const phongId = row.PHONG_MA;
            const ctsdStt = row._max.CTSD_STT;

            // Kiểm tra xem phòng này đã từng được tính phí trễ chưa
            const existingLateFee = await prisma.cHI_TIET_DICH_VU.findFirst({
                where: {
                    HDONG_MA: id,
                    PHONG_MA: phongId,
                    CTSD_STT: ctsdStt,
                    DV_MA: feeService.DV_MA,
                    CTDV_TRANGTHAI: "ACTIVE",
                },
            });

            if (existingLateFee) {
                // 🔥 Đã có phí trễ → UPDATE số lượng nếu lần này trễ hơn 🔥
                if (hoursLate > existingLateFee.CTDV_SOLUONG) {
                    await prisma.cHI_TIET_DICH_VU.update({
                        where: {
                            HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: {
                                HDONG_MA: id,
                                PHONG_MA: phongId,
                                CTSD_STT: ctsdStt,
                                DV_MA: feeService.DV_MA,
                                CTDV_STT: existingLateFee.CTDV_STT
                            }
                        },
                        data: {
                            CTDV_SOLUONG: hoursLate,
                            CTDV_DONGIA: feeService.DV_DONGIA,
                            CTDV_GHICHU: "Phụ thu trả phòng trễ (cập nhật giờ)",
                        },
                    });
                }
            } else {
                // 🔥 Chưa có phí trễ → TẠO CTDV MỚI 🔥
                const lastCtdv = await prisma.cHI_TIET_DICH_VU.findFirst({
                    where: {
                        HDONG_MA: id,
                        PHONG_MA: phongId,
                        CTSD_STT: ctsdStt,
                    },
                    orderBy: {
                        CTDV_STT: "desc",
                    },
                });

                const nextStt = (lastCtdv?.CTDV_STT || 0) + 1;

                await prisma.cHI_TIET_DICH_VU.create({
                    data: {
                        HDONG_MA: id,
                        PHONG_MA: phongId,
                        CTSD_STT: ctsdStt,
                        DV_MA: feeService.DV_MA,
                        CTDV_STT: nextStt,
                        CTDV_NGAY: new Date(),
                        CTDV_SOLUONG: hoursLate,
                        CTDV_DONGIA: feeService.DV_DONGIA,
                        CTDV_GHICHU: "Phụ thu trả phòng trễ",
                        CTDV_TRANGTHAI: "ACTIVE",
                    },
                });
            }
        }

        return res.json({
            message: `Đã áp dụng phí trả phòng trễ ${hoursLate} giờ.`,
            hoursLate,
        });

    } catch (e) {
        next(e);
    }
}

// =======================================================
//  ADJUST CHECKIN — chỉnh NGÀY / GIỜ NHẬN (đầu khoảng)
//  Chỉ cho phép khi HĐ chưa CHECKED_IN
// =======================================================

async function extendDayAtStart(booking, newFrom, res) {
    const id = booking.HDONG_MA;
    const oldFrom = new Date(booking.HDONG_NGAYDAT);
    const dayMs = 24 * 60 * 60 * 1000;

    const extraNights = Math.floor((oldFrom - newFrom) / dayMs);
    if (extraNights <= 0) {
        return res.status(400).json({ message: "Không có đêm nào để tăng ở đầu." });
    }

    // Lấy các phòng đang ACTIVE trong HĐ
    const rooms = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA: id, CTSD_TRANGTHAI: "ACTIVE" },
        select: { PHONG_MA: true },
        distinct: ["PHONG_MA"],
    });
    const roomIds = rooms.map(r => r.PHONG_MA);

    // Check overlap: chiếm thêm khoảng [newFrom, oldFrom)
    const overlap = await checkOverlapFull(roomIds, id, newFrom, oldFrom);
    if (overlap.conflict) {
        return res.status(400).json({
            message: `Không thể dời ngày nhận sớm hơn. Phòng ${overlap.roomName} đã có hợp đồng #${overlap.booking} từ ${overlap.start.toLocaleString("vi-VN")} → ${overlap.end.toLocaleString("vi-VN")}.`,
        });
    }

    // Lấy max STT theo từng phòng
    const maxByRoom = await prisma.cHI_TIET_SU_DUNG.groupBy({
        by: ["PHONG_MA"],
        where: { HDONG_MA: id },
        _max: { CTSD_STT: true },
    });
    const maxMap = new Map();
    maxByRoom.forEach(r => maxMap.set(r.PHONG_MA, r._max.CTSD_STT || 0));

    // Lấy đơn giá mẫu theo phòng (giống extendDayLogic)
    const samples = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: {
            HDONG_MA: id,
            PHONG_MA: { in: roomIds },
            CTSD_NGAY_DA_O: { not: null }
        },
        select: { PHONG_MA: true, CTSD_DON_GIA: true }
    });
    const priceMap = new Map();
    samples.forEach(s => {
        if (!priceMap.has(s.PHONG_MA)) {
            priceMap.set(s.PHONG_MA, Number(s.CTSD_DON_GIA));
        }
    });

    // Tạo các dòng CTSD mới ở đầu khoảng: [newFrom, oldFrom)
    const dataToInsert = [];
    for (const roomId of roomIds) {
        let nextStt = (maxMap.get(roomId) || 0) + 1;
        const unit = priceMap.get(roomId) || 0;

        for (let i = 0; i < extraNights; i++) {
            const night = new Date(newFrom.getTime() + i * dayMs);

            dataToInsert.push({
                HDONG_MA: id,
                PHONG_MA: roomId,
                CTSD_STT: nextStt++,
                CTSD_NGAY_DA_O: night,
                CTSD_O_TU_GIO: null,
                CTSD_O_DEN_GIO: null,
                CTSD_SO_LUONG: 1,
                CTSD_DON_GIA: unit,
                CTSD_TONG_TIEN: unit,
                CTSD_TRANGTHAI: "ACTIVE",
            });
        }
    }

    if (dataToInsert.length) {
        await prisma.cHI_TIET_SU_DUNG.createMany({ data: dataToInsert });
    }

    await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: id },
        data: { HDONG_NGAYDAT: newFrom },
    });

    return res.json({
        message: "Đã dời ngày nhận sớm hơn (theo ngày) thành công.",
        newCheckin: newFrom,
        addedNights: extraNights,
    });
}

async function reduceDayAtStart(booking, newFrom, res) {
    const id = booking.HDONG_MA;
    const oldFrom = new Date(booking.HDONG_NGAYDAT);
    const dayMs = 24 * 60 * 60 * 1000;

    const reduceNights = Math.floor((newFrom - oldFrom) / dayMs);
    if (reduceNights <= 0) {
        return res.status(400).json({ message: "Không có đêm nào để giảm ở đầu." });
    }

    // Không cho dời ngày nhận mới >= ngày trả hiện tại
    const oldTo = new Date(booking.HDONG_NGAYTRA);
    if (newFrom >= oldTo) {
        return res.status(400).json({
            message: "Ngày nhận mới không được lớn hơn hoặc bằng ngày trả.",
        });
    }

    await prisma.cHI_TIET_SU_DUNG.deleteMany({
        where: {
            HDONG_MA: id,
            CTSD_TRANGTHAI: "ACTIVE",
            CTSD_NGAY_DA_O: {
                not: null,
                gte: oldFrom,
                lt: newFrom,
            },
        },
    });

    await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: id },
        data: { HDONG_NGAYDAT: newFrom },
    });

    return res.json({
        message: "Đã dời ngày nhận trễ hơn (theo ngày) thành công.",
        newCheckin: newFrom,
        reducedNights: reduceNights,
    });
}

// Với THEO GIỜ: tạm thời CHỈ chỉnh mốc giờ, chưa đụng tới tính tiền
async function extendHourAtStart(booking, newFrom, res) {
    const id = booking.HDONG_MA;
    const oldFrom = new Date(booking.HDONG_NGAYDAT);
    const oldTo = new Date(booking.HDONG_NGAYTRA);

    if (newFrom >= oldFrom) {
        return res.status(400).json({ message: "Giờ nhận mới phải nhỏ hơn giờ nhận cũ." });
    }
    if (newFrom >= oldTo) {
        return res.status(400).json({ message: "Giờ nhận mới không được lớn hơn giờ trả." });
    }

    const rows = booking.CHI_TIET_SU_DUNG.filter(
        r =>
            r.CTSD_TRANGTHAI === "ACTIVE" &&
            r.CTSD_O_TU_GIO && r.CTSD_O_DEN_GIO
    );
    if (!rows.length) {
        return res.status(400).json({ message: "Không tìm thấy dòng CTSD theo giờ để chỉnh." });
    }

    // Check overlap: chiếm thêm [newFrom, oldFrom)
    const roomIds = [...new Set(rows.map(r => r.PHONG_MA))];
    const overlap = await checkOverlapFull(roomIds, id, newFrom, oldFrom);
    if (overlap.conflict) {
        return res.status(400).json({
            message: `Không thể dời giờ nhận sớm hơn. Phòng ${overlap.roomName} đã có hợp đồng #${overlap.booking} từ ${overlap.start.toLocaleString("vi-VN")} → ${overlap.end.toLocaleString("vi-VN")}.`,
        });
    }

    // Tạm thời chỉ cập nhật O_TU_GIO + HDONG_NGAYDAT, không động tới TONG_TIEN
    for (const r of rows) {
        await prisma.cHI_TIET_SU_DUNG.update({
            where: {
                HDONG_MA_PHONG_MA_CTSD_STT: {
                    HDONG_MA: r.HDONG_MA,
                    PHONG_MA: r.PHONG_MA,
                    CTSD_STT: r.CTSD_STT,
                },
            },
            data: { CTSD_O_TU_GIO: newFrom },
        });
    }

    await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: id },
        data: { HDONG_NGAYDAT: newFrom },
    });

    return res.json({
        message: "Đã dời giờ nhận sớm hơn (theo giờ) thành công (chưa tính lại tiền).",
        newCheckin: newFrom,
    });
}

async function reduceHourAtStart(booking, newFrom, res) {
    const id = booking.HDONG_MA;
    const oldFrom = new Date(booking.HDONG_NGAYDAT);
    const oldTo = new Date(booking.HDONG_NGAYTRA);

    if (newFrom <= oldFrom) {
        return res.status(400).json({ message: "Giờ nhận mới phải lớn hơn giờ nhận cũ." });
    }
    if (newFrom >= oldTo) {
        return res.status(400).json({ message: "Giờ nhận mới không được lớn hơn giờ trả." });
    }

    const rows = booking.CHI_TIET_SU_DUNG.filter(
        r =>
            r.CTSD_TRANGTHAI === "ACTIVE" &&
            r.CTSD_O_TU_GIO && r.CTSD_O_DEN_GIO
    );
    if (!rows.length) {
        return res.status(400).json({ message: "Không tìm thấy dòng CTSD theo giờ để chỉnh." });
    }

    // Chỉ cập nhật giờ bắt đầu, chưa xử lý tiền
    for (const r of rows) {
        const end = new Date(r.CTSD_O_DEN_GIO);
        if (newFrom >= end) {
            return res.status(400).json({ message: "Giờ nhận mới không hợp lệ (>= giờ trả của dòng phòng)." });
        }

        await prisma.cHI_TIET_SU_DUNG.update({
            where: {
                HDONG_MA_PHONG_MA_CTSD_STT: {
                    HDONG_MA: r.HDONG_MA,
                    PHONG_MA: r.PHONG_MA,
                    CTSD_STT: r.CTSD_STT,
                },
            },
            data: { CTSD_O_TU_GIO: newFrom },
        });
    }

    await prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: id },
        data: { HDONG_NGAYDAT: newFrom },
    });

    return res.json({
        message: "Đã dời giờ nhận trễ hơn (theo giờ) thành công (chưa tính lại tiền).",
        newCheckin: newFrom,
    });
}


// entry chính: POST /bookings/:id/adjust-checkin
async function adjustCheckin(req, res, next) {
    try {
        const id = Number(req.params.id);
        const { newCheckin } = req.body || {};
        const newFrom = new Date(newCheckin);

        if (!id || !newCheckin || Number.isNaN(+newFrom)) {
            return res.status(400).json({ message: "Thiếu hoặc sai dữ liệu newCheckin." });
        }

        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            include: {
                HINH_THUC_THUE: true,
                CHI_TIET_SU_DUNG: true,
            },
        });

        if (!booking) {
            return res.status(404).json({ message: "Không tìm thấy hợp đồng." });
        }

        // Chỉ cho chỉnh khi chưa nhận phòng
        if (booking.HDONG_TRANG_THAI === "CHECKED_IN") {
            return res.status(400).json({ message: "Hợp đồng đã CHECKED_IN, không thể chỉnh ngày/giờ nhận." });
        }

        const oldFrom = new Date(booking.HDONG_NGAYDAT);
        if (newFrom.getTime() === oldFrom.getTime()) {
            return res.json({ message: "Ngày/giờ nhận không thay đổi." });
        }

        const isHour = /giờ/i.test(booking.HINH_THUC_THUE?.HT_TEN || "");

        if (!isHour) {
            // THEO NGÀY
            if (newFrom < oldFrom) {
                // dời sớm
                return extendDayAtStart(booking, newFrom, res);
            } else {
                // dời trễ
                return reduceDayAtStart(booking, newFrom, res);
            }
        } else {
            // THEO GIỜ
            if (newFrom < oldFrom) {
                return extendHourAtStart(booking, newFrom, res);
            } else {
                return reduceHourAtStart(booking, newFrom, res);
            }
        }
    } catch (e) {
        next(e);
    }
}


async function applyEarlyCheckinFee(req, res, next) {
    try {
        const id = Number(req.params.id);

        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            include: {
                CHI_TIET_SU_DUNG: true,
            },
        });

        if (!booking) {
            return res.status(404).json({ message: "Không tìm thấy hợp đồng." });
        }

        // ===================== MỐC THỜI GIAN =====================
        const plannedCheckin = new Date(booking.HDONG_NGAYDAT);
        plannedCheckin.setHours(14, 0, 0, 0); // 14:00

        const graceTime = new Date(booking.HDONG_NGAYDAT);
        graceTime.setHours(13, 45, 0, 0); // 13:45 du di

        const earliestAllowed = new Date(booking.HDONG_NGAYDAT);
        earliestAllowed.setHours(6, 0, 0, 0); // 06:00

        const now = new Date();

        // ===================== CHECK QUÁ SỚM =====================
        if (now < earliestAllowed) {
            return res.status(400).json({
                message: "Nhận phòng quá sớm, vui lòng điều chỉnh ngày nhận phòng (tính như 1 đêm).",
            });
        }

        // ===================== TRONG KHOẢNG DU DI =====================
        if (now >= graceTime) {
            return res.status(400).json({
                message: "Nhận phòng trong thời gian du di, không cần tính phí.",
            });
        }

        // ===================== TÍNH SỐ PHÚT NHẬN SỚM =====================
        const diffMinutes = (graceTime.getTime() - now.getTime()) / 60000;

        if (diffMinutes <= 0) {
            return res.status(400).json({
                message: "Không cần tính phí nhận phòng sớm.",
            });
        }

        // Block giờ (làm tròn lên)
        const hoursEarly = Math.ceil(diffMinutes / 60);

        // ===================== LẤY DỊCH VỤ =====================
        const feeService = await prisma.dICH_VU.findFirst({
            where: { DV_TEN: "Phí nhận phòng sớm (giờ)" },
        });

        if (!feeService) {
            return res.status(500).json({
                message: "Không tìm thấy dịch vụ 'Phí nhận phòng sớm (giờ)'.",
            });
        }

        // ===================== LẤY CTSD ACTIVE MỚI NHẤT MỖI PHÒNG =====================
        const latestCtsd = await prisma.cHI_TIET_SU_DUNG.groupBy({
            by: ["PHONG_MA"],
            where: {
                HDONG_MA: id,
                CTSD_TRANGTHAI: "ACTIVE",
            },
            _max: {
                CTSD_STT: true,
            },
        });

        if (!latestCtsd.length) {
            return res.status(400).json({
                message: "Không có phòng ACTIVE trong hợp đồng.",
            });
        }

        // ===================== XỬ LÝ TỪNG PHÒNG =====================
        for (const row of latestCtsd) {
            const phongId = row.PHONG_MA;
            const ctsdStt = row._max.CTSD_STT;

            const existingFee = await prisma.cHI_TIET_DICH_VU.findFirst({
                where: {
                    HDONG_MA: id,
                    PHONG_MA: phongId,
                    CTSD_STT: ctsdStt,
                    DV_MA: feeService.DV_MA,
                    CTDV_TRANGTHAI: "ACTIVE",
                },
            });

            if (existingFee) {
                // 🔁 Update nếu giờ sớm tăng
                if (hoursEarly > existingFee.CTDV_SOLUONG) {
                    await prisma.cHI_TIET_DICH_VU.update({
                        where: {
                            HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: {
                                HDONG_MA: id,
                                PHONG_MA: phongId,
                                CTSD_STT: ctsdStt,
                                DV_MA: feeService.DV_MA,
                                CTDV_STT: existingFee.CTDV_STT,
                            },
                        },
                        data: {
                            CTDV_SOLUONG: hoursEarly,
                            CTDV_DONGIA: feeService.DV_DONGIA,
                            CTDV_GHICHU: "Phụ thu nhận phòng sớm (cập nhật giờ)",
                        },
                    });
                }
            } else {
                // ➕ Tạo CTDV mới
                const lastCtdv = await prisma.cHI_TIET_DICH_VU.findFirst({
                    where: {
                        HDONG_MA: id,
                        PHONG_MA: phongId,
                        CTSD_STT: ctsdStt,
                    },
                    orderBy: {
                        CTDV_STT: "desc",
                    },
                });

                const nextStt = (lastCtdv?.CTDV_STT || 0) + 1;

                await prisma.cHI_TIET_DICH_VU.create({
                    data: {
                        HDONG_MA: id,
                        PHONG_MA: phongId,
                        CTSD_STT: ctsdStt,
                        DV_MA: feeService.DV_MA,
                        CTDV_STT: nextStt,
                        CTDV_NGAY: new Date(),
                        CTDV_SOLUONG: hoursEarly,
                        CTDV_DONGIA: feeService.DV_DONGIA,
                        CTDV_GHICHU: "Phụ thu nhận phòng sớm",
                        CTDV_TRANGTHAI: "ACTIVE",
                    },
                });
            }
        }

        return res.json({
            message: `Đã áp dụng phí nhận phòng sớm ${hoursEarly} giờ.`,
            hoursEarly,
        });

    } catch (e) {
        next(e);
    }
}

async function changePrimaryGuest(req, res) {
    const bookingId = Number(req.params.bookingId);
    const { from_kh, to_kh } = req.body || {};

    if (!bookingId || !from_kh || !to_kh) {
        return res.status(400).json({
            message: 'Thiếu bookingId, from_kh hoặc to_kh',
        });
    }

    if (from_kh === to_kh) {
        return res.status(400).json({
            message: 'Khách chính mới phải khác khách chính hiện tại',
        });
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 1️⃣ kiểm tra from_kh hiện tại có phải khách chính không
            const currentPrimary = await tx.lUU_TRU_KHACH.findUnique({
                where: {
                    HDONG_MA_KH_MA: {
                        HDONG_MA: bookingId,
                        KH_MA: Number(from_kh),
                    },
                },
            });

            if (!currentPrimary || !currentPrimary.LA_KHACH_CHINH) {
                throw Object.assign(
                    new Error('Khách hiện tại không phải là khách chính'),
                    { status: 400 }
                );
            }

            // 2️⃣ kiểm tra to_kh có thuộc hợp đồng không
            const targetGuest = await tx.lUU_TRU_KHACH.findUnique({
                where: {
                    HDONG_MA_KH_MA: {
                        HDONG_MA: bookingId,
                        KH_MA: Number(to_kh),
                    },
                },
            });

            if (!targetGuest) {
                throw Object.assign(
                    new Error('Khách được chọn không thuộc hợp đồng này'),
                    { status: 400 }
                );
            }

            // 3️⃣ bỏ cờ khách chính cũ
            await tx.lUU_TRU_KHACH.update({
                where: {
                    HDONG_MA_KH_MA: {
                        HDONG_MA: bookingId,
                        KH_MA: Number(from_kh),
                    },
                },
                data: { LA_KHACH_CHINH: false },
            });

            // 4️⃣ set khách chính mới
            await tx.lUU_TRU_KHACH.update({
                where: {
                    HDONG_MA_KH_MA: {
                        HDONG_MA: bookingId,
                        KH_MA: Number(to_kh),
                    },
                },
                data: { LA_KHACH_CHINH: true },
            });
        });

        return res.json({ success: true });
    } catch (e) {
        console.error(e);
        return res.status(e.status || 500).json({
            message: e.message || 'Không thể chuyển khách chính',
        });
    }
};

module.exports = {
    getBookingFull,
    searchProducts,
    addService,
    updateService,
    removeService,
    addItemToExisting,
    removeRoom,
    changeRoom,
    pendingRooms,
    addRoomForCheckedIn,
    markNoShow,
    adjustCheckout,
    applyLateFee,
    adjustCheckin,
    applyEarlyCheckinFee,
    changePrimaryGuest
};
