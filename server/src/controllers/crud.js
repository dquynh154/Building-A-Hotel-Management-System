// controllers/crud.js
const { prisma } = require('../db/prisma');

exports.crud = (
    modelName,
    {
    pk = 'id', 
    include = {}, 
    select = null, 
    beforeCreate, 
    beforeUpdate, 
    searchFields = [], // ví dụ: ['NV_HOTEN','NV_TAIKHOAN']
    eqFields = [],     // ví dụ: ['NV_TRANGTHAI','LP_MA']
    } = {}
) => {
    const model = prisma[modelName];
    if (!model) throw new Error(`Unknown model: ${modelName}`);

    // helper: parse id theo kiểu hợp lý (đừng ép Number với mọi thứ)
    const parseId = (raw) => {
        if (/^\d+$/.test(raw)) return Number(raw); // số nguyên
        return raw; // để nguyên nếu là string / UUID
    };

    const withFields = (extra = {}) =>
        select ? { select, ...extra } : { include, ...extra };
    
    const buildWhere = (req) => {
        const { search } = req.query;
        const where = {};

        // =========== eq.<field>=value ===========
        // ví dụ: ?eq.NV_TRANGTHAI=DANG_LAM&eq.LP_MA=2
        for (const f of eqFields) {
            const val = req.query?.[`eq.${f}`];
            if (val !== undefined) {
                where[f] = /^\d+$/.test(val) ? Number(val) : val;
            }
        }

        // =========== search ===========
        if (search && searchFields.length) {
            where.OR = searchFields.map((f) => ({
                [f]: { contains: String(search)},
            }));
        }

        return where;
    };
    return {
        list: async (req, res, next) => {
            try {
                const skip = Number(req.query.skip ?? 0);
                const take = Math.min(Number(req.query.take ?? 50), 200);

                // sort: ?sort=NV_MA&dir=desc
                const sort = req.query.sort;
                const dir = (req.query.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
                const orderBy = sort ? { [sort]: dir } : undefined;

                const where = buildWhere(req);
                const wantTotal =
                    String(req.query.withTotal || req.query.total || '') === '1';

                if (!wantTotal) {
                    // Giữ hành vi cũ
                    const rows = await model.findMany(withFields({ skip, take, where, orderBy }));
                    return res.json(rows);
                }

                // Trả {items,total,page,take}
                const [items, total] = await Promise.all([
                    model.findMany(withFields({ skip, take, where, orderBy })),
                    model.count({ where }),
                ]);

                return res.json({ items, total, page: Math.floor(skip / take) + 1, take });
            } catch (e) { next(e); }
        },
        get: async (req, res, next) => {
            try {
                const idVal = parseId(req.params.id);
                const row = await model.findUnique({ where: { [pk]: idVal }, include });
                if (!row) return res.status(404).json({ message: 'Not found' });
                res.json(row);
            } catch (e) { next(e); }
        },
        create: async (req, res, next) => {
            try {
                let data = { ...req.body };
                if (beforeCreate) data = await beforeCreate(data, { req });
                const row = await model.create(withFields({ data }));
                res.status(201).json(row);
            } catch (e) { next(e); }
        },
        update: async (req, res, next) => {
            try {
                const idVal = parseId(req.params.id);
                let data = { ...req.body };
                if (beforeUpdate) data = await beforeUpdate(data,{ req, id: idVal });
                const row = await model.update(withFields({
                    where: { [pk]: idVal },
                    data,
                }));
                res.json(row);
            } catch (e) { next(e); }
        },
        remove: async (req, res, next) => {
            try {
                const idVal = parseId(req.params.id);
                await model.delete({ where: { [pk]: idVal } });
                res.json({ ok: true });
            } catch (e) { next(e); }
        },
    };
};
