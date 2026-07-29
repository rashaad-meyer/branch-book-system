import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { zonedWallTimeToUtc } from '../lib/availability.js';
import { prisma } from '../lib/prisma.js';

/**
 * Integration tests against the real Postgres from docker-compose — the
 * exclusion constraint is the system under test, so it can't be mocked.
 */
const app = createApp();

const TZ = 'Africa/Johannesburg';
let branchId: string;
let serviceId: string;

// supertest types `res.body` as `any`; assert through these shapes instead.
interface AppointmentBody {
  reference: string;
  status: string;
  startsAt: string;
  endsAt: string;
  branch: { name: string };
  service: { name: string };
}
interface ErrorBody {
  error: { code: string; message: string };
}
const asAppointment = (body: unknown) => body as AppointmentBody;
const asError = (body: unknown) => body as ErrorBody;

/** UTC instant for `HH:mm` branch-local time, `dayOffset` days from now. */
function slotAt(dayOffset: number, time: string): string {
  const date = new Date(Date.now() + dayOffset * 86_400_000).toISOString().slice(0, 10);
  return zonedWallTimeToUtc(date, time, TZ).toISOString();
}

function bookingBody(startsAt: string, overrides: Record<string, unknown> = {}) {
  return {
    branchId,
    serviceId,
    customerName: 'Test Customer',
    customerEmail: 'test.customer@example.com',
    startsAt,
    ...overrides,
  };
}

beforeAll(async () => {
  const branch = await prisma.branch.create({
    data: {
      name: 'Integration Test Branch',
      timezone: TZ,
      operatingHours: {
        mon: ['08:00', '17:00'],
        tue: ['08:00', '17:00'],
        wed: ['08:00', '17:00'],
        thu: ['08:00', '17:00'],
        fri: ['08:00', '17:00'],
        sat: ['08:00', '17:00'],
        sun: ['08:00', '17:00'],
      },
      services: { create: [{ name: 'Test Service', durationMinutes: 30 }] },
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

describe('POST /api/v1/appointments', () => {
  it('books a valid slot and returns the confirmed appointment', async () => {
    const startsAt = slotAt(7, '09:00');
    const res = await request(app).post('/api/v1/appointments').send(bookingBody(startsAt));

    expect(res.status).toBe(201);
    const body = asAppointment(res.body);
    expect(body.reference).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(body.status).toBe('CONFIRMED');
    expect(body.startsAt).toBe(startsAt);
    // endsAt is derived server-side from the 30-minute service duration.
    expect(new Date(body.endsAt).getTime()).toBe(new Date(startsAt).getTime() + 30 * 60_000);
  });

  it('rejects a second booking for the same slot with 409', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .send(bookingBody(slotAt(7, '09:00'), { customerEmail: 'other@example.com' }));

    expect(res.status).toBe(409);
    expect(asError(res.body).error.code).toBe('SLOT_TAKEN');
  });

  it('gives exactly one winner when two requests race for the same slot', async () => {
    const startsAt = slotAt(7, '11:00');
    const [a, b] = await Promise.all([
      request(app).post('/api/v1/appointments').send(bookingBody(startsAt)),
      request(app)
        .post('/api/v1/appointments')
        .send(bookingBody(startsAt, { customerEmail: 'rival@example.com' })),
    ]);

    // The DB exclusion constraint arbitrates: one 201, one 409, either order.
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('allows booking the slot immediately after an existing one (half-open ranges)', async () => {
    await request(app)
      .post('/api/v1/appointments')
      .send(bookingBody(slotAt(8, '10:00')));
    // 10:00–10:30 is booked; 10:30–11:00 shares only the boundary instant.
    const adjacent = await request(app)
      .post('/api/v1/appointments')
      .send(bookingBody(slotAt(8, '10:30')));
    expect(adjacent.status).toBe(201);
  });

  it('rejects a slot outside operating hours with 422', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .send(bookingBody(slotAt(7, '18:00')));
    expect(res.status).toBe(422);
    expect(asError(res.body).error.code).toBe('OUTSIDE_OPERATING_HOURS');
  });

  it('rejects a start time off the slot grid with 422', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .send(bookingBody(slotAt(7, '12:10')));
    expect(res.status).toBe(422);
    expect(asError(res.body).error.code).toBe('INVALID_SLOT');
  });

  it('rejects an unknown service with 404', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .send(bookingBody(slotAt(7, '13:00'), { serviceId: '00000000-0000-7000-8000-000000000000' }));
    expect(res.status).toBe(404);
    expect(asError(res.body).error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('rejects an invalid body with 400', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .send(bookingBody(slotAt(7, '14:00'), { customerName: '' }));
    expect(res.status).toBe(400);
    expect(asError(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/appointments/:reference', () => {
  it('returns a booking by its reference', async () => {
    const created = await request(app)
      .post('/api/v1/appointments')
      .send(bookingBody(slotAt(9, '09:00')));
    expect(created.status).toBe(201);
    const reference = asAppointment(created.body).reference;

    const res = await request(app).get(`/api/v1/appointments/${reference}`);
    expect(res.status).toBe(200);
    const body = asAppointment(res.body);
    expect(body.reference).toBe(reference);
    expect(body.branch.name).toBe('Integration Test Branch');
    expect(body.service.name).toBe('Test Service');
  });

  it('returns 404 for an unknown reference', async () => {
    const res = await request(app).get('/api/v1/appointments/ABCDEFGHJK');
    expect(res.status).toBe(404);
  });
});
