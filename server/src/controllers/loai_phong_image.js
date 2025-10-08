const { prisma } = require('../db/prisma');
const path = require('path');
const fs = require('fs');
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');


function safeUnlink(relUrl) {
    try {
        // relUrl dạng "/uploads/<file>"; chỉ lấy basename cho an toàn
        const filePath = path.join(UPLOAD_DIR, path.basename(relUrl));
        fs.unlinkSync(filePath); // nếu muốn “êm”, dùng fs.unlink(filePath, ()=>{})
    } catch (e) {
        // nếu file không tồn tại (ENOENT) thì bỏ qua
        if (e.code !== 'ENOENT') console.error('unlink error:', e.message);
    }
}
exports.listByLoaiPhong = async (req, res, next) => {
    try {
        const lpId = Number(req.params.id);
        const rows = await prisma.lOAI_PHONG_IMAGE.findMany({
            where: { LP_MA: lpId },
            orderBy: [{ IS_MAIN: 'desc' }, { ORD: 'asc' }, { IMG_ID: 'asc' }],
        });
        res.json(rows);
    } catch (e) { next(e); }
};

exports.addMany = async (req, res, next) => {
    try {
        const lpId = Number(req.params.id);
        const { urls } = req.body; // string[]
        if (!Array.isArray(urls) || urls.length === 0) return res.json([]);

        const created = await prisma.$transaction(
            urls.map((u, i) => prisma.lOAI_PHONG_IMAGE.create({
                data: { LP_MA: lpId, URL: String(u), ORD: i },
            }))
        );
        res.status(201).json(created);
    } catch (e) { next(e); }
};

exports.setMain = async (req, res, next) => {
    try {
        const imgId = Number(req.params.imgId);
        const img = await prisma.lOAI_PHONG_IMAGE.findUnique({ where: { IMG_ID: imgId } });
        if (!img) return res.status(404).json({ message: 'Not found' });

        await prisma.$transaction([
            prisma.lOAI_PHONG_IMAGE.updateMany({
                where: { LP_MA: img.LP_MA, IS_MAIN: true },
                data: { IS_MAIN: false },
            }),
            prisma.lOAI_PHONG_IMAGE.update({
                where: { IMG_ID: imgId },
                data: { IS_MAIN: true },
            }),
        ]);
        res.json({ ok: true });
    } catch (e) { next(e); }
};

exports.updateOrder = async (req, res, next) => {
    try {
        const arr = req.body; // [{IMG_ID, ORD}]
        if (!Array.isArray(arr)) return res.json({ ok: true });
        await prisma.$transaction(
            arr.map(x => prisma.lOAI_PHONG_IMAGE.update({
                where: { IMG_ID: Number(x.IMG_ID) },
                data: { ORD: x.ORD == null ? null : Number(x.ORD) },
            }))
        );
        res.json({ ok: true });
    } catch (e) { next(e); }
};

// exports.remove = async (req, res, next) => {
//     try {
//         const imgId = Number(req.params.imgId);
//         await prisma.lOAI_PHONG_IMAGE.delete({ where: { IMG_ID: imgId } });
//         res.json({ ok: true });
//     } catch (e) { next(e); }
// };

exports.remove = async (req, res, next) => {
    try {
        const imgId = Number(req.params.imgId);
        const img = await prisma.lOAI_PHONG_IMAGE.findUnique({ where: { IMG_ID: imgId } });
        if (!img) return res.status(404).json({ message: 'Not found' });

        // xóa file trước (an toàn) rồi xóa record
        safeUnlink(img.URL);
        await prisma.lOAI_PHONG_IMAGE.delete({ where: { IMG_ID: imgId } });
        res.json({ ok: true });
    } catch (e) { next(e); }
};