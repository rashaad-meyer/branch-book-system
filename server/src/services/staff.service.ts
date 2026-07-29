import type { PrismaClient } from '../generated/prisma/client.js';
import { zonedWallTimeToUtc } from '../lib/availability.js';
import { UnauthorizedError } from '../lib/errors.js';
import { cancelAppointmentForBranch } from './appointment.service.js';

async function getStaffUser(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { branch: { select: { id: true, name: true, timezone: true } } },
  });
  if (!user) {
    throw new UnauthorizedError('Account no longer exists', 'INVALID_TOKEN');
  }
  return user;
}

/**
 * All appointments (any status) at the staff member's branch that overlap the
 * given branch-local calendar day.
 */
export async function getBranchSchedule(prisma: PrismaClient, userId: string, date: string) {
  const user = await getStaffUser(prisma, userId);
  const branch = user.branch;

  const nextDate = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const dayStart = zonedWallTimeToUtc(date, '00:00', branch.timezone);
  const dayEnd = zonedWallTimeToUtc(nextDate, '00:00', branch.timezone);

  const appointments = await prisma.appointment.findMany({
    where: { branchId: branch.id, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
    include: { service: { select: { id: true, name: true, durationMinutes: true } } },
    orderBy: { startsAt: 'asc' },
  });

  return { branch, date, appointments };
}

/** Cancel an appointment at the staff member's own branch. */
export async function cancelBranchAppointment(
  prisma: PrismaClient,
  userId: string,
  appointmentId: string,
) {
  const user = await getStaffUser(prisma, userId);
  return cancelAppointmentForBranch(prisma, appointmentId, user.branchId);
}
