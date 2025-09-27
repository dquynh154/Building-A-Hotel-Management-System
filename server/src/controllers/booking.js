// controllers/bookings.controller.js
const svc = require('../services/bookings');

exports.create = async (req, res, next) => {
    try {
        const row = await svc.createBooking(req.body || {});
        res.status(201).json(row);
    } catch (e) { next(e); }
};

exports.addNight = async (req, res, next) => {
    try {
        const hdId = Number(req.params.id);
        const r = await svc.addNightItems(hdId, req.body || {});
        res.status(201).json(r);
    } catch (e) { next(e); }
};

exports.addHour = async (req, res, next) => {
    try {
        const hdId = Number(req.params.id);
        const r = await svc.addHourItem(hdId, req.body || {});
        res.status(201).json(r);
    } catch (e) { next(e); }
};

exports.recalc = async (req, res, next) => {
    try {
        const hdId = Number(req.params.id);
        const r = await svc.recalcBooking(hdId);
        res.json(r);
    } catch (e) { next(e); }
};

exports.confirm = async (req, res, next) => {
    try {
        const hdId = Number(req.params.id);
        const r = await svc.setState(hdId, { HDONG_TRANG_THAI: 'CONFIRMED' });
        res.json(r);
    } catch (e) { next(e); }
};

exports.checkin = async (req, res, next) => {
    try {
        const hdId = Number(req.params.id);
        const r = await svc.checkin(hdId);
        res.json(r);
    } catch (e) { next(e); }
};

exports.checkout = async (req, res, next) => {
    try {
        const hdId = Number(req.params.id);
        const r = await svc.checkout(hdId);
        res.json(r);
    } catch (e) { next(e); }
};

exports.cancel = async (req, res, next) => {
    try {
        const hdId = Number(req.params.id);
        const r = await svc.setState(hdId, { HDONG_TRANG_THAI: 'CANCELLED' });
        res.json(r);
    } catch (e) { next(e); }
};
