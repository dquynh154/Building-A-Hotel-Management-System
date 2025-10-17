const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const ctl = require('../controllers/ctsd');

const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');

r.use(auth);

// Chi tiết sử dụng (items) thuộc booking
r.get('/bookings/:id/items/', staffOrAdmin, ctl.list);
r.post('/bookings/:id/items', staffOrAdmin, ctl.create);
r.put('/bookings/:id/items/:phongMa/:stt', staffOrAdmin, ctl.update);
r.delete('/bookings/:id/items/:phongMa/:stt', staffOrAdmin, ctl.remove);
r.post('/bookings/:id/items/:phongMa/:stt/close', staffOrAdmin, ctl.closeItem);

module.exports = r;
