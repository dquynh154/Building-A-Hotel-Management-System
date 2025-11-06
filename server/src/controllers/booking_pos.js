// controllers/booking_pos.js
const { prisma } = require('../db/prisma');

/** =========================
 *  Helpers
 * ======================= */
function toNumber(n, d = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? x : d;
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
                HDONG_NGAYTHUCNHAN :true,
                HDONG_NGAYTHUCTRA : true,
            },
        });
        if (!hd) return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });

        // Các dòng PHÒNG - CHI_TIET_SU_DUNG
        const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: {
                HDONG_MA: id,
                CTSD_TRANGTHAI: { in: ['ACTIVE'] },
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


        // === TÍNH TỔNG THỰC TẾ GỒM CẢ INVOICED ===
        const allCtsdForTotal = await prisma.cHI_TIET_SU_DUNG.findMany({
            where: {
                HDONG_MA: id,
                CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
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
            };
        });

        // Các dòng DỊCH VỤ - CHI_TIET_DICH_VU (đúng theo schema)
        const ctdv = await prisma.cHI_TIET_DICH_VU.findMany({
            where: {
                HDONG_MA: id,
                CTDV_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
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
                tien_coc: hd.HDONG_TIENCOCYEUCAU|| null,
                thuc_nhan: hd.HDONG_NGAYTHUCNHAN ||null,
                thuc_tra: hd.HDONG_NGAYTHUCTRA||null,
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
        const { PHONG_MA, CTSD_STT, DV_MA, CTDV_SOLUONG, CTDV_DONGIA, CTDV_GHICHU } = req.body || {};

        if (!hdId || !ctdvStt || !PHONG_MA || !CTSD_STT || !DV_MA) {
            return res
                .status(400)
                .json({ message: 'Thiếu khoá: HDONG_MA / PHONG_MA / CTSD_STT / DV_MA / CTDV_STT' });
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
async function removeService(req, res, next) {
    try {
        const hdId = toNumber(req.params.id);
        const ctdvStt = toNumber(req.params.ctdvStt);
        const { PHONG_MA, CTSD_STT, DV_MA } = req.body || {};

        if (!hdId || !ctdvStt || !PHONG_MA || !CTSD_STT || !DV_MA) {
            return res
                .status(400)
                .json({ message: 'Thiếu khoá: HDONG_MA / PHONG_MA / CTSD_STT / DV_MA / CTDV_STT' });
        }

        await prisma.cHI_TIET_DICH_VU.delete({
            where: {
                HDONG_MA_PHONG_MA_CTSD_STT_DV_MA_CTDV_STT: {
                    HDONG_MA: Number(hdId),
                    PHONG_MA: Number(PHONG_MA),
                    CTSD_STT: Number(CTSD_STT),
                    DV_MA: Number(DV_MA),
                    CTDV_STT: Number(ctdvStt),
                },
            },
        });

        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
}
// POST /bookings/:id/add-room

// POST /bookings/:id/add-room
async function addItemToExisting(req, res, next) {
    try {
        const bookingId = Number(req.params.id);
        const { PHONG_MA, LP_MA: LP_MA_REQ } = req.body || {};

        if (!bookingId || !PHONG_MA)
            return res.status(400).json({ message: 'Thiếu dữ liệu.' });

        // 1️⃣ Lấy hợp đồng
        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: bookingId },
            include: { HINH_THUC_THUE: true },
        });
        if (!booking)
            return res.status(404).json({ message: 'Không tìm thấy hợp đồng.' });

        const { HDONG_NGAYDAT, HDONG_NGAYTRA, HT_MA } = booking;

        // 2️⃣ Lấy LP_MA của phòng
        const phong = await prisma.pHONG.findUnique({
            where: { PHONG_MA: Number(PHONG_MA) },
            select: { LP_MA: true, PHONG_TEN: true },
        });
        if (!phong) return res.status(404).json({ message: 'Không tìm thấy phòng.' });

        const { LP_MA } = phong;

        // 3️⃣ Lấy THOI_DIEM hiện hành
        const td = await prisma.tHOI_DIEM.findFirst({
            where: { TD_TRANGTHAI: true },
            select: { TD_MA: true },
        });
        if (!td) return res.status(404).json({ message: 'Không có thời điểm định giá.' });

        // 4️⃣ Tra đơn giá
        const donGiaRow = await prisma.dON_GIA.findUnique({
            where: {
                LP_MA_HT_MA_TD_MA: {
                    LP_MA,
                    HT_MA,
                    TD_MA: td.TD_MA,
                },
            },
            select: { DG_DONGIA: true },
        });
        if (!donGiaRow)
            return res.status(404).json({ message: 'Không tìm thấy đơn giá phù hợp.' });

        const donGia = Number(donGiaRow.DG_DONGIA);

        // 5️⃣ Sinh các ngày giữa khoảng đặt (fix mốc UTC 05:00:00)
        const start = new Date(HDONG_NGAYDAT);
        const end = new Date(HDONG_NGAYTRA);
        const dates = [];

        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
            // ép mỗi ngày về đúng 05:00 UTC (tức 12:00 VN)
            const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 5, 0, 0));
            dates.push(utc);
        }


        if (dates.length === 0)
            return res.status(400).json({ message: 'Không xác định được số đêm để thêm.' });

        // 6️⃣ Lấy CTSD_STT hiện tại và bắt đầu tăng dần
        const last = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: { HDONG_MA: bookingId, PHONG_MA: Number(PHONG_MA) },
            orderBy: { CTSD_STT: 'desc' },
            select: { CTSD_STT: true },
        });
        let nextStt = (last?.CTSD_STT ?? 0) + 1;



        // 7️⃣ Tạo nhiều bản ghi CTSD (1 bản ghi/đêm)
        const dataToInsert = dates.map((ngay) => ({
            HDONG_MA: bookingId,
            PHONG_MA: Number(PHONG_MA),
            CTSD_STT: nextStt++,
            CTSD_NGAY_DA_O: ngay,
            CTSD_SO_LUONG: 1,
            CTSD_DON_GIA: donGia,
            CTSD_TONG_TIEN: donGia,
            CTSD_TRANGTHAI: 'ACTIVE',
        }));

        await prisma.cHI_TIET_SU_DUNG.createMany({ data: dataToInsert });
        await prisma.cT_DAT_TRUOC.updateMany({
            where: {
                HDONG_MA: bookingId,
                LP_MA: LP_MA || phong.LP_MA,
                TRANG_THAI: { in: ['CONFIRMED'] },
            },
            data: { TRANG_THAI: 'ALLOCATED' },
        });
        res.status(201).json({
            message: `Đã thêm ${phong.PHONG_TEN} vào hợp đồng.`,
            donGia,
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
            where: { HDONG_MA: id, TRANG_THAI: 'CONFIRMED' },
            include: { LOAI_PHONG: { select: { LP_TEN: true } } },
        });

        res.json(rows.map(r => ({
            LP_MA: r.LP_MA,
            LP_TEN: r.LOAI_PHONG?.LP_TEN || '',
            SO_LUONG: r.SO_LUONG,
        })));
    } catch (e) { next(e); }
}


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
async function changeRoom(req, res, next) {
    try {
        const bookingId = Number(req.params.id);
        const { oldRoomId, newRoomId, reason } = req.body || {};

        if (!bookingId || !oldRoomId || !newRoomId) {
            return res.status(400).json({ message: "Thiếu thông tin đổi phòng." });
        }

        // 1️⃣ Lấy hợp đồng
        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: bookingId },
            include: {
                HINH_THUC_THUE: true,
                CHI_TIET_SU_DUNG: true,
            },
        });

        if (!booking) return res.status(404).json({ message: "Không tìm thấy hợp đồng." });
        if (booking.HDONG_TRANG_THAI !== "CHECKED_IN") {
            return res.status(400).json({ message: "Chỉ đổi phòng khi khách đang ở." });
        }

        // 2️⃣ Kiểm tra phòng mới có trống không trong khoảng còn lại
        const now = new Date();
        const available = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: {
                PHONG_MA: newRoomId,
                HOP_DONG_DAT_PHONG: {
                    HDONG_TRANG_THAI: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] },
                    HDONG_NGAYDAT: { lt: booking.HDONG_NGAYTRA },
                    HDONG_NGAYTRA: { gt: now },
                },
            },
        });
        if (available) {
            return res.status(409).json({ message: "Phòng mới đang có người đặt hoặc sử dụng." });
        }

        // 3️⃣ Lấy thông tin phòng mới & đơn giá
        const phongMoi = await prisma.pHONG.findUnique({
            where: { PHONG_MA: newRoomId },
            include: { LOAI_PHONG: true },
        });
        if (!phongMoi) return res.status(404).json({ message: "Không tìm thấy phòng mới." });

        // Lấy đơn giá từ bảng DON_GIA
        const donGiaObj = await prisma.dON_GIA.findFirst({
            where: {
                LP_MA: phongMoi.LP_MA,
                HT_MA: booking.HT_MA,
            },
            select: { DG_DONGIA: true },
        });
        const donGia = Number(donGiaObj?.DG_DONGIA || 0);

        // 4️⃣ Xử lý theo hình thức
        const isHourly = booking.HT_MA === 1; // ví dụ HT_MA=1 là theo giờ, 2 là theo ngày
        const isNightly = booking.HT_MA === 2;

        if (isHourly) {
            // THEO GIỜ
            await prisma.$transaction(async (tx) => {
                // a) Kết thúc CTSD phòng cũ
                await tx.cHI_TIET_SU_DUNG.updateMany({
                    where: {
                        HDONG_MA: bookingId,
                        PHONG_MA: oldRoomId,
                        CTSD_TRANGTHAI: "ACTIVE",
                    },
                    data: {
                        CTSD_O_DEN_GIO: now,
                        CTSD_TRANGTHAI: "INVOICED",
                    },
                });

                // b) Tạo CTSD mới
                const last = await tx.cHI_TIET_SU_DUNG.findFirst({
                    where: { HDONG_MA: bookingId, PHONG_MA: newRoomId },
                    orderBy: { CTSD_STT: "desc" },
                    select: { CTSD_STT: true },
                });
                const nextStt = (last?.CTSD_STT ?? 0) + 1;

                await tx.cHI_TIET_SU_DUNG.create({
                    data: {
                        HDONG_MA: bookingId,
                        PHONG_MA: newRoomId,
                        CTSD_STT: nextStt,
                        CTSD_O_TU_GIO: now,
                        CTSD_O_DEN_GIO: booking.HDONG_NGAYTRA,
                        CTSD_SO_LUONG: 1,
                        CTSD_DON_GIA: donGia,
                        CTSD_TONG_TIEN: donGia,
                        CTSD_TRANGTHAI: "ACTIVE",
                    },
                });

                // c) Cập nhật trạng thái phòng
                await tx.pHONG.update({
                    where: { PHONG_MA: oldRoomId },
                    data: { PHONG_TRANGTHAI: "CHUA_DON" },
                });
                await tx.pHONG.update({
                    where: { PHONG_MA: newRoomId },
                    data: { PHONG_TRANGTHAI: "OCCUPIED" },
                });

                // d) Ghi lịch sử đổi phòng
                await tx.lICH_SU_DOI_PHONG?.create?.({
                    data: {
                        HDONG_MA: bookingId,
                        PHONG_CU: oldRoomId,
                        PHONG_MOI: newRoomId,
                        THOI_GIAN_DOI: now,
                        LY_DO: reason || null,
                    },
                });
            });
        } else if (isNightly) {
            // THEO NGÀY
            const end = new Date(booking.HDONG_NGAYTRA);
            const start = new Date(now);
            start.setUTCHours(5, 0, 0, 0); // fix mốc 05:00 UTC

            const dates = [];
            for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
                const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 5, 0, 0));
                dates.push(utc);
            }

            await prisma.$transaction(async (tx) => {
                // a) Cập nhật CTSD cũ
                await tx.cHI_TIET_SU_DUNG.updateMany({
                    where: {
                        HDONG_MA: bookingId,
                        PHONG_MA: oldRoomId,
                        CTSD_TRANGTHAI: "ACTIVE",
                        CTSD_NGAY_DA_O: { gte: start },
                    },
                    data: { CTSD_TRANGTHAI: "INVOICED" },
                });

                // b) Tạo CTSD mới
                const last = await tx.cHI_TIET_SU_DUNG.findFirst({
                    where: { HDONG_MA: bookingId, PHONG_MA: newRoomId },
                    orderBy: { CTSD_STT: "desc" },
                    select: { CTSD_STT: true },
                });
                let nextStt = (last?.CTSD_STT ?? 0) + 1;

                for (const day of dates) {
                    await tx.cHI_TIET_SU_DUNG.create({
                        data: {
                            HDONG_MA: bookingId,
                            PHONG_MA: newRoomId,
                            CTSD_STT: nextStt++,
                            CTSD_NGAY_DA_O: day,
                            CTSD_SO_LUONG: 1,
                            CTSD_DON_GIA: donGia,
                            CTSD_TONG_TIEN: donGia,
                            CTSD_TRANGTHAI: "ACTIVE",
                        },
                    });
                }

                // c) Cập nhật trạng thái phòng
                await tx.pHONG.update({
                    where: { PHONG_MA: oldRoomId },
                    data: { PHONG_TRANGTHAI: "CHUA_DON" },
                });
                await tx.pHONG.update({
                    where: { PHONG_MA: newRoomId },
                    data: { PHONG_TRANGTHAI: "OCCUPIED" },
                });

                
            });
        }

        res.json({
            success: true,
            message: `Đã đổi từ phòng ${oldRoomId} sang ${phongMoi.PHONG_TEN} thành công.`,
        });
    } catch (e) {
        next(e);
    }
}


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
};
