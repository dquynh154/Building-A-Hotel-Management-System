const { prisma } = require('../db/prisma');

function crud(modelName, defaultInclude = {}) {
    const model = prisma[modelName]; // vd: 'room', 'roomType', 'amenity'
    if (!model) throw new Error(`Unknown model: ${modelName}`);

    return {
        list: async (req, res) => {
            const { skip = 0, take = 50 } = req.query;
            const data = await model.findMany({
                skip: Number(skip), take: Number(take),
                include: defaultInclude
            });
            res.json(data);
        },
        get: async (req, res) => {
            const id = Number(req.params.id);
            const row = await model.findUnique({ where: { id }, include: defaultInclude });
            if (!row) return res.status(404).json({ message: 'Not found' });
            res.json(row);
        },
        create: async (req, res) => {
            const row = await model.create({ data: req.body });
            res.status(201).json(row);
        },
        update: async (req, res) => {
            const id = Number(req.params.id);
            const row = await model.update({ where: { id }, data: req.body });
            res.json(row);
        },
        remove: async (req, res) => {
            const id = Number(req.params.id);
            await model.delete({ where: { id } });
            res.json({ ok: true });
        },
    };
}

module.exports = { crud };