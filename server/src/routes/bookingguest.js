// routes/bookingguest.js
const { Router } = require('express');
const { upsertBookingGuests } = require('../controllers/bookingguest.js'); // chú ý tên file

const router = Router();

// => sẽ thành /bookings/:id/guests khi mount với prefix /bookings
router.put('/:id/guests', upsertBookingGuests);

module.exports = router;
