// src/routes/bookings.js
import { Router } from 'express';
import { upsertBookingGuests } from '../controllers/bookingGuests.js';

const router = Router();

router.put('/:id/guests', upsertBookingGuests);

export default router;
