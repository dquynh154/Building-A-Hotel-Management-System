require('dotenv').config();
const { prisma } = require('../src/db/prisma');
const { hash } = require('../src/utils/hash');

(async () => {
    const username = 'admin';
    const exists = await prisma.nHAN_VIEN.findUnique({ where: { NV_TAIKHOAN: username } });
    if (!exists) {
        await prisma.nHAN_VIEN.create({
            data: {
                NV_HOTEN: 'Quản trị viên',
                NV_TAIKHOAN: username,
                NV_MATKHAU: await hash('123456'),
                NV_SDT: '0900000000',
                NV_CHUCVU: 'Admin',
            },
        });
        console.log('Seeded admin: admin / admin123');
    } else {
        console.log('Admin exists');
    }
    await prisma.$disconnect();
})();
