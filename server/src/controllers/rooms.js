const { crud } = require('../utils/crud');
module.exports = {
    ...crud('room', { roomType: true, floor: true })
};