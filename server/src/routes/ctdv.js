const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const svc = require('../controllers/ctdv');

const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');

r.use(auth);

// base path: /bookings/:id/rooms/:phongMa/items/:stt/services
r.get('/bookings/:id/rooms/:phongMa/items/:stt/services', staffOrAdmin, svc.list);
r.post('/bookings/:id/rooms/:phongMa/items/:stt/services', staffOrAdmin, svc.create);
r.put('/bookings/:id/rooms/:phongMa/items/:stt/services/:dvMa/:ctdvStt', staffOrAdmin, svc.update);
r.delete('/bookings/:id/rooms/:phongMa/items/:stt/services/:dvMa/:ctdvStt', staffOrAdmin, svc.remove);
r.post('/bookings/:id/rooms/:phongMa/items/:stt/services/:dvMa/:ctdvStt/cancel', staffOrAdmin, svc.cancel);

module.exports = r;
