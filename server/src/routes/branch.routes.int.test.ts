import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { zonedWallTimeToUtc } from '../lib/availability.js';
import { prisma } from '../lib/prisma.js';

const app = createApp();

const TZ = 'Africa/Johannesburg';
// Closed on Sundays so the closed-day contract is testable.
const WEEKDAYS_ONLY = {
  mon: ['08:00', '17:00'],
  tue: ['08:00', '17:00'],
  wed: ['08:00', '17:00'],
  thu: ['08:00', '17:00'],
  fri: ['08:00', '17:00'],
  sat: ['08:00', '17:00'],
};

let branchId: string;
let serviceId: string;

interface Slot {
  startsAt: string;
  endsAt: string;
}
interface ErrorBody {
  error: { code: string };
}
const asSlots = (body: unknown) => body as Slot[];
const asError = (body: unknown) => body as ErrorBody;

/** Next date (1–14 days out) whose UTC weekday matches; open=true avoids Sunday. */
function nextDate(open: boolean): string {
  for (let offset = 2; offset <= 14; offset++) {
    const d = new Date(Date.now() + offset * 86_400_000);
    const isSunday = d.getUTCDay() === 0;
    if (open !== isSunday) return d.toISOString().slice(0, 10);
  }
  throw new Error('unreachable');
}

function availabilityUrl(date: string, service = serviceId, branch = branchId): string {
  return `/api/v1/branches/${branch}/availability?serviceId=${service}&date=${date}`;
}

beforeAll(async () => {
  const branch = await prisma.branch.create({
    data: {
      name: 'Availability Test Branch',
      timezone: TZ,
      operatingHours: WEEKDAYS_ONLY,
      services: { create: [{ name: 'Availability Service', durationMinutes: 30 }] },
    },
    include: { services: true },
  });
  branchId = branch.id;
  serviceId = branch.services[0]!.id;
});

afterAll(async () => {
  await prisma.appointment.deleteMany({ where: { branchId } });
  await prisma.service.deleteMany({ where: { branchId } });
  await prisma.branch.delete({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe('GET /api/v1/branches', () => {
  it('lists branches including the test branch', async () => {
    const res = await request(app).get('/api/v1/branches');
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((b) => b.id);
    expect(ids).toContain(branchId);
  });
});

describe('GET /api/v1/branches/:id/availability', () => {
  it('returns the full slot grid in UTC, opening at 08:00 branch time', async () => {
    const date = nextDate(true);
    const res = await request(app).get(availabilityUrl(date));

    expect(res.status).toBe(200);
    const slots = asSlots(res.body);
    // 08:00–17:00 SAST on a 30-min grid = 18 slots for a 30-min service.
    expect(slots).toHaveLength(18);
    expect(slots[0]!.startsAt).toBe(zonedWallTimeToUtc(date, '08:00', TZ).toISOString());
    expect(slots.at(-1)!.startsAt).toBe(zonedWallTimeToUtc(date, '16:30', TZ).toISOString());
  });

  it('excludes booked slots and restores them after cancellation', async () => {
    const date = nextDate(true);
    const startsAt = zonedWallTimeToUtc(date, '09:00', TZ);
    const appointment = await prisma.appointment.create({
      data: {
        branchId,
        serviceId,
        reference: 'AVAILR2345',
        customerName: 'Blocking Customer',
        customerEmail: 'block@example.com',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      },
    });

    const booked = asSlots((await request(app).get(availabilityUrl(date))).body);
    expect(booked).toHaveLength(17);
    expect(booked.map((s) => s.startsAt)).not.toContain(startsAt.toISOString());

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CANCELLED' },
    });
    const after = asSlots((await request(app).get(availabilityUrl(date))).body);
    expect(after.map((s) => s.startsAt)).toContain(startsAt.toISOString());
  });

  it('returns an empty list on a closed day', async () => {
    const res = await request(app).get(availabilityUrl(nextDate(false)));
    expect(res.status).toBe(200);
    expect(asSlots(res.body)).toHaveLength(0);
  });

  it('returns 404 for an unknown service even on a closed day', async () => {
    const res = await request(app).get(
      availabilityUrl(nextDate(false), '00000000-0000-7000-8000-000000000000'),
    );
    expect(res.status).toBe(404);
    expect(asError(res.body).error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('returns 404 for an unknown branch', async () => {
    const res = await request(app).get(
      availabilityUrl(nextDate(true), serviceId, '00000000-0000-7000-8000-000000000000'),
    );
    expect(res.status).toBe(404);
    expect(asError(res.body).error.code).toBe('BRANCH_NOT_FOUND');
  });

  it('rejects a past date with 400', async () => {
    const res = await request(app).get(availabilityUrl('2020-01-01'));
    expect(res.status).toBe(400);
    expect(asError(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});
