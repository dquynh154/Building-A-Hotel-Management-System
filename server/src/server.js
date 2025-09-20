require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chat");
const adminRoutes = require('./routes/admin');
const reservationRoutes = require('./routes/reservations');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reservations', reservationRoutes);

app.listen(process.env.PORT || 3001, () => console.log("Server on", process.env.PORT || 3001));






