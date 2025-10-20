// src/controllers/hopdong.js
const { prisma } = require('../db/prisma');

const toNum = (v) => Number(v || 0);
const money = (n) => Number(n || 0).toFixed(2);

const ALLOW_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'];
const toDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const clampPct = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 10;
};
// (tuỳ) tổng hợp nhanh để FE hiển thị
async function summarizeBooking(HDONG_MA) {
    HDONG_MA = Number(HDONG_MA);

    // tiền phòng từ CTSD ACTIVE/INVOICED
    const ACTIVE_STATES = ['ACTIVE', 'INVOICED'];
    const ctsd = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA, CTSD_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTSD_TONG_TIEN: true }
    });
    const roomTotal = ctsd.reduce((s, r) => s + toNum(r.CTSD_TONG_TIEN), 0);

    // dịch vụ từ CTDV ACTIVE/INVOICED
    const ctdv = await prisma.cHI_TIET_DICH_VU.findMany({
        where: { HDONG_MA, CTDV_TRANGTHAI: { in: ACTIVE_STATES } },
        select: { CTDV_SOLUONG: true, CTDV_DONGIA: true }
    });
    const serviceTotal = ctdv.reduce((s, r) => s + (toNum(r.CTDV_DONGIA) * toNum(r.CTDV_SOLUONG)), 0);

    return {
        roomTotal: money(roomTotal),
        serviceTotal: money(serviceTotal),
        gross: money(roomTotal + serviceTotal),
    };
}

// GET /bookings
// query: search?, eq.HDONG_TRANG_THAI?, dateFrom?, dateTo?, take?, skip?
async function list(req, res, next) {
    try {
        const { take = 20, skip = 0, search, 'eq.HDONG_TRANG_THAI': eqStatus, dateFrom, dateTo } = req.query || {};
        const where = {};

        if (search && String(search).trim()) {
            const s = String(search).trim();
            where.OR = [
                { HDONG_MA: isNaN(Number(s)) ? undefined : Number(s) },
                { KHACH_HANG: { KH_HOTEN: { contains: s, mode: 'insensitive' } } },
            ].filter(Boolean);
        }

        if (eqStatus && ALLOW_STATUSES.includes(String(eqStatus))) {
            where.HDONG_TRANG_THAI = String(eqStatus);
        }

        // SỬA Ở ĐÂY: dùng HDONG_TAO_LUC đúng với schema
        if (dateFrom || dateTo) {
            where.HDONG_TAO_LUC = {};
            if (dateFrom) where.HDONG_TAO_LUC.gte = new Date(dateFrom);
            if (dateTo) where.HDONG_TAO_LUC.lte = new Date(dateTo);
        }

        const [items, total] = await Promise.all([
            prisma.hOP_DONG_DAT_PHONG.findMany({
                where,
                orderBy: { HDONG_MA: 'desc' },
                take: Number(take),
                skip: Number(skip),
                include: {
                    KHACH_HANG: true,
                    CHI_TIET_SU_DUNG: { take: 1, include: { PHONG: true } },
                }
            }),
            prisma.hOP_DONG_DAT_PHONG.count({ where })
        ]);

        res.json({ items, total });
    } catch (e) { next(e); }
}

// GET /bookings/:id
async function get(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ message: 'Thiếu hoặc id không hợp lệ' });
        }
        const row = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id },
            include: {
                KHACH_HANG: true,
                NHAN_VIEN: true,
                CHI_TIET_SU_DUNG: {
                    orderBy: [{ PHONG_MA: 'asc' }, { CTSD_STT: 'asc' }],
                    include: { PHONG: true }
                },
                CHI_TIET_DICH_VU: {
                    orderBy: [{ CTDV_STT: 'asc' }],
                    include: { DICH_VU: true }
                },
            }
        });
        if (!row) return res.status(404).json({ message: 'Not found' });

        const sum = await summarizeBooking(id);
        res.json({ ...row, _sum: sum });
    } catch (e) { next(e); }
}

// POST /bookings
// body: { KH_MA?, NV_MA?, HDONG_TIENCOCYEUCAU?, HDONG_GHICHU?, HDONG_TRANG_THAI? }

async function create(req, res, next) {
    try {
        const {
            HT_MA, HDONG_NGAYDAT, HDONG_NGAYTRA,
            KH_MA, NV_MA,
            HDONG_TIENCOCYEUCAU, HDONG_GHICHU,
            HDONG_TRANG_THAI,
            HDONG_TONGTIENDUKIEN,
            HDONG_TILECOCAPDUNG,
            
        } = req.body || {};

        // 1) Validate bắt buộc theo schema
        if (!(HT_MA && HDONG_NGAYDAT && HDONG_NGAYTRA)) {
            return res.status(400).json({ message: 'Thiếu HT_MA / HDONG_NGAYDAT / HDONG_NGAYTRA' });
        }

        // 2) Ép kiểu
        const htMa = Number(HT_MA);
        const ngayDat = toDate(HDONG_NGAYDAT);
        const ngayTra = toDate(HDONG_NGAYTRA);

        if (!Number.isInteger(htMa) || htMa <= 0) {
            return res.status(400).json({ message: 'HT_MA không hợp lệ' });
        }
        if (!ngayDat || !ngayTra) {
            return res.status(400).json({ message: 'HDONG_NGAYDAT/HDONG_NGAYTRA không phải ngày hợp lệ' });
        }
        if (ngayTra <= ngayDat) {
            return res.status(400).json({ message: 'HDONG_NGAYTRA phải lớn hơn HDONG_NGAYDAT' });
        }

        // 3) Trạng thái
        const status = ALLOW_STATUSES.includes(String(HDONG_TRANG_THAI))
            ? String(HDONG_TRANG_THAI)
            : 'CONFIRMED';

        // 4) Tạo bản ghi
        const created = await prisma.hOP_DONG_DAT_PHONG.create({
            data: {
                HT_MA: htMa,
                HDONG_NGAYDAT: ngayDat,
                HDONG_NGAYTRA: ngayTra,

                KH_MA: KH_MA ? Number(KH_MA) : null,
                NV_MA: req.user?.id || (NV_MA ? Number(NV_MA) : null),

                HDONG_TIENCOCYEUCAU: HDONG_TIENCOCYEUCAU != null ? money(HDONG_TIENCOCYEUCAU) : '0.00',
                HDONG_TONGTIENDUKIEN: money(toNum(HDONG_TONGTIENDUKIEN || 0)),
                HDONG_TILECOCAPDUNG: clampPct(HDONG_TILECOCAPDUNG ?? 10), // 👈 THÊM DÒNG NÀY
                HDONG_TIENCOCYEUCAU: money(toNum(HDONG_TIENCOCYEUCAU || 0)),
                HDONG_GHICHU: HDONG_GHICHU ?? null,
                HDONG_TRANG_THAI: status,
            }
        });

        res.status(201).json(created);
    } catch (e) { next(e); }
}

// PUT /bookings/:id
// body: { KH_MA?, NV_MA?, HDONG_TIENCOCYEUCAU?, HDONG_GHICHU?, HDONG_TRANG_THAI? }
async function update(req, res, next) {
    try {
        const id = Number(req.params.id);
        const data = {};
        const b = req.body || {};

        if (b.KH_MA != null) data.KH_MA = Number(b.KH_MA);
        if (b.NV_MA != null) data.NV_MA = Number(b.NV_MA);
        if (b.HDONG_TIENCOCYEUCAU != null) data.HDONG_TIENCOCYEUCAU = money(b.HDONG_TIENCOCYEUCAU);
        if (b.HDONG_GHICHU !== undefined) data.HDONG_GHICHU = b.HDONG_GHICHU;
        if (b.HDONG_TRANG_THAI && ALLOW_STATUSES.includes(String(b.HDONG_TRANG_THAI))) {
            data.HDONG_TRANG_THAI = String(b.HDONG_TRANG_THAI);
        }

        const updated = await prisma.hOP_DONG_DAT_PHONG.update({ where: { HDONG_MA: id }, data });
        res.json(updated);
    } catch (e) { next(e); }
}

// DELETE /bookings/:id
async function remove(req, res, next) {
    try {
        const id = Number(req.params.id);
        const row = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: id }, select: { HDONG_TRANG_THAI: true }
        });
        if (!row) return res.status(404).json({ message: 'Not found' });
        if (['CHECKED_IN', 'CHECKED_OUT'].includes(row.HDONG_TRANG_THAI)) {
            const err = new Error('Không thể xoá hợp đồng đã/đang lưu trú'); err.status = 409; throw err;
        }
        await prisma.hOP_DONG_DAT_PHONG.delete({ where: { HDONG_MA: id } });
        res.json({ ok: true });
    } catch (e) { next(e); }
}

// POST /bookings/:id/checkin
async function checkin(req, res, next) {
    try {
        const id = Number(req.params.id);
        const hd = await prisma.hOP_DONG_DAT_PHONG.update({
            where: { HDONG_MA: id },
            data: { HDONG_TRANG_THAI: 'CHECKED_IN', HDONG_NGAYTHUCNHAN: new Date() }
        });
        res.json(hd);
    } catch (e) { next(e); }
}

// POST /bookings/:id/checkout
async function checkout(req, res, next) {
    try {
        const id = Number(req.params.id);

        // tuỳ: bắt buộc tất cả CTSD đã kết thúc?
        const openItem = await prisma.cHI_TIET_SU_DUNG.findFirst({
            where: { HDONG_MA: id, CTSD_TRANGTHAI: 'ACTIVE' },
            select: { CTSD_STT: true }
        });
        if (openItem) {
            const err = new Error('Còn mục sử dụng phòng đang ACTIVE, không thể checkout'); err.status = 409; throw err;
        }

        const hd = await prisma.hOP_DONG_DAT_PHONG.update({
            where: { HDONG_MA: id },
            data: { HDONG_TRANG_THAI: 'CHECKED_OUT', HDONG_NGAYTHUCTRA: new Date() }
        });
        res.json(hd);
    } catch (e) { next(e); }
}

// POST /bookings/:id/cancel
async function cancel(req, res, next) {
    try {
        const id = Number(req.params.id);
        const lydo = req.body?.lydo ?? null;

        const hd = await prisma.hOP_DONG_DAT_PHONG.update({
            where: { HDONG_MA: id },
            data: {
                HDONG_TRANG_THAI: 'CANCELLED',
                HDONG_GHICHU: lydo ? `[CANCELLED] ${lydo}` : '[CANCELLED]'
            }
        });
        res.json(hd);
    } catch (e) { next(e); }
}

module.exports = { list, get, create, update, remove, checkin, checkout, cancel };
