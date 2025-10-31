const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const ctl = require('../controllers/hopdong');

const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');

r.use(auth);

r.get('/bookings', staffOrAdmin, ctl.list);
r.get('/bookings/:id', staffOrAdmin, ctl.get);
r.post('/bookings', staffOrAdmin, ctl.create);
r.put('/bookings/:id', staffOrAdmin, ctl.update);
r.delete('/bookings/:id', staffOrAdmin, ctl.remove);

r.post('/bookings/:id/checkin', staffOrAdmin, ctl.checkin);
r.post('/bookings/:id/checkin1', staffOrAdmin, ctl.checkin1);
r.post('/bookings/:id/checkout', staffOrAdmin, ctl.checkout);
r.post('/bookings/:id/cancel', staffOrAdmin, ctl.cancel);
// r.post('/bookings/checkin-now', staffOrAdmin, ctl.checkinNow);

module.exports = r;
