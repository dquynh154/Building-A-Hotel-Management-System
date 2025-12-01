// routes/booking_pos.js
const r = require('express').Router();
const {
    getBookingFull, searchProducts, addService, updateService, removeService, addItemToExisting, removeRoom, changeRoom, pendingRooms, addRoomForCheckedIn, markNoShow,
    adjustCheckout, applyLateFee
} = require('../controllers/booking_pos');

// Chi tiết HĐ + các dòng
r.get('/bookings/:id/full', getBookingFull);

// Danh mục SP/DV để thêm vào HĐ
r.get('/products', searchProducts);

// Thao tác giỏ dịch vụ (giống POS)
r.post('/bookings/:id/services', addService);
r.put('/bookings/:id/services/:ctdvStt', updateService);
r.delete('/bookings/:id/services/:ctdvStt', removeService);
r.post('/bookings/:id/add-room', addItemToExisting);
r.post('/bookings/:id/add-room-checkin', addRoomForCheckedIn);
r.delete('/bookings/:id/rooms/:phongId', removeRoom);
r.post('/bookings/:id/change-room', changeRoom);
r.get('/bookings/:id/pending-rooms', pendingRooms);
r.post('/bookings/:id/no-show',markNoShow)
r.post('/bookings/:id/adjust-checkout', adjustCheckout);
// r.post('/bookings/:id/extend-hour', extendStayHour);
// routes/booking_pos.js
r.post('/bookings/:id/apply-late-fee', applyLateFee);


module.exports = r;
