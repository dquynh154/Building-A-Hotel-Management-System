const r = require('express').Router();
const { authRequired, permit } = require('../middlewares/auth');
const c = require('../controllers/reservations');
r.use(authRequired);
r.get('/', c.list);
r.post('/', c.create);                  // GUEST hoặc STAFF

// thay đổi vòng đời
r.post('/:id/confirm', permit('RECEPTIONIST', 'MANAGER', 'ADMIN'), c.confirm);
r.post('/:id/cancel', c.cancel);           // khách hủy của mình; staff hủy bất kỳ
r.post('/:id/check-in', permit('RECEPTIONIST', 'MANAGER', 'ADMIN'), c.checkIn);
r.post('/:id/check-out', permit('RECEPTIONIST', 'MANAGER', 'ADMIN'), c.checkOut);

// đổi phòng / kéo dài / rút ngắn
r.post('/:id/change-room', permit('RECEPTIONIST', 'MANAGER', 'ADMIN'), c.changeRoom);
r.post('/:id/extend', permit('RECEPTIONIST', 'MANAGER', 'ADMIN'), c.extendStay);
r.post('/:id/shorten', permit('RECEPTIONIST', 'MANAGER', 'ADMIN'), c.shortenStay);

// dịch vụ & hoá đơn
r.post('/:id/services', c.addService);  // GUEST (của mình) hoặc STAFF
r.post('/:id/invoices/issue', permit('RECEPTIONIST', 'MANAGER', 'ADMIN'), c.issueInvoice);
r.post('/invoices/:id/pay', permit('RECEPTIONIST', 'MANAGER', 'ADMIN'), c.payInvoice);
module.exports = r;
