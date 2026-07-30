import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { fingerprintRequest, runIdempotent } from '../lib/idempotency.js';
import { prisma } from '../lib/prisma.js';
import {
  createAppointmentSchema,
  idempotencyKeySchema,
  referenceParamSchema,
} from '../schemas/index.js';
import * as appointmentService from '../services/appointment.service.js';

export interface AppointmentRouterOptions {
  /** Overridden by tests to trigger 429s quickly. */
  bookingRateLimitMax?: number | undefined;
  lookupRateLimitMax?: number | undefined;
}

// Public guest-booking endpoints: the unguessable reference is the
// authorization token for reading a booking.
export function appointmentRouter(options: AppointmentRouterOptions = {}) {
  const router = Router();

  const limiterDefaults = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: true as const,
    legacyHeaders: false,
    message: {
      error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, try again later' },
    },
  };

  // Per-IP, in-memory (per instance). Multi-instance deployments would use a
  // shared store (e.g. rate-limit-redis) — noted in README design decisions.
  const bookingLimiter = rateLimit({
    ...limiterDefaults,
    limit: options.bookingRateLimitMax ?? 50,
  });
  // The reference is the authorization token for a booking, so the lookup and
  // cancel endpoints are rate limited against enumeration attempts.
  const lookupLimiter = rateLimit({
    ...limiterDefaults,
    limit: options.lookupRateLimitMax ?? 100,
  });

  router.post('/appointments', bookingLimiter, async (req, res) => {
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

  router.get('/appointments/:reference', lookupLimiter, async (req, res) => {
    const { reference } = referenceParamSchema.parse(req.params);
    const appointment = await appointmentService.getAppointmentByReference(prisma, reference);
    res.json(appointment);
  });

  router.post('/appointments/:reference/cancel', lookupLimiter, async (req, res) => {
    const { reference } = referenceParamSchema.parse(req.params);
    const appointment = await appointmentService.cancelAppointmentByReference(prisma, reference);
    res.json(appointment);
  });

  return router;
}
