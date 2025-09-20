const bcrypt = require('bcryptjs');
const { prisma } = require('../db/prisma');

exports.list = async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { id: 'desc' } });
    res.json(users);
};

exports.get = async (req, res) => {
    const id = Number(req.params.id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: 'Not found' });
    res.json(user);
};

exports.create = async (req, res) => {
    const { username, password, role = 'GUEST', fullName, phone, email } = req.body;
    const hash = password ? await bcrypt.hash(password, 10) : null;
    const u = await prisma.user.create({
        data: { username, password: hash, role, fullName, phone, email },
    });
    res.status(201).json(u);
};

exports.update = async (req, res) => {
    const id = Number(req.params.id);
    const data = { ...req.body };
    if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
    }
    const u = await prisma.user.update({ where: { id }, data });
    res.json(u);
};

exports.remove = async (req, res) => {
    const id = Number(req.params.id);
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
};
