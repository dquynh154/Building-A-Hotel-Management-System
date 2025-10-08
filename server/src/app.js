require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const morgan = require('morgan');
const routes = require('./routes/index');
const error = require('./middlewares/error');
const path = require('path');
const UPLOAD_DIR = path.resolve(__dirname, '../uploads');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
// app.use(morgan('dev'));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(routes);
app.use(error);

module.exports = app;
