const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const ctl = require('../controllers/bookings.controller');

const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');
r.use(auth);

r.post('/bookings', staffOrAdmin, ctl.create);
r.post('/bookings/:id/items/night', staffOrAdmin, ctl.addNight);
r.post('/bookings/:id/items/hour', staffOrAdmin, ctl.addHour);
r.post('/bookings/:id/recalc', staffOrAdmin, ctl.recalc);
r.post('/bookings/:id/confirm', staffOrAdmin, ctl.confirm);
r.post('/bookings/:id/checkin', staffOrAdmin, ctl.checkin);
r.post('/bookings/:id/checkout', staffOrAdmin, ctl.checkout);
r.post('/bookings/:id/cancel', staffOrAdmin, ctl.cancel);

module.exports = r;
