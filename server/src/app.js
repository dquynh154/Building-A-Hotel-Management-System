require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const morgan = require('morgan');
const routes = require('./routes/index');
const error = require('./middlewares/error');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
// app.use(morgan('dev'));
app.use(routes);
app.use(error);

module.exports = app;
