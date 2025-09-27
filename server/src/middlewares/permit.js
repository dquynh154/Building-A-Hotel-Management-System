const { forbid } = require('../utils/responder');
module.exports = (...roles) => (req, res, next) => {
    if (!req.user) return forbid(res);
    if (!roles.length) return next();
    return roles.includes(req.user.role) ? next() : forbid(res);
};
