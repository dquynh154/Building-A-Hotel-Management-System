// src/routes/invoice.routes.js
const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const inv = require('../controllers/hoadon');

const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');

r.use(auth);

r.post('/hoadon/from-booking/:hdId', staffOrAdmin, inv.createFromBooking);
r.get('/hoadon/:id', staffOrAdmin, inv.get);
r.post('/hoadon/:id/finalize', staffOrAdmin, inv.finalize);

module.exports = r;
