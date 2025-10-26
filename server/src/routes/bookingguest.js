// routes/bookingguest.js
const { Router } = require('express');
const { upsertBookingGuests } = require('../controllers/bookingguest.js'); // chú ý tên file
const { prisma } = require('../db/prisma');

const router = Router();

// => sẽ thành /bookings/:id/guests khi mount với prefix /bookings
router.put('/:id/guests', upsertBookingGuests);
router.get('/:id/guests', async (req, res, next) => {
    try {
        const bookingId = Number(req.params.id);
        if (!Number.isFinite(bookingId)) return res.status(400).json({ message: 'Invalid booking id' });

        const rows = await prisma.lUU_TRU_KHACH.findMany({
            where: { HDONG_MA: bookingId },
            include: { KHACH_HANG: true },
            orderBy: [
                { LA_KHACH_CHINH: 'desc' },
                { LA_KHACH_DAT: 'desc' },
                { KH_MA: 'asc' },
            ],
        });

        res.json(rows.map(r => ({
            KH_MA: r.KH_MA,
            KH_HOTEN: r.KHACH_HANG?.KH_HOTEN ?? null,
            KH_SDT: r.KHACH_HANG?.KH_SDT ?? null,
            KH_CCCD: r.KHACH_HANG?.KH_CCCD ?? null,
            KH_DIACHI: r.KHACH_HANG?.KH_DIACHI ?? null,
            LA_KHACH_CHINH: !!r.LA_KHACH_CHINH,
            LA_KHACH_DAT: !!r.LA_KHACH_DAT,
        })));
    } catch (err) {
        next(err); // để middleware error tổng xử lý
    }
});


// POST /bookings/:id/guests  -> thêm 1 khách vào LUU_TRU_KHACH
router.post('/:id/guests', async (req, res, next) => {
    try {
        const bookingId = Number(req.params.id);
        if (!Number.isFinite(bookingId)) return res.status(400).json({ message: 'Invalid booking id' });

        const {
            KH_MA,
            LA_KHACH_CHINH = false,
            LA_KHACH_DAT = false,
            GHI_CHU = null,
        } = req.body || {};

        if (!KH_MA) return res.status(400).json({ message: 'KH_MA is required' });

        // nếu đã tồn tại -> cập nhật cờ; nếu chưa -> tạo mới
        const existed = await prisma.lUU_TRU_KHACH.findFirst({
            where: { HDONG_MA: bookingId, KH_MA: Number(KH_MA) },
            select: { HDONG_MA: true, KH_MA: true },
        });

        if (existed) {
            await prisma.lUU_TRU_KHACH.updateMany({
                where: { HDONG_MA: bookingId, KH_MA: Number(KH_MA) },
                data: {
                    LA_KHACH_CHINH: !!LA_KHACH_CHINH,
                    LA_KHACH_DAT: !!LA_KHACH_DAT,
                    GHI_CHU: GHI_CHU ?? null,
                },
            });
        } else {
            await prisma.lUU_TRU_KHACH.create({
                data: {
                    HDONG_MA: bookingId,
                    KH_MA: Number(KH_MA),
                    LA_KHACH_CHINH: !!LA_KHACH_CHINH,
                    LA_KHACH_DAT: !!LA_KHACH_DAT,
                    GHI_CHU: GHI_CHU ?? null,
                },
            });
        }

        return res.json({ ok: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
