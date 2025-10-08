// server/src/routes/upload.js
const express = require('express');
const r = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Dùng đúng: server/uploads
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_')),
});

const upload = multer({
    storage,
    fileFilter: (_, file, cb) => file.mimetype.startsWith('image/')
        ? cb(null, true)
        : cb(new Error('Chỉ chấp nhận file ảnh')),
    limits: { fileSize: 4 * 1024 * 1024 }, // 4MB
});

// POST /upload/loai-phong
r.post('/loai-phong', (req, res, next) => {
    upload.array('files', 10)(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'File quá 4MB' });
        return res.status(400).json({ message: err.message || 'Upload thất bại' });
    });
}, (req, res) => {
    const files = req.files || [];
    const urls = files.map(f => `/uploads/${path.basename(f.path)}`);
    res.json({ urls });
});

module.exports = r;
