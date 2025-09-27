const r = require('express').Router();
const c = require('../controllers/auth_guest');
const auth = require('../middlewares/auth');

r.post('/register', c.register);
r.post('/login', c.login);
r.get('/me', auth, c.me);
r.post('/change-password', auth, c.changePassword);

module.exports = r;
