import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

/** A day's open/close pair, e.g. ["08:00", "17:00"]. Missing weekday key = closed that day. */
const dayHoursSchema = z
  .tuple([timeOfDaySchema, timeOfDaySchema])
  .refine(([opens, closes]) => opens < closes, 'Opening time must be before closing time');

export const operatingHoursSchema = z.partialRecord(weekdaySchema, dayHoursSchema);

export const idParamSchema = z.object({
  id: z.uuid(),
});

export const createBranchSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1).optional(),
  timezone: z.string().min(1).default('Africa/Johannesburg'),
  operatingHours: operatingHoursSchema.optional(),
});

export const updateBranchSchema = createBranchSchema.partial();

const BOOKING_HORIZON_DAYS = 90;

export const branchAvailabilityQuerySchema = z.object({
  serviceId: z.uuid(),
  // Bounded to [today, +90d]. "Today" is UTC-based: branch-local today is
  // never behind UTC today for the zones we serve (UTC+2), and past slots
  // are filtered out of the results separately.
  date: z.iso.date().refine(
    (date) => {
      const today = new Date();
      const min = today.toISOString().slice(0, 10);
      const max = new Date(today.getTime() + BOOKING_HORIZON_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return date >= min && date <= max;
    },
    { message: `date must be between today and ${BOOKING_HORIZON_DAYS} days from now` },
  ),
});

export type BranchAvailabilityQuerySchema = z.infer<typeof branchAvailabilityQuerySchema>;
