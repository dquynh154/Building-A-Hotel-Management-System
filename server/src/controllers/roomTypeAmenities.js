const { prisma } = require('../db/prisma');

exports.setAmenitiesForRoomType = async (req, res) => {
    const roomTypeId = Number(req.params.roomTypeId);

    // Hỗ trợ 2 format body:
    // 1) { amenities: [{ amenityId, quantity?, installedAt? }, ...] }
    // 2) { amenityIds: [1,2,3] }
    const { amenities, amenityIds } = req.body;

    let items = [];
    if (Array.isArray(amenities)) {
        items = amenities.map((a) => ({
            amenityId: Number(a.amenityId),
            quantity: a.quantity != null ? Math.max(1, Number(a.quantity)) : 1,
            installedAt: a.installedAt ? new Date(a.installedAt) : new Date(),
        }));
    } else if (Array.isArray(amenityIds)) {
        items = amenityIds.map((id) => ({
            amenityId: Number(id),
            quantity: 1,
            installedAt: new Date(),
        }));
    } else {
        return res.status(400).json({
            message:
                'Body phải có amenities (array các object) hoặc amenityIds (array số).',
        });
    }

    // Validate đơn giản
    if (items.some((it) => !it.amenityId || Number.isNaN(it.amenityId))) {
        return res.status(400).json({ message: 'amenityId không hợp lệ' });
    }

    await prisma.$transaction(async (tx) => {
        // Xóa toàn bộ trước khi gán lại
        await tx.roomTypeAmenity.deleteMany({ where: { roomTypeId } });

        if (items.length) {
            await tx.roomTypeAmenity.createMany({
                data: items.map((it) => ({
                    roomTypeId,
                    amenityId: it.amenityId,
                    quantity: it.quantity,        // Int? @default(1)
                    installedAt: it.installedAt,  // DateTime? @default(now())
                })),
                skipDuplicates: true,
            });
        }
    });

    const links = await prisma.roomTypeAmenity.findMany({
        where: { roomTypeId },
        include: { amenity: true },
    });
    res.json(links);
};
