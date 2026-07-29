import { Router } from 'express';

import { fingerprintRequest, runIdempotent } from '../lib/idempotency.js';
import { prisma } from '../lib/prisma.js';
import {
  createAppointmentSchema,
  idempotencyKeySchema,
  referenceParamSchema,
} from '../schemas/index.js';
import * as appointmentService from '../services/appointment.service.js';

// Public guest-booking endpoints: the unguessable reference is the
// authorization token for reading a booking.
export function appointmentRouter() {
  const router = Router();

  router.post('/appointments', async (req, res) => {
    const input = createAppointmentSchema.parse(req.body);
    // Optional `Idempotency-Key` makes retries safe: a repeated key replays the
    // original booking instead of creating a duplicate. Absent = book directly.
    const rawKey = req.header('Idempotency-Key');
    const idempotencyKey = rawKey === undefined ? undefined : idempotencyKeySchema.parse(rawKey);

    const result = await runIdempotent(prisma, idempotencyKey, fingerprintRequest(input), 201, () =>
      appointmentService.createAppointment(prisma, input),
    );
    res.status(result.status).json(result.body);
  });

  router.get('/appointments/:reference', async (req, res) => {
    const { reference } = referenceParamSchema.parse(req.params);
    const appointment = await appointmentService.getAppointmentByReference(prisma, reference);
    res.json(appointment);
  });

  router.post('/appointments/:reference/cancel', async (req, res) => {
    const { reference } = referenceParamSchema.parse(req.params);
    const appointment = await appointmentService.cancelAppointmentByReference(prisma, reference);
    res.json(appointment);
  });

  return router;
}
