const r = require('express').Router();
const { roomTypeAvailability } = require('../controllers/availability');

r.get('/availability/room-types', roomTypeAvailability);
module.exports = r;
