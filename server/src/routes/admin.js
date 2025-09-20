const express = require('express');
const { authRequired, permit } = require('../middlewares/auth');

const roomTypes = require('../controllers/roomTypes');
const rooms = require('../controllers/rooms');
const amenities = require('../controllers/amenities');
const floors = require('../controllers/floors');
const serviceCats = require('../controllers/serviceCategories');
const services = require('../controllers/services');
const users = require('../controllers/users');
const roomTypePrices = require('../controllers/roomTypePrices');
const r = express.Router();
r.use(authRequired, permit('ADMIN', 'MANAGER'));
// Mẫu đăng ký CRUD: list/get/create/update/delete
function regCrud(path, ctrl) {
    r.get(`/${path}`, ctrl.list);
    r.get(`/${path}/:id`, ctrl.get);
    r.post(`/${path}`, ctrl.create);
    r.put(`/${path}/:id`, ctrl.update);
    r.delete(`/${path}/:id`, ctrl.remove);
}

regCrud('room-types', roomTypes);
regCrud('roomtype-prices', roomTypePrices);
regCrud('rooms', rooms);
regCrud('amenities', amenities);
regCrud('floors', floors);
regCrud('service-categories', serviceCats);
regCrud('services', services);
regCrud('users', users);

module.exports = r;

const rta = require('../controllers/roomTypeAmenities');
r.post('/room-types/:roomTypeId/amenities', rta.setAmenitiesForRoomType);
