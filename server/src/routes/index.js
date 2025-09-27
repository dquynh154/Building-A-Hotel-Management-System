const r = require('express').Router();

r.get('/health', (req, res) => res.json({ ok: true }));

r.use('/auth/guest', require('./auth_guest'));
r.use('/auth/staff', require('./auth_staff'));
r.use('/crud', require('./crud'));
r.use('/', require('./bookings.routes')); // thêm dòng này

module.exports = r;
