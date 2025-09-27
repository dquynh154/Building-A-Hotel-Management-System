require('dotenv').config();
const { prisma } = require('../src/db/prisma');

(async () => {
    console.log(Object.keys(prisma));
    await prisma.$disconnect();
})();
