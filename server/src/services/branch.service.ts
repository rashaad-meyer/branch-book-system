import type { PrismaClient } from '../generated/prisma/client.js';
import { operatingHoursSchema, type BranchAvailabilityQuerySchema } from '../schemas/index.js';
import { NotFoundError } from '../lib/errors.js';
import { env } from '../config/env.js';
import { timeSlots, findAvailableSlots, zonedWallTimeToUtc } from '../lib/availability.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export async function listBranches(prisma: PrismaClient) {
  // Services are included so the client can build the booking form without a
  // second round-trip; the catalog is small (a handful of rows per branch).
  const branches = await prisma.branch.findMany({
    include: {
      services: {
        select: { id: true, name: true, durationMinutes: true },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  return branches;
}

export async function getBranchAvailability(
  prisma: PrismaClient,
  branchId: string,
  query: BranchAvailabilityQuerySchema,
) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw new NotFoundError('Branch not found', 'BRANCH_NOT_FOUND');
  }

  const service = await prisma.service.findFirst({ where: { id: query.serviceId, branchId } });
  if (!service) {
    throw new NotFoundError('Service not found', 'SERVICE_NOT_FOUND');
  }

  // query.date is a calendar day in the branch's local timezone. getUTCDay on
  // the Z-parsed date gives that calendar day's weekday regardless of server tz.
  const dayOfWeek = DAYS[new Date(`${query.date}T00:00:00Z`).getUTCDay()]!;
  const operatingHours = operatingHoursSchema.parse(branch.operatingHours);
  const branchHoursOnDay = operatingHours[dayOfWeek];
  if (!branchHoursOnDay) {
    return [];
  }

  // Operating hours are branch-local wall times; convert to UTC instants.
  const opensAt = zonedWallTimeToUtc(query.date, branchHoursOnDay[0], branch.timezone);
  const closesAt = zonedWallTimeToUtc(query.date, branchHoursOnDay[1], branch.timezone);

  const appointments = await prisma.appointment.findMany({
    // Mirrors the appointment_no_overlap exclusion constraint: same overlap
    // window (startsAt < close AND endsAt > open) and same status predicate
    // (<> CANCELLED). If these ever diverge, availability will offer slots
    // the insert then rejects — keep them in sync.
    where: {
      branchId,
      status: { not: 'CANCELLED' },
      startsAt: { lt: closesAt },
      endsAt: { gt: opensAt },
    },
    orderBy: { startsAt: 'asc' },
  });

  const candidateStarts = timeSlots(opensAt, closesAt, env.SLOT_INTERVAL_MINUTES);
  const availableSlots = findAvailableSlots(
    candidateStarts,
    appointments,
    service.durationMinutes,
    closesAt,
    new Date(), // never offer slots in the past
  );

  return availableSlots.map((slot) => ({
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
  }));
}
