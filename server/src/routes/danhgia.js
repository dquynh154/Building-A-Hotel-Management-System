const r = require('express').Router();
const { prisma } = require('../db/prisma');

// helper: ép số an toàn
const toInt = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
};

// =================== LIST REVIEWS (ADMIN) ===================
// GET /danh-gia?take=20&skip=0&status=PUBLISHED&stars=4&search=abc&hdong_ma=123&withTotal=1
r.get('/danh-gia', async (req, res, next) => {
    try {
        const take = Math.max(1, Math.min(100, toInt(req.query.take || 20)));
        const skip = Math.max(0, toInt(req.query.skip || 0));
        const status = String(req.query.status || '').toUpperCase().trim();
        const stars = toInt(req.query.stars || 0);
        const hdong_ma = toInt(req.query.hdong_ma || 0);
        const search = String(req.query.search || '').trim();
        const withTotal = String(req.query.withTotal || '0') === '1';

        const where = {};
        if (status === 'PUBLISHED' || status === 'ARCHIVED') {
            where.DG_TRANG_THAI = status;
        }
        if (stars >= 1 && stars <= 5) {
            where.DG_SAO = stars;
        }
        if (hdong_ma > 0) {
            where.HDONG_MA = hdong_ma;
        }
        if (search) {
            where.OR = [
                { DG_TIEU_DE: { contains: search } },
                { DG_NOI_DUNG: { contains: search } },
                { KHACH_HANG: { KH_HOTEN: { contains: search } } },
            ];
        }

        const [items, total] = await Promise.all([
            prisma.dANH_GIA.findMany({
                where,
                include: {
                    KHACH_HANG: { select: { KH_HOTEN: true, KH_SDT: true } },
                    DINH_KEMS: { select: { DKDG_MA: true, DKDG_LOAI: true, DKDG_URL: true, DKDG_CHUTHICH: true } },
                    PHAN_HOI: { select: { PH_MA: true, NV_MA: true, PH_NOIDUNG: true, PH_TRANG_THAI: true, PH_TAO_LUC: true, PH_SUA_LUC: true } },
                },
                orderBy: [{ DG_TAO_LUC: 'desc' }],
                take, skip,
            }),
            withTotal ? prisma.dANH_GIA.count({ where }) : Promise.resolve(0),
        ]);

        res.json({ items, total });
    } catch (e) { next(e); }
});

// =================== REVIEW DETAIL ===================
// GET /danh-gia/:id
r.get('/danh-gia/:id', async (req, res, next) => {
    try {
        const id = toInt(req.params.id);
        const row = await prisma.dANH_GIA.findUnique({
            where: { DG_MA: id },
            include: {
                KHACH_HANG: { select: { KH_HOTEN: true, KH_SDT: true } },
                HOP_DONG_DAT_PHONG: { select: { HDONG_MA: true, HDONG_NGAYDAT: true, HDONG_NGAYTRA: true } },
                DINH_KEMS: true,
                PHAN_HOI: true,
            },
        });
        if (!row) return res.status(404).json({ message: 'Không tìm thấy đánh giá' });
        res.json(row);
    } catch (e) { next(e); }
});

// =================== TOGGLE STATUS ===================
// PATCH /danh-gia/:id/status  { status: 'PUBLISHED'|'ARCHIVED' }
r.patch('/danh-gia/:id/status', async (req, res, next) => {
    try {
        const id = toInt(req.params.id);
        const status = String(req.body?.status || '').toUpperCase().trim();
        if (!['PUBLISHED', 'ARCHIVED'].includes(status)) {
            return res.status(400).json({ message: 'Trạng thái không hợp lệ' });
        }
        const updated = await prisma.dANH_GIA.update({
            where: { DG_MA: id },
            data: { DG_TRANG_THAI: status },
            select: { DG_MA: true, DG_TRANG_THAI: true },
        });
        res.json(updated);
    } catch (e) { next(e); }
});

// =================== REPLY UPSERT (1 review - 1 phản hồi) ===================
// POST /phan-hoi   { dg_ma, noi_dung, trang_thai? }
r.post('/phan-hoi', async (req, res, next) => {
    try {
        const dg_ma = toInt(req.body?.dg_ma);
        const noi_dung = String(req.body?.noi_dung || '').trim();
        const trang_thai = String(req.body?.trang_thai || 'PUBLISHED').toUpperCase().trim();

        if (!dg_ma || !noi_dung) return res.status(400).json({ message: 'Thiếu dg_ma hoặc nội dung' });

        // lấy NV_MA từ phiên đăng nhập
        const staffId = req.user?.NV_MA || req.user?.id || toInt(req.headers['x-staff-id'] || 0);
        if (!staffId) {
            // cho phép tạo nhưng NV_MA null => bạn có thể đổi thành bắt buộc
            // return res.status(401).json({ message: 'Chưa đăng nhập nhân viên' });
        }

        // upsert theo unique DG_MA
        const ph = await prisma.pHAN_HOI.upsert({
            where: { DG_MA: dg_ma },
            create: { DG_MA: dg_ma, NV_MA: staffId || 1, PH_NOIDUNG: noi_dung, PH_TRANG_THAI: trang_thai },
            update: { PH_NOIDUNG: noi_dung, PH_TRANG_THAI: trang_thai },
            select: { PH_MA: true, DG_MA: true, NV_MA: true, PH_NOIDUNG: true, PH_TRANG_THAI: true, PH_TAO_LUC: true, PH_SUA_LUC: true },
        });

        res.status(201).json(ph);
    } catch (e) { next(e); }
});

// =================== REPLY UPDATE ===================
// PUT /phan-hoi/:id  { noi_dung, trang_thai? }
r.put('/phan-hoi/:id', async (req, res, next) => {
    try {
        const id = toInt(req.params.id);
        const noi_dung = String(req.body?.noi_dung || '').trim();
        const trang_thai = req.body?.trang_thai ? String(req.body.trang_thai).toUpperCase().trim() : undefined;

        if (!noi_dung) return res.status(400).json({ message: 'Thiếu nội dung' });

        const updated = await prisma.pHAN_HOI.update({
            where: { PH_MA: id },
            data: { PH_NOIDUNG: noi_dung, ...(trang_thai ? { PH_TRANG_THAI: trang_thai } : {}) },
            select: { PH_MA: true, DG_MA: true, NV_MA: true, PH_NOIDUNG: true, PH_TRANG_THAI: true, PH_TAO_LUC: true, PH_SUA_LUC: true },
        });
        res.json(updated);
    } catch (e) { next(e); }
});

// =================== REPLY DELETE (mềm) ===================
// DELETE /phan-hoi/:id
r.delete('/phan-hoi/:id', async (req, res, next) => {
    try {
        const id = toInt(req.params.id);
        const updated = await prisma.pHAN_HOI.update({
            where: { PH_MA: id },
            data: { PH_TRANG_THAI: 'DELETED' },
            select: { PH_MA: true, DG_MA: true, PH_TRANG_THAI: true },
        });
        res.json(updated);
    } catch (e) { next(e); }
});

module.exports = r;
