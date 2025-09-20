const jwt = require("jsonwebtoken");

function authRequired(req, res, next) {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const token = h.split(' ')[1];
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload; // { id, role, username }
        next();
    } catch {
        res.status(401).json({ message: 'Invalid token' });
    }
}

function permit(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
        if (!roles.length || roles.includes(req.user.role)) return next();
        return res.status(403).json({ message: 'Forbidden' });
    };
}

module.exports = { authRequired, permit };