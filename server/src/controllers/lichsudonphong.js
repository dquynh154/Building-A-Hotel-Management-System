const { crud } = require('./crud');
const { prisma } = require('../db/prisma');   

const lichsudonphong = crud('lICH_SU_DON_PHONG', {
    pk: 'LSDP_MA',
    include: { PHONG: true },

    // Tạo ticket dọn phòng: chỉ khi phòng CHUA_DON
    beforeCreate: async (data) => {
        if (!data.PHONG_MA || !data.LSDP_TRANGTHAI) {
            // cho phép client không gửi trạng thái -> mặc định PENDING
            data.LSDP_TRANGTHAI = data.LSDP_TRANGTHAI ?? 'PENDING';
        }
        const room = await prisma.pHONG.findUnique({
            where: { PHONG_MA: Number(data.PHONG_MA) },
            select: { PHONG_TRANGTHAI: true },
        });
        if (!room) {
            const err = new Error('PHONG_MA không tồn tại'); err.status = 400; throw err;
        }
        if (room.PHONG_TRANGTHAI !== 'CHUA_DON') {
            const err = new Error('Chỉ tạo dọn phòng khi phòng đang CHUA_DON'); err.status = 409; throw err;
        }
        // không đổi trạng thái phòng ở bước tạo; chuyển khi bắt đầu dọn
        return data;
    },

    // Cập nhật: đổi trạng thái phòng theo tiến độ dọn
    beforeUpdate: async (data, { id }) => {
        // Lấy record hiện tại để biết PHONG_MA
        const current = await prisma.lICH_SU_DON_PHONG.findUnique({
            where: { LSDP_MA: Number(id) },
            select: { PHONG_MA: true },
        });
        if (!current) {
            const err = new Error('Record không tồn tại'); err.status = 404; throw err;
        }

        // Nếu client chuyển trạng thái dọn phòng
        if (data.LSDP_TRANGTHAI === 'IN_PROGRESS') {
            await prisma.pHONG.update({
                where: { PHONG_MA: current.PHONG_MA },
                data: { PHONG_TRANGTHAI: 'MAINTENANCE' }, // đang dọn
            });
        }

        if (data.LSDP_TRANGTHAI === 'DONE') {
            await prisma.pHONG.update({
                where: { PHONG_MA: current.PHONG_MA },
                data: { PHONG_TRANGTHAI: 'AVAILABLE' }, // dọn xong -> sẵn sàng
            });
        }

        if (data.LSDP_TRANGTHAI === 'CANCELLED') {
            // hủy dọn: nếu vẫn đang CHUA_DON thì giữ nguyên; không ép AVAILABLE
            // (tùy quy trình của bạn, có thể đặt lại CHUA_DON)
        }

        return data;
    },
});

module.exports = lichsudonphong;