// src/routes/payment.routes.js
const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const pay = require('../controllers/thanhtoan');

const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');

r.use(auth);

r.post('/thanhtoan', staffOrAdmin, pay.create);
r.post('/thanhtoan/:id/succeed', staffOrAdmin, pay.markSucceeded);
r.post('/thanhtoan/:id/failed', staffOrAdmin, pay.markFailed);

module.exports = r;
