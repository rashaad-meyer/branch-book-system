import { fromZonedTime } from 'date-fns-tz';

/**
 * Convert a wall-clock time in an IANA timezone to its UTC instant,
 * e.g. ("2026-07-28", "08:00", "Africa/Johannesburg") → 2026-07-28T06:00:00Z.
 */
export function zonedWallTimeToUtc(isoDate: string, time: string, timeZone: string): Date {
  return fromZonedTime(`${isoDate}T${time}:00`, timeZone);
}

/** Candidate slot start times, stepped every `stepMinutes` from `start` up to (not including) `end`. */
export function timeSlots(start: Date, end: Date, stepMinutes: number): Date[] {
  const slots: Date[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    slots.push(new Date(cursor));
    cursor.setMinutes(cursor.getMinutes() + stepMinutes);
  }
  return slots;
}

type ExistingAppointment = { startsAt: Date; endsAt: Date };

/**
 * Keeps only slots that start at/after `notBefore` (when given), fit before
 * closing time, and don't overlap an existing appointment.
 */
export function findAvailableSlots(
  candidateStarts: Date[],
  appointments: ExistingAppointment[],
  durationMinutes: number,
  closesAt: Date,
  notBefore?: Date,
): Array<{ startsAt: Date; endsAt: Date }> {
  const durationMs = durationMinutes * 60_000;

  return candidateStarts
    .filter((startsAt) => !notBefore || startsAt >= notBefore)
    .map((startsAt) => ({ startsAt, endsAt: new Date(startsAt.getTime() + durationMs) }))
    .filter(({ endsAt }) => endsAt <= closesAt)
    .filter(
      ({ startsAt, endsAt }) =>
        !appointments.some(
          (appointment) => appointment.startsAt < endsAt && appointment.endsAt > startsAt,
        ),
    );
}
