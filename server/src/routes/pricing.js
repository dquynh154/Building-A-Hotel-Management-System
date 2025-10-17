const r = require('express').Router();
const auth = require('../middlewares/auth');
const permit = require('../middlewares/permit');
const ctl = require('../controllers/pricing');

const staffOrAdmin = permit('ADMIN', 'RECEPTIONIST');

r.use(auth);
r.get('/pricing/quote', staffOrAdmin, ctl.quote);

module.exports = r;
