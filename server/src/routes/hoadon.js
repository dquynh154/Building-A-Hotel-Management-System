// src/routes/invoice.routes.js
const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const inv = require('../controllers/hoadon');
const invStatus = require('../controllers/invoice_status.js');
const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');

r.use(auth);

r.post('/hoadon/from-booking/:hdId', staffOrAdmin, inv.createFromBooking);
r.get('/hoadon/:id', staffOrAdmin, inv.get);
r.post('/hoadon/:id/finalize', staffOrAdmin, inv.finalize);
r.get('/bookings/:hdId/invoice-status', staffOrAdmin, invStatus.byBooking);
module.exports = r;
