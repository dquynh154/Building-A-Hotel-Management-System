exports.ok = (res, data) => res.json(data);
exports.created = (res, data) => res.status(201).json(data);
exports.bad = (res, message = 'Bad request') => res.status(400).json({ message });
exports.unauth = (res, message = 'Unauthorized') => res.status(401).json({ message });
exports.forbid = (res, message = 'Forbidden') => res.status(403).json({ message });
exports.notfound = (res, message = 'Not found') => res.status(404).json({ message });
exports.conflict = (res, message = 'Conflict') => res.status(409).json({ message });
exports.fail = (res, error) => res.status(500).json({ message: error?.message || 'Server error' });
