// src/controllers/dongia.controller.js
const { prisma } = require('../db/prisma');

// Helpers
const fmt = (d) => d.toISOString().slice(0, 10);
const toDate = (v) => (v ? new Date(String(v)) : null);
const isBadDate = (d) => !(d instanceof Date) || Number.isNaN(d.getTime());

// SPECIAL overlap checker (toàn cục)
async function hasOverlap(from, to) {
    return prisma.tHOI_DIEM_SPECIAL.findFirst({
        where: {
            TD_NGAY_BAT_DAU: { lte: to },
            TD_NGAY_KET_THUC: { gte: from },
        },
        include: { THOI_DIEM: true },
    });
}

// ========== HANDLERS ==========

// GET /don-gia (list or get by composite key)
async function listOrGet(req, res, next) {
    try {
        const { LP_MA, HT_MA, TD_MA, skip = 0, take = 50 } = req.query;

        if (LP_MA && HT_MA && TD_MA) {
            const row = await prisma.dON_GIA.findUnique({
                where: {
                    LP_MA_HT_MA_TD_MA: {
                        LP_MA: Number(LP_MA),
                        HT_MA: Number(HT_MA),
                        TD_MA: Number(TD_MA),
                    },
                },
                include: { LOAI_PHONG: true, HINH_THUC_THUE: true, THOI_DIEM: true },
            });
            if (!row) return res.status(404).json({ message: 'Not found' });
            return res.json(row);
        }

        const where = {
            ...(LP_MA ? { LP_MA: Number(LP_MA) } : {}),
            ...(HT_MA ? { HT_MA: Number(HT_MA) } : {}),
            ...(TD_MA ? { TD_MA: Number(TD_MA) } : {}),
        };
        const rows = await prisma.dON_GIA.findMany({
            where,
            skip: Number(skip),
            take: Number(take),
            orderBy: [{ LP_MA: 'asc' }, { HT_MA: 'asc' }, { TD_MA: 'asc' }],
            include: { LOAI_PHONG: true, HINH_THUC_THUE: true, THOI_DIEM: true },
        });
        res.json(rows);
    } catch (e) { next(e); }
}

// POST /don-gia
async function create(req, res, next) {
    try {
        const { LP_MA, HT_MA, TD_MA, DG_DONGIA } = req.body || {};
        if (!(LP_MA && HT_MA && TD_MA && DG_DONGIA != null)) {
            const err = new Error('Thiếu LP_MA/HT_MA/TD_MA/DG_DONGIA'); err.status = 400; throw err;
        }

        // (tuỳ chọn) kiểm tra FK
        await Promise.all([
            prisma.lOAI_PHONG.findUnique({ where: { LP_MA: Number(LP_MA) } })
                .then(r => { if (!r) { const e = new Error('LP_MA không tồn tại'); e.status = 400; throw e; } }),
            prisma.hINH_THUC_THUE.findUnique({ where: { HT_MA: Number(HT_MA) } })
                .then(r => { if (!r) { const e = new Error('HT_MA không tồn tại'); e.status = 400; throw e; } }),
            prisma.tHOI_DIEM.findUnique({ where: { TD_MA: Number(TD_MA) } })
                .then(r => { if (!r) { const e = new Error('TD_MA không tồn tại'); e.status = 400; throw e; } }),
        ]);

        const row = await prisma.dON_GIA.create({
            data: {
                LP_MA: Number(LP_MA),
                HT_MA: Number(HT_MA),
                TD_MA: Number(TD_MA),
                DG_DONGIA: String(DG_DONGIA),
            },
        });
        res.status(201).json(row);
    } catch (e) { next(e); }
}

// PUT /don-gia/:LP_MA/:HT_MA/:TD_MA
async function update(req, res, next) {
    try {
        const { LP_MA, HT_MA, TD_MA } = req.params;
        const data = {};
        if (req.body.DG_DONGIA != null) data.DG_DONGIA = String(req.body.DG_DONGIA);

        const row = await prisma.dON_GIA.update({
            where: {
                LP_MA_HT_MA_TD_MA: {
                    LP_MA: Number(LP_MA),
                    HT_MA: Number(HT_MA),
                    TD_MA: Number(TD_MA),
                }
            },
            data,
        });
        res.json(row);
    } catch (e) { next(e); }
}

// DELETE /don-gia/:LP_MA/:HT_MA/:TD_MA
async function remove(req, res, next) {
    try {
        const { LP_MA, HT_MA, TD_MA } = req.params;
        await prisma.dON_GIA.delete({
            where: {
                LP_MA_HT_MA_TD_MA: {
                    LP_MA: Number(LP_MA),
                    HT_MA: Number(HT_MA),
                    TD_MA: Number(TD_MA),
                }
            }
        });
        res.json({ ok: true });
    } catch (e) { next(e); }
}

// GET /don-gia/resolve
async function resolve(req, res, next) {
    try {
        const { LP_MA, HT_MA, date } = req.query;
        if (!(LP_MA && HT_MA && date)) {
            const err = new Error('Thiếu LP_MA/HT_MA/date (YYYY-MM-DD)'); err.status = 400; throw err;
        }
        const d = new Date(String(date));
        if (isBadDate(d)) {
            const err = new Error('date không hợp lệ'); err.status = 400; throw err;
        }

        // SPECIAL trước
        const special = await prisma.dON_GIA.findFirst({
            where: {
                LP_MA: Number(LP_MA),
                HT_MA: Number(HT_MA),
                THOI_DIEM: {
                    THOI_DIEM_SPECIAL: {
                        is: {
                            TD_NGAY_BAT_DAU: { lte: d },
                            TD_NGAY_KET_THUC: { gte: d },
                        }
                    }
                }
            },
            include: { THOI_DIEM: { include: { THOI_DIEM_SPECIAL: true } } },
            orderBy: { TD_MA: 'desc' }
        });

        if (special) {
            return res.json({
                source: 'SPECIAL',
                TD_MA: special.TD_MA,
                DG_DONGIA: special.DG_DONGIA,
                range: {
                    from: special.THOI_DIEM.THOI_DIEM_SPECIAL.TD_NGAY_BAT_DAU,
                    to: special.THOI_DIEM.THOI_DIEM_SPECIAL.TD_NGAY_KET_THUC,
                }
            });
        }

        // BASE
        const base = await prisma.dON_GIA.findFirst({
            where: {
                LP_MA: Number(LP_MA),
                HT_MA: Number(HT_MA),
                THOI_DIEM: { THOI_DIEM_BASE: { isNot: null } }
            }
        });

        if (base) {
            return res.json({
                source: 'BASE',
                TD_MA: base.TD_MA,
                DG_DONGIA: base.DG_DONGIA
            });
        }

        return res.status(404).json({ message: 'Chưa cấu hình đơn giá' });
    } catch (e) { next(e); }
}

// GET /don-gia/calendar
async function calendar(req, res, next) {
    try {
        const { LP_MA, HT_MA, from, to } = req.query;
        if (!(LP_MA && HT_MA && from && to)) { const e = new Error('Thiếu LP_MA/HT_MA/from/to'); e.status = 400; throw e; }
        const start = toDate(from), end = toDate(to);
        if (isBadDate(start) || isBadDate(end) || start > end) { const e = new Error('Khoảng ngày không hợp lệ'); e.status = 400; throw e; }

        const specials = await prisma.dON_GIA.findMany({
            where: {
                LP_MA: Number(LP_MA),
                HT_MA: Number(HT_MA),
                THOI_DIEM: { THOI_DIEM_SPECIAL: { is: { TD_NGAY_KET_THUC: { gte: start }, TD_NGAY_BAT_DAU: { lte: end } } } }
            },
            include: { THOI_DIEM: { include: { THOI_DIEM_SPECIAL: true } } },
            orderBy: { TD_MA: 'asc' }
        });
        const base = await prisma.dON_GIA.findFirst({
            where: { LP_MA: Number(LP_MA), HT_MA: Number(HT_MA), THOI_DIEM: { THOI_DIEM_BASE: { isNot: null } } }
        });

        res.json({
            base: base?.DG_DONGIA ?? null,
            specials: specials.map(s => ({
                TD_MA: s.TD_MA, DG_DONGIA: s.DG_DONGIA,
                from: s.THOI_DIEM.THOI_DIEM_SPECIAL.TD_NGAY_BAT_DAU,
                to: s.THOI_DIEM.THOI_DIEM_SPECIAL.TD_NGAY_KET_THUC
            }))
        });
    } catch (e) { next(e); }
}

// POST /don-gia/generate-weekends (Sat..Sun)
async function generateWeekends(req, res, next) {
    try {
        const { LP_MA, HT_MA, from, to, price, titlePrefix } = req.body || {};
        if (!(LP_MA && HT_MA && from && to && price != null)) {
            const e = new Error('Thiếu LP_MA/HT_MA/from/to/price'); e.status = 400; throw e;
        }
        const start = toDate(from), end = toDate(to);
        if (isBadDate(start) || isBadDate(end) || start > end) {
            const e = new Error('Khoảng ngày không hợp lệ'); e.status = 400; throw e;
        }

        // FK check (tuỳ)
        const [lp, ht] = await Promise.all([
            prisma.lOAI_PHONG.findUnique({ where: { LP_MA: Number(LP_MA) }, select: { LP_TEN: true } }),
            prisma.hINH_THUC_THUE.findUnique({ where: { HT_MA: Number(HT_MA) }, select: { HT_TEN: true } }),
        ]);
        if (!lp) { const e = new Error('LP_MA không tồn tại'); e.status = 400; throw e; }
        if (!ht) { const e = new Error('HT_MA không tồn tại'); e.status = 400; throw e; }

        // Build ranges: Saturday..Sunday
        const ranges = [];
        const d = new Date(start);
        while (d.getDay() !== 6) d.setDate(d.getDate() + 1); // 6 = Sat
        while (d <= end) {
            const sat = new Date(d);
            const sun = new Date(d); sun.setDate(sun.getDate() + 1);
            const fromRange = sat < start ? start : sat;
            const toRange = sun > end ? end : sun;
            if (fromRange <= toRange) ranges.push([fromRange, toRange]);
            d.setDate(d.getDate() + 7);
        }

        const created = [];
        const skipped = [];

        for (const [f, t] of ranges) {
            const hit = await hasOverlap(f, t);
            if (hit) {
                skipped.push({
                    from: fmt(f), to: fmt(t),
                    reason: `Trùng với "${hit.THOI_DIEM.TD_TEN}" (${fmt(hit.TD_NGAY_BAT_DAU)}→${fmt(hit.TD_NGAY_KET_THUC)})`
                });
                continue;
            }

            const td = await prisma.tHOI_DIEM.create({
                data: {
                    TD_TEN: `${titlePrefix || 'Weekend'} ${fmt(f)}–${fmt(t)}`,
                    TD_TRANGTHAI: true,
                    THOI_DIEM_SPECIAL: {
                        create: {
                            TD_NGAY_BAT_DAU: f,
                            TD_NGAY_KET_THUC: t,
                            TD_MOTA_CHIENDICH: 'Weekend',
                        }
                    }
                },
                select: { TD_MA: true }
            });

            const dg = await prisma.dON_GIA.create({
                data: {
                    LP_MA: Number(LP_MA),
                    HT_MA: Number(HT_MA),
                    TD_MA: td.TD_MA,
                    DG_DONGIA: String(price),
                },
                select: { TD_MA: true, DG_DONGIA: true }
            });

            created.push({ TD_MA: dg.TD_MA, from: fmt(f), to: fmt(t), DG_DONGIA: dg.DG_DONGIA });
        }

        return res
            .status(created.length ? 201 : 200)
            .json({ summary: { total: ranges.length, created: created.length, skipped: skipped.length }, created, skipped });
    } catch (e) { next(e); }
}

module.exports = {
    listOrGet,
    create,
    update,
    remove,
    resolve,
    calendar,
    generateWeekends,
};
