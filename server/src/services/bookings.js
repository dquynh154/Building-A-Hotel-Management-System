// services/bookings.service.js
const { prisma } = require('../db/prisma');
const { resolvePrice } = require('./pricing');

async function createBooking({ KH_MA, HT_MA, HDONG_NGAYDAT, HDONG_NGAYTRA, HDONG_GHICHU }) {
    return prisma.hOP_DONG_DAT_PHONG.create({
        data: {
            KH_MA: Number(KH_MA),
            HT_MA: Number(HT_MA),
            HDONG_NGAYDAT: new Date(HDONG_NGAYDAT),
            HDONG_NGAYTRA: new Date(HDONG_NGAYTRA),
            HDONG_TRANG_THAI: 'PENDING',
            HDONG_TONGTIENDUKIEN: '0',
            HDONG_GHICHU: HDONG_GHICHU ?? null,
        }
    });
}

async function addNightItems(hdId, { PHONG_MA, dates }) {
    if (!(PHONG_MA && Array.isArray(dates) && dates.length)) {
        const e = new Error('Cần PHONG_MA và danh sách dates[]'); e.status = 400; throw e;
    }
    const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({ where: { HDONG_MA: hdId } });
    if (!hd) { const e = new Error('HĐ không tồn tại'); e.status = 404; throw e; }

    const phong = await prisma.pHONG.findUnique({ where: { PHONG_MA: Number(PHONG_MA) }, select: { LP_MA: true } });
    if (!phong) { const e = new Error('PHONG_MA không tồn tại'); e.status = 400; throw e; }

    const HT_MA = hd.HT_MA;
    let stt = 1;
    const last = await prisma.cHI_TIET_SU_DUNG.findFirst({
        where: { HDONG_MA: hdId, PHONG_MA: Number(PHONG_MA) },
        orderBy: { CTSD_STT: 'desc' }, select: { CTSD_STT: true }
    });
    if (last) stt = last.CTSD_STT + 1;

    const ops = [];
    for (let i = 0; i < dates.length; i++) {
        const ngay = new Date(dates[i]);
        const donGia = await resolvePrice(phong.LP_MA, HT_MA, ngay);
        if (!donGia) { const e = new Error(`Chưa cấu hình đơn giá cho ngày ${dates[i]}`); e.status = 404; throw e; }
        ops.push(prisma.cHI_TIET_SU_DUNG.create({
            data: {
                HDONG_MA: hdId, PHONG_MA: Number(PHONG_MA), CTSD_STT: stt + i,
                CTSD_NGAY_DA_O: ngay, CTSD_SO_LUONG: 1,
                CTSD_DON_GIA: donGia, CTSD_TONG_TIEN: donGia,
                CTSD_TRANGTHAI: 'ACTIVE'
            }
        }));
    }
    await prisma.$transaction(ops);
    return { added: dates.length };
}

async function addHourItem(hdId, { PHONG_MA, O_TU_GIO, O_DEN_GIO, soGio, donGiaTuyChon }) {
    if (!(PHONG_MA && O_TU_GIO && O_DEN_GIO)) {
        const e = new Error('Cần PHONG_MA, O_TU_GIO, O_DEN_GIO'); e.status = 400; throw e;
    }
    const from = new Date(O_TU_GIO), to = new Date(O_DEN_GIO);
    if (!(from < to)) { const e = new Error('Khoảng giờ không hợp lệ'); e.status = 400; throw e; }

    const hd = await prisma.hOP_DONG_DAT_PHONG.findUnique({ where: { HDONG_MA: hdId } });
    if (!hd) { const e = new Error('HĐ không tồn tại'); e.status = 404; throw e; }

    const phong = await prisma.pHONG.findUnique({ where: { PHONG_MA: Number(PHONG_MA) }, select: { LP_MA: true } });
    if (!phong) { const e = new Error('PHONG_MA không tồn tại'); e.status = 400; throw e; }

    const HT_MA = hd.HT_MA;
    const donGiaBase = await resolvePrice(phong.LP_MA, HT_MA, from);
    if (!donGiaBase && !donGiaTuyChon) { const e = new Error('Chưa có đơn giá, cần donGiaTuyChon'); e.status = 404; throw e; }

    const hours = soGio ?? Math.max(1, Math.ceil((to - from) / (60 * 60 * 1000)));
    const donGia = donGiaTuyChon ?? donGiaBase;
    const tong = (Number(donGia) * Number(hours)).toString();

    const last = await prisma.cHI_TIET_SU_DUNG.findFirst({
        where: { HDONG_MA: hdId, PHONG_MA: Number(PHONG_MA) },
        orderBy: { CTSD_STT: 'desc' }, select: { CTSD_STT: true }
    });
    const stt = last ? last.CTSD_STT + 1 : 1;

    return prisma.cHI_TIET_SU_DUNG.create({
        data: {
            HDONG_MA: hdId, PHONG_MA: Number(PHONG_MA), CTSD_STT: stt,
            CTSD_O_TU_GIO: from, CTSD_O_DEN_GIO: to, CTSD_SO_LUONG: hours,
            CTSD_DON_GIA: donGia, CTSD_TONG_TIEN: tong,
            CTSD_TRANGTHAI: 'ACTIVE'
        }
    });
}

async function recalcBooking(hdId) {
    const items = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA: hdId, CTSD_TRANGTHAI: { in: ['ACTIVE', 'INVOICED'] } },
        select: { CTSD_TONG_TIEN: true }
    });
    const sum = items.reduce((a, b) => a + Number(b.CTSD_TONG_TIEN), 0).toString();
    return prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: hdId },
        data: { HDONG_TONGTIENDUKIEN: sum, HDONG_SUA_LUC: new Date() },
        select: { HDONG_MA: true, HDONG_TONGTIENDUKIEN: true }
    });
}

async function setState(hdId, next) {
    return prisma.hOP_DONG_DAT_PHONG.update({
        where: { HDONG_MA: hdId }, data: next
    });
}

async function checkin(hdId) {
    const rooms = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA: hdId }, distinct: ['PHONG_MA'], select: { PHONG_MA: true }
    });
    await prisma.$transaction([
        setState(hdId, { HDONG_TRANG_THAI: 'CHECKED_IN', HDONG_NGAYTHUCNHAN: new Date() }),
        ...rooms.map(p => prisma.pHONG.update({ where: { PHONG_MA: p.PHONG_MA }, data: { PHONG_TRANGTHAI: 'OCCUPIED' } }))
    ]);
    return { ok: true };
}

async function checkout(hdId) {
    const rooms = await prisma.cHI_TIET_SU_DUNG.findMany({
        where: { HDONG_MA: hdId }, distinct: ['PHONG_MA'], select: { PHONG_MA: true }
    });
    await prisma.$transaction([
        setState(hdId, { HDONG_TRANG_THAI: 'CHECKED_OUT', HDONG_NGAYTHUCTRA: new Date() }),
        ...rooms.map(p => prisma.pHONG.update({ where: { PHONG_MA: p.PHONG_MA }, data: { PHONG_TRANGTHAI: 'CHUA_DON' } }))
    ]);
    return { ok: true };
}

module.exports = {
    createBooking,
    addNightItems,
    addHourItem,
    recalcBooking,
    setState,
    checkin,
    checkout,
};
