// src/controllers/km_sudung.controller.js
const { prisma } = require('../db/prisma');

const NOW = () => new Date();

function toDecimalString(v) {
    // đảm bảo string cho Decimal của Prisma
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return v.toString();
    return String(v);
}

async function assertBookingAllowApply(hdongMa) {
    const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
        where: { HDONG_MA: Number(hdongMa) },
        select: { HDONG_MA: true, HDONG_TRANG_THAI: true }
    });
    if (!hd) {
        const e = new Error('Hợp đồng không tồn tại'); e.status = 404; throw e;
    }
    if (!['PENDING', 'CONFIRMED'].includes(hd.HDONG_TRANG_THAI)) {
        const e = new Error('Chỉ áp dụng khuyến mãi cho HĐ đang PENDING/CONFIRMED'); e.status = 409; throw e;
    }
}

async function assertNoInvoiceLinked(hdongMa) {
    const link = await prisma.hOA_DON_HOP_DONG.findFirst({
        where: { HDONG_MA: Number(hdongMa) },
        select: { HDON_MA: true }
    });
    if (link) {
        const e = new Error('HĐ đã có hoá đơn, không thể huỷ áp dụng khuyến mãi'); e.status = 409; throw e;
    }
}

async function loadPromotion(idKm) {
    const km = await prisma.kHUYEN_MAI.findUnique({
        where: { ID_KM: Number(idKm) },
        select: {
            ID_KM: true, KM_MA: true, KM_TEN: true,
            KM_KIEUAPDUNG: true, KM_GIA_TRI: true,
            KM_TU: true, KM_DEN: true, KM_HIEU_LUC: true
        }
    });
    if (!km) { const e = new Error('Khuyến mãi không tồn tại'); e.status = 404; throw e; }
    if (!km.KM_HIEU_LUC) { const e = new Error('Khuyến mãi đang không hiệu lực'); e.status = 409; throw e; }
    const today = NOW();
    if (!(km.KM_TU <= today && (!km.KM_DEN || today <= km.KM_DEN))) {
        const e = new Error('Khuyến mãi không nằm trong thời gian áp dụng'); e.status = 409; throw e;
    }
    return km;
}

async function loadBookingExpectedTotal(hdongMa) {
    // Dùng HDONG_TONGTIENDUKIEN để tính phần giảm
    const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({
        where: { HDONG_MA: Number(hdongMa) },
        select: { HDONG_TONGTIENDUKIEN: true }
    });
    if (!hd) { const e = new Error('Hợp đồng không tồn tại'); e.status = 404; throw e; }
    return hd.HDONG_TONGTIENDUKIEN; // Decimal as string
}

function calcDiscount(km, tongTienStr) {
    // km.KM_KIEUAPDUNG: 'PERCENT' | 'AMOUNT'
    // km.KM_GIA_TRI: Decimal (string)
    // tongTienStr: Decimal (string)
    const value = Number(km.KM_GIA_TRI);
    const total = Number(tongTienStr || '0');

    if (!Number.isFinite(value) || value < 0) {
        const e = new Error('Giá trị khuyến mãi không hợp lệ'); e.status = 400; throw e;
    }

    let discount = 0;
    if (km.KM_KIEUAPDUNG === 'PERCENT') {
        discount = Math.floor((total * value) * 100) / 10000; // tính % rồi làm tròn 2 số; (total * value / 100)
        discount = (total * value) / 100;
    } else { // AMOUNT
        discount = value;
    }

    // Không vượt quá tổng tiền dự kiến
    if (discount > total) discount = total;

    // Trả string để ghi Decimal
    return toDecimalString(discount.toFixed(2));
}

// ============ HANDLERS ============

// POST /khuyen-mai-su-dung
// body: { ID_KM, HDONG_MA }
async function create(req, res, next) {
    try {
        const { ID_KM, HDONG_MA } = req.body || {};
        if (!(ID_KM && HDONG_MA)) {
            const e = new Error('Thiếu ID_KM / HDONG_MA'); e.status = 400; throw e;
        }

        // 1) Check HĐ cho phép áp dụng
        await assertBookingAllowApply(HDONG_MA);

        // 2) Check chưa có KM cho HĐ này (unique HDONG_MA)
        const existed = await prisma.kHUYEN_MAI_SU_DUNG.findUnique({
            where: { HDONG_MA: Number(HDONG_MA) },
            select: { ID_KM: true }
        });
        if (existed) { const e = new Error('Hợp đồng đã áp dụng khuyến mãi khác'); e.status = 409; throw e; }

        // 3) Load KM & validate hiệu lực
        const km = await loadPromotion(ID_KM);

        // 4) Tính tiền giảm dựa trên tổng dự kiến
        const total = await loadBookingExpectedTotal(HDONG_MA);
        const KM_SOTIEN_GIAM = calcDiscount(km, total);

        // 5) Tạo record
        const row = await prisma.kHUYEN_MAI_SU_DUNG.create({
            data: {
                ID_KM: Number(ID_KM),
                HDONG_MA: Number(HDONG_MA),
                KM_SOTIEN_GIAM, // Decimal string
                // KM_NGAY_SD tự default now()
            },
            include: {
                KHUYEN_MAI: true,
                HOP_DONG_DAT_PHONG: { select: { HDONG_MA: true, HDONG_TONGTIENDUKIEN: true } }
            }
        });

        return res.status(201).json(row);
    } catch (e) { next(e); }
}

// DELETE /khuyen-mai-su-dung/:HDONG_MA
async function remove(req, res, next) {
    try {
        const { HDONG_MA } = req.params;
        if (!HDONG_MA) { const e = new Error('Thiếu HDONG_MA'); e.status = 400; throw e; }

        // Chỉ cho huỷ khi chưa có hoá đơn
        await assertNoInvoiceLinked(HDONG_MA);

        await prisma.kHUYEN_MAI_SU_DUNG.delete({
            where: { HDONG_MA: Number(HDONG_MA) }
        });
        res.json({ ok: true });
    } catch (e) { next(e); }
}

// GET /khuyen-mai-su-dung?HDONG_MA=.. (list/filter)
async function list(req, res, next) {
    try {
        const { HDONG_MA, ID_KM, skip = 0, take = 50 } = req.query || {};
        const where = {
            ...(HDONG_MA ? { HDONG_MA: Number(HDONG_MA) } : {}),
            ...(ID_KM ? { ID_KM: Number(ID_KM) } : {}),
        };
        const rows = await prisma.kHUYEN_MAI_SU_DUNG.findMany({
            where,
            skip: Number(skip),
            take: Number(take),
            orderBy: [{ KM_NGAY_SD: 'desc' }],
            include: {
                KHUYEN_MAI: true,
                HOP_DONG_DAT_PHONG: { select: { HDONG_MA: true, HDONG_TRANG_THAI: true } }
            }
        });
        res.json(rows);
    } catch (e) { next(e); }
}

module.exports = { create, remove, list };
