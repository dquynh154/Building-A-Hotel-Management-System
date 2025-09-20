const r = require("express").Router();
const c = require("../controllers/auth");
const { authRequired } = require('../middlewares/auth');
r.post("/register", c.register);
r.post("/login", c.login);
r.put('/me', authRequired, c.updateMe);
r.put('/me/password', authRequired, c.changeMyPassword);
module.exports = r;
