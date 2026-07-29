import { formatInTimeZone } from 'date-fns-tz';

import type { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { zonedWallTimeToUtc } from '../lib/availability.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../lib/errors.js';
import { consoleNotifier, type Notifier } from '../lib/notifications.js';
import { generateReference } from '../lib/reference.js';
import {
  BOOKING_HORIZON_DAYS,
  operatingHoursSchema,
  type CreateAppointmentSchema,
} from '../schemas/index.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * The exclusion constraint rejects an overlapping insert with Postgres error
 * 23P01. Prisma surfaces it wrapped, so match on the constraint name.
 */
function isOverlapViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes('appointment_no_overlap');
}

function isReferenceCollision(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'P2002' &&
    error.message.includes('reference')
  );
}

/**
 * Under true concurrency Postgres may resolve two overlapping inserts as a
 * deadlock (40P01) rather than an exclusion violation (23P01), aborting one
 * transaction as the victim. Prisma surfaces this wrapped (code P2039). The
 * victim is safe to retry: the winner has since committed — so the retry hits
 * the exclusion constraint cleanly (23P01 → 409 SLOT_TAKEN) — or rolled back,
 * in which case the retry succeeds.
 */
function isDeadlock(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes('deadlock detected') || error.message.includes('40P01'))
  );
}

export async function createAppointment(
  prisma: PrismaClient,
  input: CreateAppointmentSchema,
  notifier: Notifier = consoleNotifier,
) {
  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, branchId: input.branchId },
    include: { branch: true },
  });
  if (!service) {
    throw new NotFoundError('Service not found for this branch', 'SERVICE_NOT_FOUND');
  }
  const branch = service.branch;

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  const now = new Date();
  if (startsAt <= now) {
    throw new UnprocessableError('SLOT_IN_PAST', 'Appointments must start in the future');
  }
  if (startsAt.getTime() - now.getTime() > BOOKING_HORIZON_DAYS * 86_400_000) {
    throw new UnprocessableError(
      'BEYOND_BOOKING_HORIZON',
      `Appointments can be booked at most ${BOOKING_HORIZON_DAYS} days ahead`,
    );
  }

  // Resolve the branch-local calendar day of the requested instant, then its
  // operating window in UTC — the same math the availability endpoint uses.
  const localDate = formatInTimeZone(startsAt, branch.timezone, 'yyyy-MM-dd');
  const dayOfWeek = DAYS[new Date(`${localDate}T00:00:00Z`).getUTCDay()]!;
  const hoursOnDay = operatingHoursSchema.parse(branch.operatingHours)[dayOfWeek];
  if (!hoursOnDay) {
    throw new UnprocessableError('BRANCH_CLOSED', 'The branch is closed on this day');
  }

  const opensAt = zonedWallTimeToUtc(localDate, hoursOnDay[0], branch.timezone);
  const closesAt = zonedWallTimeToUtc(localDate, hoursOnDay[1], branch.timezone);
  if (startsAt < opensAt || endsAt > closesAt) {
    throw new UnprocessableError(
      'OUTSIDE_OPERATING_HOURS',
      'The appointment does not fit within the branch operating hours',
    );
  }
  if ((startsAt.getTime() - opensAt.getTime()) % (env.SLOT_INTERVAL_MINUTES * 60_000) !== 0) {
    throw new UnprocessableError(
      'INVALID_SLOT',
      `Appointments must start on a ${env.SLOT_INTERVAL_MINUTES}-minute slot boundary`,
    );
  }

  // The insert is the concurrency arbiter: the DB exclusion constraint decides
  // who wins a contested slot, regardless of what availability showed earlier.
  const MAX_REFERENCE_RETRIES = 3;
  const MAX_DEADLOCK_RETRIES = 5;
  let referenceAttempts = 0;
  let deadlockAttempts = 0;
  for (;;) {
    try {
      const appointment = await prisma.appointment.create({
        data: {
          branchId: branch.id,
          serviceId: service.id,
          reference: generateReference(),
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone ?? null,
          startsAt,
          endsAt,
        },
      });

      // Simulated confirmation. Failures are logged, never surfaced: the
      // booking already exists, and a real provider would retry via an outbox.
      try {
        await notifier.sendBookingConfirmation({
          reference: appointment.reference,
          customerName: appointment.customerName,
          customerEmail: appointment.customerEmail,
          branchName: branch.name,
          serviceName: service.name,
          startsAt: appointment.startsAt,
        });
      } catch (notifyError) {
        console.error('Failed to send booking confirmation', notifyError);
      }

      return appointment;
    } catch (error) {
      if (isOverlapViolation(error)) {
        throw new ConflictError(
          'SLOT_TAKEN',
          'This slot has just been booked by someone else — pick another slot',
        );
      }
      if (isDeadlock(error) && deadlockAttempts < MAX_DEADLOCK_RETRIES) {
        deadlockAttempts++;
        continue; // lost a concurrent race as the deadlock victim; retry resolves cleanly
      }
      if (isReferenceCollision(error) && referenceAttempts < MAX_REFERENCE_RETRIES) {
        referenceAttempts++;
        continue; // astronomically rare; retry with a fresh reference
      }
      throw error;
    }
  }
}

type CancellableAppointment = {
  id: string;
  status: 'CONFIRMED' | 'CANCELLED';
  startsAt: Date;
  reference: string;
  customerName: string;
  customerEmail: string;
  branch: { name: string };
  service: { name: string };
};

/**
 * Shared cancellation core: state-machine rules + atomic transition. The
 * updateMany is guarded on status so two concurrent cancels can't both
 * "succeed" — the loser sees count 0.
 */
async function cancelFetchedAppointment(
  prisma: PrismaClient,
  appointment: CancellableAppointment,
  notifier: Notifier,
) {
  if (appointment.status === 'CANCELLED') {
    throw new ConflictError('ALREADY_CANCELLED', 'This appointment is already cancelled');
  }
  if (appointment.startsAt <= new Date()) {
    throw new UnprocessableError(
      'TOO_LATE_TO_CANCEL',
      'Past or in-progress appointments cannot be cancelled',
    );
  }

  const { count } = await prisma.appointment.updateMany({
    where: { id: appointment.id, status: 'CONFIRMED' },
    data: { status: 'CANCELLED' },
  });
  if (count === 0) {
    throw new ConflictError('ALREADY_CANCELLED', 'This appointment is already cancelled');
  }

  try {
    await notifier.sendBookingCancellation({
      reference: appointment.reference,
      customerName: appointment.customerName,
      customerEmail: appointment.customerEmail,
      branchName: appointment.branch.name,
      serviceName: appointment.service.name,
      startsAt: appointment.startsAt,
    });
  } catch (notifyError) {
    console.error('Failed to send cancellation notice', notifyError);
  }

  return { ...appointment, status: 'CANCELLED' as const };
}

export async function cancelAppointmentByReference(
  prisma: PrismaClient,
  reference: string,
  notifier: Notifier = consoleNotifier,
) {
  const appointment = await prisma.appointment.findUnique({
    where: { reference },
    include: { branch: { select: { name: true } }, service: { select: { name: true } } },
  });
  if (!appointment) {
    throw new NotFoundError('Appointment not found', 'APPOINTMENT_NOT_FOUND');
  }
  return cancelFetchedAppointment(prisma, appointment, notifier);
}

export async function getAppointmentByReference(prisma: PrismaClient, reference: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { reference },
    include: { branch: { select: { name: true, address: true, timezone: true } }, service: true },
  });
  if (!appointment) {
    throw new NotFoundError('Appointment not found', 'APPOINTMENT_NOT_FOUND');
  }
  return appointment;
}
