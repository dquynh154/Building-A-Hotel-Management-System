// routes/booking_pos.js
const r = require('express').Router();
const {
    getBookingFull, searchProducts, addService, updateService, removeService
} = require('../controllers/booking_pos');

// Chi tiết HĐ + các dòng
r.get('/bookings/:id/full', getBookingFull);

// Danh mục SP/DV để thêm vào HĐ
r.get('/products', searchProducts);

// Thao tác giỏ dịch vụ (giống POS)
r.post('/bookings/:id/services', addService);
r.patch('/bookings/:id/services/:ctdvId', updateService);
r.delete('/bookings/:id/services/:ctdvId', removeService);

module.exports = r;
