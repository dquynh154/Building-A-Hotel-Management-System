const { crud } = require('./crud');
const { prisma } = require('../db/prisma');

const khuyenMai = crud('kHUYEN_MAI', {
    pk: 'ID_KM',
    beforeCreate: async (d) => {
        if (!d.KM_MA || !d.KM_TEN) { const e = new Error('Thiếu KM_MA/KM_TEN'); e.status = 400; throw e; }
        if (d.KM_KIEUAPDUNG === 'PERCENT' && !(Number(d.KM_GIA_TRI) > 0 && Number(d.KM_GIA_TRI) <= 100)) {
            const e = new Error('PERCENT phải trong (0,100]'); e.status = 400; throw e;
        }
        if (d.KM_KIEUAPDUNG === 'AMOUNT' && !(Number(d.KM_GIA_TRI) > 0)) {
            const e = new Error('AMOUNT phải > 0'); e.status = 400; throw e;
        }
        if (d.KM_DEN && new Date(d.KM_DEN) < new Date(d.KM_TU)) {
            const e = new Error('KM_DEN phải ≥ KM_TU'); e.status = 400; throw e;
        }
        return d;
    },
    beforeUpdate: async (d) => {
        if (d.KM_KIEUAPDUNG === 'PERCENT' && d.KM_GIA_TRI != null && !(Number(d.KM_GIA_TRI) > 0 && Number(d.KM_GIA_TRI) <= 100)) {
            const e = new Error('PERCENT phải trong (0,100]'); e.status = 400; throw e;
        }
        if (d.KM_KIEUAPDUNG === 'AMOUNT' && d.KM_GIA_TRI != null && !(Number(d.KM_GIA_TRI) > 0)) {
            const e = new Error('AMOUNT phải > 0'); e.status = 400; throw e;
        }
        if (d.KM_TU || d.KM_DEN) {
            const from = d.KM_TU ? new Date(d.KM_TU) : undefined;
            const to = d.KM_DEN ? new Date(d.KM_DEN) : undefined;
            if (from && to && to < from) { const e = new Error('KM_DEN phải ≥ KM_TU'); e.status = 400; throw e; }
        }
        return d;
    }
});

module.exports = khuyenMai;
