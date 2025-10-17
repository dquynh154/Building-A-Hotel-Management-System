// src/controllers/bookingGuests.js
import prisma from '../prismaClient.js'; // nơi bạn export prisma

export async function upsertBookingGuests(req, res, next) {
    try {
        const bookingId = Number(req.params.id);
        const { guests, KHACH_DAT_ID } = req.body || {};

        if (!bookingId || !Array.isArray(guests)) {
            return res.status(400).json({ message: 'Thiếu bookingId hoặc guests' });
        }

        // kiểm tra hợp đồng tồn tại
        const booking = await prisma.hOP_DONG_DAT_PHONG.findUnique({
            where: { HDONG_MA: bookingId },
            select: { HDONG_MA: true }
        });
        if (!booking) return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });

        // chuẩn hóa dữ liệu
        const rows = guests
            .map((g) => ({
                HDONG_MA: bookingId,
                KH_MA: Number(g.KH_MA),
                LA_KHACH_CHINH: !!g.LA_KHACH_CHINH,
                LA_KHACH_DAT: KHACH_DAT_ID ? Number(g.KH_MA) === Number(KHACH_DAT_ID) : false,
                GHI_CHU: g.GHI_CHU ?? null,
            }))
            .filter((r) => Number.isFinite(r.KH_MA));

        // Đồng bộ theo chiến lược "replace all": xóa cũ -> chèn mới
        await prisma.$transaction([
            prisma.lUU_TRU_KHACH.deleteMany({ where: { HDONG_MA: bookingId } }),
            ...(rows.length
                ? [prisma.lUU_TRU_KHACH.createMany({ data: rows, skipDuplicates: true })]
                : []),
        ]);

        return res.json({ ok: true, count: rows.length });
    } catch (err) {
        next(err);
    }
}
