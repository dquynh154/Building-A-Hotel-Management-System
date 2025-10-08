const path = require('path');
const fs = require('fs');
// Luôn trỏ tới: server/uploads (ra khỏi src)
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
module.exports = { UPLOAD_DIR };
