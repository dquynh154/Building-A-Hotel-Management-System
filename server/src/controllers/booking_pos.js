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
                CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
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

        const totalRooms = rooms.reduce((s, r) => s + (r.tong_tien || 0), 0);
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
        let ctsdRow = null;
        const now = new Date();
        if (Number(hd.HT_MA) === 1) {
            // THEO NGÀY/ĐÊM: match theo khung 12:00–12:00 GIỜ VN (so sánh ở UTC)
            const [prevNoonUtc, nextNoonUtc] = vnNoonWindowUTC(now);
            ctsdRow = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    HDONG_MA: hdId,
                    PHONG_MA: Number(PHONG_MA),
                    CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
                    // CTSD_NGAY_DA_O lưu mốc 12:00 VN của mỗi đêm (lưu dạng UTC: 05:00Z)
                    CTSD_NGAY_DA_O: { gte: prevNoonUtc, lt: nextNoonUtc },
                },
                select: { CTSD_STT: true },
            });
        } else if (Number(hd.HT_MA) === 2) {
            // THEO GIỜ: giữ nguyên như cũ
            ctsdRow = await prisma.cHI_TIET_SU_DUNG.findFirst({
                where: {
                    HDONG_MA: hdId,
                    PHONG_MA: Number(PHONG_MA),
                    CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] },
                    CTSD_O_TU_GIO: { lte: now },
                    CTSD_O_DEN_GIO: { gte: now },
                },
                select: { CTSD_STT: true },
            });
        } else {
            return res.status(400).json({ message: 'HT_MA không hợp lệ trên hợp đồng' });
        }


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

module.exports = {
    getBookingFull,
    searchProducts,
    addService,
    updateService,
    removeService,
};
