const bcrypt = require('bcryptjs');
const SALT = 10;

exports.hash = async (plain) => bcrypt.hash(plain, SALT);
exports.compare = async (plain, hashed) => bcrypt.compare(plain, hashed);
