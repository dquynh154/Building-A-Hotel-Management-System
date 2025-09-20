const r = require("express").Router();
const c = require("../controllers/chat");
r.post("/session", c.newSession);
r.post("/message", c.sendMessage);
r.get("/history", c.history);
module.exports = r;
