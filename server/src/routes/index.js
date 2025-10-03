const r = require('express').Router();

r.get('/health', (req, res) => res.json({ ok: true }));

r.use('/auth/guest', require('./auth_guest'));
r.use('/auth/staff', require('./auth_staff'));
r.use('/', require('./crud'));
r.use('/', require('./booking'));
r.use('/', require('./ctdv'));

r.use('/', require('./hoadon'));
r.use('/', require('./thanhtoan'));
r.use('/', require('./hoadon_hopdong'));
module.exports = r;
