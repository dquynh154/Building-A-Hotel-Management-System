// controllers/thoidem.controller.js
const { crud } = require('./crud');
const { prisma } = require('../db/prisma');

const toDate = (v) => (v ? new Date(v) : null);
async function assertNoSpecialOverlap(from, to, excludeTdMa = null) {
    const where = {
        TD_NGAY_BAT_DAU: { lte: to },
        TD_NGAY_KET_THUC: { gte: from },
    };
    if (excludeTdMa != null) where.TD_MA = { not: excludeTdMa };

    const hit = await prisma.tHOI_DIEM_SPECIAL.findFirst({
        where,
        include: { THOI_DIEM: true },
    });
    if (hit) {
        const err = new Error(
            `Khoảng ngày bị trùng với "${hit.THOI_DIEM.TD_TEN}" `
            + `(${hit.TD_NGAY_BAT_DAU.toISOString().slice(0, 10)} → ${hit.TD_NGAY_KET_THUC.toISOString().slice(0, 10)})`
        );
        err.status = 409;
        throw err;
    }
}

async function assertNoOtherBase() {
    const existed = await prisma.tHOI_DIEM_BASE.findFirst({
        select: { TD_MA: true }
    });
    if (existed) {
        const e = new Error('Đã tồn tại THOI_DIEM_BASE. Chỉ được phép có 1 BASE duy nhất trong hệ thống.');
        e.status = 409; throw e;
    }
}

const thoiDiem = crud('tHOI_DIEM', {
    pk: 'TD_MA',
    include: { THOI_DIEM_BASE: true, THOI_DIEM_SPECIAL: true },

    // CREATE
    beforeCreate: async (data, { req }) => {
        const type = (data.type || '').toUpperCase();
        const base = data.base || {};
        const special = data.special || {};
        delete data.type; delete data.base; delete data.special;

        if (type === 'BASE') {
            await assertNoOtherBase();
            data.THOI_DIEM_BASE = { create: { TD_MOTA_CHUNG: base.TD_MOTA_CHUNG ?? null } };
        } else if (type === 'SPECIAL') {
            const from = toDate(special.TD_NGAY_BAT_DAU);
            const to = toDate(special.TD_NGAY_KET_THUC);
            if (!(from && to) || from > to) {
                const err = new Error('SPECIAL: khoảng ngày không hợp lệ');
                err.status = 400; throw err;
            }
            // validate chồng lấn (không có exclude vì đang tạo mới)
            await assertNoSpecialOverlap(from, to, null);

            data.THOI_DIEM_SPECIAL = {
                create: {
                    TD_NGAY_BAT_DAU: from,
                    TD_NGAY_KET_THUC: to,
                    TD_MOTA_CHIENDICH: special.TD_MOTA_CHIENDICH ?? null,
                }
            };
        }
        // nếu không gửi type => cho tạo mốc “trần” (không subtype)
        return data;
    },

    // UPDATE
    beforeUpdate: async (data, { req, id }) => {
        const type = (data.type || '').toUpperCase();
        const base = data.base || null;
        const special = data.special || null;
        delete data.type; delete data.base; delete data.special;

        // // BASE
        // if (type === 'BASE' || base) {
        //     // chuyển sang BASE => xóa SPECIAL
        //     if (type === 'BASE') data.THOI_DIEM_SPECIAL = { delete: true };
        //     data.THOI_DIEM_BASE = {
        //         upsert: {
        //             update: { TD_MOTA_CHUNG: base?.TD_MOTA_CHUNG ?? null },
        //             create: { TD_MOTA_CHUNG: base?.TD_MOTA_CHUNG ?? null },
        //         }
        //     };
        // }

        if (type === 'BASE' || base) {
            // Nếu record này CHƯA phải BASE và bạn muốn chuyển nó thành BASE → cũng phải chặn
            const self = await prisma.tHOI_DIEM.findUnique({
                where: { TD_MA: Number(id) },
                select: { THOI_DIEM_BASE: { select: { TD_MA: true } } }
            });
            if (!self?.THOI_DIEM_BASE) {
                await assertNoOtherBase(); // đã có BASE khác ⇒ 409
            }
            data.THOI_DIEM_SPECIAL = { delete: true }; // chuyển kiểu → xoá SPECIAL nếu có
            data.THOI_DIEM_BASE = {
                upsert: {
                    update: { TD_MOTA_CHUNG: base?.TD_MOTA_CHUNG ?? null },
                    create: { TD_MOTA_CHUNG: base?.TD_MOTA_CHUNG ?? null }
                }
            };
        }

        // SPECIAL
        if (type === 'SPECIAL' || special) {
            const from = toDate(special?.TD_NGAY_BAT_DAU);
            const to = toDate(special?.TD_NGAY_KET_THUC);
            if (!(from && to) || from > to) {
                const err = new Error('SPECIAL: khoảng ngày không hợp lệ');
                err.status = 400; throw err;
            }

            // validate chồng lấn, loại trừ chính record đang update (id = TD_MA)
            await assertNoSpecialOverlap(from, to, id);

            // nếu chuyển loại => xóa BASE
            if (type === 'SPECIAL') data.THOI_DIEM_BASE = { delete: true };

            data.THOI_DIEM_SPECIAL = {
                upsert: {
                    update: {
                        TD_NGAY_BAT_DAU: from,
                        TD_NGAY_KET_THUC: to,
                        TD_MOTA_CHIENDICH: special?.TD_MOTA_CHIENDICH ?? null,
                    },
                    create: {
                        TD_NGAY_BAT_DAU: from,
                        TD_NGAY_KET_THUC: to,
                        TD_MOTA_CHIENDICH: special?.TD_MOTA_CHIENDICH ?? null,
                    }
                }
            };
        }

        return data;
    },
});

module.exports = thoiDiem;
