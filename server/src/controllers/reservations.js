const { prisma } = require('../db/prisma');

// helper: liệt kê từng ngày [start, end)
function eachDate(from, to) {
    const out = [];
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const stop = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (d < stop) { out.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return out;
}
async function priceForDate(roomTypeId, d) {
    return prisma.roomTypePrice.findFirst({
        where: { roomTypeId, unit: 'DAILY', validFrom: { lte: d }, OR: [{ validTo: null }, { validTo: { gte: d } }] },
        orderBy: { validFrom: 'desc' }
    });
}

// GET /api/reservations
exports.list = async (req, res) => {
    const where = req.user.role === 'GUEST'
        ? { guestId: req.user.id }       // guest = User
        : {};

    const data = await prisma.reservation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
            guest: true, // <- relation tới User, tên có thể vẫn là "guest"
            usages: { include: { room: { include: { roomType: true } } } }, // ReservationUsage
            services: { include: { service: true } },
            invoiceLinks: { include: { invoice: true } }, // InvoiceReservation
        },
    });
    res.json(data);
};

// POST /api/reservations
// body: { checkInPlan, checkOutPlan, items: [{ roomId, unitPrice }], guestInfo? }
exports.create = async (req, res) => {
    try {
        const { checkInPlan, checkOutPlan, items = [], guestInfo } = req.body;

        const start = new Date(checkInPlan);
        const end = new Date(checkOutPlan);
        if (isNaN(start) || isNaN(end) || start >= end) {
            return res.status(400).json({ message: 'Ngày không hợp lệ' });
        }
        if (!Array.isArray(items) || !items.length) {
            return res.status(400).json({ message: 'Thiếu phòng' });
        }

        // Xác định guest (guest = User)
        let guestId;
        if (req.user.role === 'GUEST') {
            guestId = req.user.id;
        } else {
            // Lễ tân tạo hộ: tìm User theo phone | email, không có thì tạo GUEST tối thiểu
            const { fullName, phone, email } = guestInfo || {};
            if (!fullName && !phone && !email) {
                return res.status(400).json({ message: 'Thiếu thông tin khách' });
            }
            let user = await prisma.user.findFirst({ where: { OR: [{ phone: phone || '' }, { email: email || '' }] } });
            if (!user) {
                user = await prisma.user.create({ data: { role: 'GUEST', fullName: fullName || null, phone: phone || null, email: email || null } });
            }
            guestId = user.id;
        }

        // Tạo usages theo từng đêm
        const nights = eachDate(start, end); // mảng ngày
        const usagesCreate = [];
        for (const it of items) {
            for (const d of nights) {
                usagesCreate.push({
                    roomId: Number(it.roomId),
                    unit: 'NIGHT',
                    date: d,
                    quantity: 1,
                    unitPrice: it.unitPrice,
                    amount: it.unitPrice, // 1 đêm
                });
            }
        }

        // Transaction tạo Reservation + Usages
        const data = await prisma.$transaction(async (tx) => {
            const reservation = await tx.reservation.create({
                data: {
                    guestId,
                    createdByUserId: req.user.id,
                    handledByUserId: req.user.role === 'GUEST' ? null : req.user.id,
                    checkInPlan: start,
                    checkOutPlan: end,
                    status: req.user.role === 'GUEST' ? 'PENDING' : 'CONFIRMED',
                },
            });

            // tạo chi tiết sử dụng
            for (const u of usagesCreate) {
                await tx.reservationUsage.create({
                    data: { ...u, reservationId: reservation.id },
                });
            }

            return tx.reservation.findUnique({
                where: { id: reservation.id },
                include: {
                    guest: true,
                    usages: { include: { room: { include: { roomType: true } } } },
                },
            });
        });

        res.status(201).json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Create reservation error' });
    }
};

// POST /api/reservations/:id/services
exports.addService = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { serviceId, quantity, unitPrice, note } = req.body;

        const reservation = await prisma.reservation.findUnique({ where: { id } });
        if (!reservation) return res.status(404).json({ message: 'Không tìm thấy hợp đồng' });
        if (req.user.role === 'GUEST' && reservation.guestId !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const item = await prisma.reservationService.create({
            data: {
                reservationId: id,
                serviceId,
                quantity: Number(quantity) || 1,
                unitPrice,
                note,
            },
            include: { service: true },
        });
        res.status(201).json(item);
    } catch {
        res.status(500).json({ message: 'Add service error' });
    }
};

// POST /api/reservations/:id/invoices/issue
exports.issueInvoice = async (req, res) => {
    try {
        const reservationId = Number(req.params.id);

        const [usages, services] = await Promise.all([
            prisma.reservationUsage.findMany({ where: { reservationId } }),
            prisma.reservationService.findMany({ where: { reservationId }, include: { service: true } }),
        ]);

        const sumRooms = usages.reduce((s, u) => s + Number(u.amount), 0);
        const sumServices = services.reduce((s, sv) => s + Number(sv.quantity) * Number(sv.unitPrice), 0);
        const subTotal = sumRooms + sumServices;

        const invoice = await prisma.invoice.create({
            data: {
                userId: req.user.id,
                subTotal: String(subTotal),
                grandTotal: String(subTotal), // giảm giá/đặt cọc xử lý thêm ở Promotion/Deposit nếu có
                status: 'ISSUED',
                items: {
                    create: [
                        ...usages.map(u => ({
                            type: 'ROOM_CHARGE',
                            description: `Phòng ${u.roomId} - đêm ${u.date.toISOString().slice(0, 10)}`,
                            quantity: 1,
                            unitPrice: u.unitPrice,
                        })),
                        ...services.map(sv => ({
                            type: 'SERVICE',
                            description: sv.note ? `${sv.service.name} - ${sv.note}` : sv.service.name,
                            quantity: sv.quantity,
                            unitPrice: sv.unitPrice,
                        })),
                    ],
                },
            },
            include: { items: true },
        });

        // Liên kết HĐ với hóa đơn (bảng nối)
        await prisma.invoiceReservation.create({
            data: { invoiceId: invoice.id, reservationId },
        });

        res.status(201).json(invoice);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Issue invoice error' });
    }
};

// POST /api/invoices/:id/pay
exports.payInvoice = async (req, res) => {
    try {
        const invoiceId = Number(req.params.id);
        const { method = 'CASH', amount, transCode } = req.body;

        const payment = await prisma.payment.create({
            data: { invoiceId, method, state: 'SUCCEEDED', amount, transCode },
        });

        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
        const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
        if (paid >= Number(invoice.grandTotal)) {
            await prisma.invoice.update({ where: { id: invoiceId }, data: { status: 'PAID' } });
        }

        res.status(201).json(payment);
    } catch {
        res.status(500).json({ message: 'Pay invoice error' });
    }
};
// ========== Vòng đời ==========
exports.confirm = async (req, res) => {
    const id = Number(req.params.id);
    const r = await prisma.reservation.update({ where: { id }, data: { status: 'CONFIRMED' } });
    res.json(r);
};

exports.cancel = async (req, res) => {
    const id = Number(req.params.id);
    const rsv = await prisma.reservation.findUnique({ where: { id } });
    if (!rsv) return res.status(404).json({ message: 'Không tìm thấy' });
    if (req.user.role === 'GUEST' && rsv.guestId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    const r = await prisma.reservation.update({ where: { id }, data: { status: 'CANCELLED' } });
    res.json(r);
};

exports.checkIn = async (req, res) => {
    const id = Number(req.params.id);
    const rsv = await prisma.reservation.update({
        where: { id },
        data: { status: 'CHECKED_IN', checkInAt: new Date() },
        include: { usages: true }
    });

    // Đánh dấu phòng OCCUPIED (đơn giản: tất cả phòng trong usages)
    const roomIds = [...new Set(rsv.usages.map(u => u.roomId))];
    await prisma.room.updateMany({ where: { id: { in: roomIds } }, data: { status: 'OCCUPIED' } });

    res.json(rsv);
};

exports.checkOut = async (req, res) => {
    const id = Number(req.params.id);

    // Nếu chưa có hóa đơn thì phát hành nhanh
    const links = await prisma.invoiceReservation.findMany({ where: { reservationId: id } });
    if (!links.length) {
        await exports.issueInvoice({ params: { id }, user: req.user }, { status: () => ({ json: () => { } }), json: () => { } });
    }

    const rsv = await prisma.reservation.update({
        where: { id },
        data: { status: 'CHECKED_OUT', checkOutAt: new Date() },
        include: { usages: true }
    });

    // Trả phòng về AVAILABLE và tạo log dọn phòng
    const roomIds = [...new Set(rsv.usages.map(u => u.roomId))];
    await prisma.room.updateMany({ where: { id: { in: roomIds } }, data: { status: 'AVAILABLE' } });
    await prisma.hkLog.createMany({ data: roomIds.map(roomId => ({ roomId, state: 'PENDING', note: 'Checkout' })) });

    res.json(rsv);
};

// ========== Đổi phòng ==========
exports.changeRoom = async (req, res) => {
    const id = Number(req.params.id);
    const { fromRoomId, toRoomId, fromDate, toDate } = req.body;
    if (!fromRoomId || !toRoomId) return res.status(400).json({ message: 'Thiếu fromRoomId/toRoomId' });

    const rsv = await prisma.reservation.findUnique({ where: { id } });
    if (!rsv) return res.status(404).json({ message: 'Không tìm thấy' });

    const start = new Date(fromDate || rsv.checkInPlan);
    const end = new Date(toDate || rsv.checkOutPlan);

    // kiểm tra phòng đích còn trống trong khoảng
    const conflict = await prisma.reservationUsage.findFirst({
        where: {
            roomId: Number(toRoomId),
            unit: 'NIGHT',
            date: { gte: start, lt: end },
            reservation: { id: { not: id }, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] } }
        }
    });
    if (conflict) return res.status(409).json({ message: 'Phòng đích bận trong khoảng ngày' });

    // lấy roomType đích
    const toRoom = await prisma.room.findUnique({ where: { id: Number(toRoomId) } });

    const nights = eachDate(start, end);
    await prisma.$transaction(async (tx) => {
        for (const d of nights) {
            // update từng usage cùng ngày & phòng nguồn
            const u = await tx.reservationUsage.findFirst({
                where: { reservationId: id, roomId: Number(fromRoomId), unit: 'NIGHT', date: d }
            });
            if (!u) continue;
            // tính lại đơn giá nếu đổi loại phòng
            let unitPrice = u.unitPrice;
            if (toRoom.roomTypeId !== (await tx.room.findUnique({ where: { id: Number(fromRoomId) } })).roomTypeId) {
                const p = await priceForDate(toRoom.roomTypeId, d);
                unitPrice = p ? p.price : u.unitPrice;
            }
            await tx.reservationUsage.update({ where: { id: u.id }, data: { roomId: Number(toRoomId), unitPrice, amount: unitPrice } });
        }
    });

    res.json({ ok: true });
};

// ========== Gia hạn / Rút ngắn ==========
exports.extendStay = async (req, res) => {
    const id = Number(req.params.id);
    const { newCheckOut } = req.body; // YYYY-MM-DD
    const rsv = await prisma.reservation.findUnique({ where: { id } });
    if (!rsv) return res.status(404).json({ message: 'Không tìm thấy' });

    const start = new Date(rsv.checkOutPlan);
    const end = new Date(newCheckOut);
    if (!(end > start)) return res.status(400).json({ message: 'Ngày mới phải sau ngày cũ' });

    // Lấy phòng đầu tiên của booking để gia hạn (đơn giản)
    const firstUsage = await prisma.reservationUsage.findFirst({ where: { reservationId: id }, orderBy: { date: 'asc' }, include: { room: true } });
    if (!firstUsage) return res.status(400).json({ message: 'Không có usage để gia hạn' });

    // Check phòng trống & tạo usage
    const nights = eachDate(start, end);
    await prisma.$transaction(async (tx) => {
        for (const d of nights) {
            const clash = await tx.reservationUsage.findFirst({
                where: {
                    roomId: firstUsage.roomId,
                    unit: 'NIGHT',
                    date: d,
                    reservation: { status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] } }
                }
            });
            if (clash) throw new Error('ROOM_BUSY');
            const p = await priceForDate(firstUsage.room.roomTypeId, d);
            await tx.reservationUsage.create({
                data: {
                    reservationId: id,
                    roomId: firstUsage.roomId,
                    unit: 'NIGHT',
                    date: d,
                    quantity: 1,
                    unitPrice: p?.price ?? firstUsage.unitPrice,
                    amount: p?.price ?? firstUsage.unitPrice
                }
            });
        }
        await tx.reservation.update({ where: { id }, data: { checkOutPlan: end } });
    });

    res.json({ ok: true });
};

exports.shortenStay = async (req, res) => {
    const id = Number(req.params.id);
    const { newCheckOut } = req.body;
    const rsv = await prisma.reservation.findUnique({ where: { id } });
    if (!rsv) return res.status(404).json({ message: 'Không tìm thấy' });

    const end = new Date(newCheckOut);
    if (!(end > rsv.checkInPlan)) return res.status(400).json({ message: 'Ngày mới không hợp lệ' });

    await prisma.$transaction(async (tx) => {
        await tx.reservationUsage.deleteMany({
            where: { reservationId: id, unit: 'NIGHT', date: { gte: end } }
        });
        await tx.reservation.update({ where: { id }, data: { checkOutPlan: end } });
    });

    res.json({ ok: true });
};