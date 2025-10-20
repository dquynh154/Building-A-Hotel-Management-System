// controllers/bookingguest.js
const { prisma } = require('../db/prisma');

async function upsertBookingGuests(req, res, next) {
    try {
        const bookingId = Number(req.params.id);
        const { guests, KHACH_DAT_ID } = req.body || {};
        if (!bookingId || !Array.isArray(guests)) {
            return res.status(400).json({ message: 'Thiếu bookingId hoặc guests' });
        }

        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: bookingId }, select: { HDONG_MA: true }
        });
        if (!booking) return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });

        const rows = guests
            .map(g => ({
                HDONG_MA: bookingId,
                KH_MA: Number(g.KH_MA),
                LA_KHACH_CHINH: !!g.LA_KHACH_CHINH,
                LA_KHACH_DAT: KHACH_DAT_ID ? Number(g.KH_MA) === Number(KHACH_DAT_ID) : false,
                GHI_CHU: g.GHI_CHU ?? null,
            }))
            .filter(r => Number.isFinite(r.KH_MA));

        await prisma.$transaction([
            prisma.lUU_TRU_KHACH.deleteMany({ where: { HDONG_MA: bookingId } }),
            ...(rows.length ? [prisma.lUU_TRU_KHACH.createMany({ data: rows, skipDuplicates: true })] : []),
        ]);

        res.json({ ok: true, count: rows.length });
    } catch (err) { next(err); }
}

module.exports = { upsertBookingGuests };
