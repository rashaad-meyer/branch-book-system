import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { createAppointmentSchema, referenceParamSchema } from '../schemas/index.js';
import * as appointmentService from '../services/appointment.service.js';

// Public guest-booking endpoints: the unguessable reference is the
// authorization token for reading a booking.
export function appointmentRouter() {
  const router = Router();

  router.post('/appointments', async (req, res) => {
    const input = createAppointmentSchema.parse(req.body);
    const appointment = await appointmentService.createAppointment(prisma, input);
    res.status(201).json(appointment);
  });

  router.get('/appointments/:reference', async (req, res) => {
    const { reference } = referenceParamSchema.parse(req.params);
    const appointment = await appointmentService.getAppointmentByReference(prisma, reference);
    res.json(appointment);
  });

  return router;
}
