import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { authedUserId, requireAuth } from '../middleware/auth.js';
import { idParamSchema, staffScheduleQuerySchema } from '../schemas/index.js';
import * as staffService from '../services/staff.service.js';

/** Staff-only endpoints; every route requires a valid staff JWT. */
export function staffRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/staff/schedule', async (req, res) => {
    const { date } = staffScheduleQuerySchema.parse(req.query);
    const schedule = await staffService.getBranchSchedule(prisma, authedUserId(req.userId), date);
    res.json(schedule);
  });

  router.post('/staff/appointments/:id/cancel', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const appointment = await staffService.cancelBranchAppointment(
      prisma,
      authedUserId(req.userId),
      id,
    );
    res.json(appointment);
  });

  return router;
}
