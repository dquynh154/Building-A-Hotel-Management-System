const r = require('express').Router();

r.get('/health', (req, res) => res.json({ ok: true }));
r.use('/chatbot', require('./chatbot'));
r.use('/public', require('./public'));

r.use('/auth/guest', require('./auth_guest'));
r.use('/auth/staff', require('./auth_staff'));
r.use('/', require('./baocao'));
r.use('/', require('./yeucaudv'));
r.use('/', require('./booking'));
r.use('/', require('./pricing'));
r.use('/', require('./danhgia'));
r.use('/', require('./crud'));
// r.use('/', require('./booking'));
r.use('/', require('./ctdv'));
r.use('/', require('./hoadon'));
r.use('/', require('./thanhtoan'));
r.use('/', require('./hoadon_hopdong'));
r.use('/', require('./hopdong'));
r.use('/', require('./ctsd'));
r.use('/bookings', require('./bookingguest'));
r.use('/', require('./availability'));
r.use('/', require('./booking_pos'));
module.exports = r;
