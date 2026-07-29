import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { zonedWallTimeToUtc } from '../lib/availability.js';
import { prisma } from '../lib/prisma.js';

const app = createApp();

const TZ = 'Africa/Johannesburg';
const PASSWORD = 'Staff-Pass-123!';
const ALL_WEEK: Record<string, [string, string]> = {
  mon: ['08:00', '17:00'],
  tue: ['08:00', '17:00'],
  wed: ['08:00', '17:00'],
  thu: ['08:00', '17:00'],
  fri: ['08:00', '17:00'],
  sat: ['08:00', '17:00'],
  sun: ['08:00', '17:00'],
};

let branchAId: string;
let branchBId: string;
let serviceAId: string;
let serviceBId: string;
let tokenA: string;

interface ScheduleBody {
  branch: { id: string; name: string };
  date: string;
  appointments: Array<{ id: string; status: string; service: { name: string } }>;
}
interface ErrorBody {
  error: { code: string };
}
const asSchedule = (body: unknown) => body as ScheduleBody;
const asError = (body: unknown) => body as ErrorBody;

/** Date string and UTC instants for `dayOffset` days from now at `time` local. */
function dayString(dayOffset: number): string {
  return new Date(Date.now() + dayOffset * 86_400_000).toISOString().slice(0, 10);
}
function instantAt(dayOffset: number, time: string): Date {
  return zonedWallTimeToUtc(dayString(dayOffset), time, TZ);
}

async function createBranchWithStaff(name: string, email: string) {
  const branch = await prisma.branch.create({
    data: {
      name,
      timezone: TZ,
      operatingHours: ALL_WEEK,
      services: { create: [{ name: `${name} Service`, durationMinutes: 30 }] },
      branchStaffUsers: {
        create: [
          { email, passwordHash: await bcrypt.hash(PASSWORD, 10), fullName: `${name} Staff` },
        ],
      },
    },
    include: { services: true },
  });
  return branch;
}

async function loginAs(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return (res.body as { token: string }).token;
}

function makeAppointment(branchId: string, serviceId: string, startsAt: Date, reference: string) {
  return prisma.appointment.create({
    data: {
      branchId,
      serviceId,
      reference,
      customerName: 'Schedule Customer',
      customerEmail: 'schedule@example.com',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
    },
  });
}

beforeAll(async () => {
  const branchA = await createBranchWithStaff('Staff Test A', 'staff.test.a@example.com');
  const branchB = await createBranchWithStaff('Staff Test B', 'staff.test.b@example.com');
  branchAId = branchA.id;
  branchBId = branchB.id;
  serviceAId = branchA.services[0]!.id;
  serviceBId = branchB.services[0]!.id;
  tokenA = await loginAs('staff.test.a@example.com');
});

afterAll(async () => {
  const branchIds = [branchAId, branchBId];
  await prisma.appointment.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.user.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.service.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
  await prisma.$disconnect();
});

describe('GET /api/v1/staff/schedule', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get(`/api/v1/staff/schedule?date=${dayString(3)}`);
    expect(res.status).toBe(401);
  });

  it("returns only the staff member's own branch for the requested day, all statuses", async () => {
    await makeAppointment(branchAId, serviceAId, instantAt(3, '09:00'), 'SCHEDA23456');
    const cancelled = await makeAppointment(
      branchAId,
      serviceAId,
      instantAt(3, '10:00'),
      'SCHEDB23456',
    );
    await prisma.appointment.update({
      where: { id: cancelled.id },
      data: { status: 'CANCELLED' },
    });
    // Other branch, same day — must not appear.
    await makeAppointment(branchBId, serviceBId, instantAt(3, '09:00'), 'SCHEDC23456');
    // Own branch, different day — must not appear.
    await makeAppointment(branchAId, serviceAId, instantAt(4, '09:00'), 'SCHEDD23456');

    const res = await request(app)
      .get(`/api/v1/staff/schedule?date=${dayString(3)}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const body = asSchedule(res.body);
    expect(body.branch.id).toBe(branchAId);
    expect(body.appointments).toHaveLength(2);
    expect(body.appointments.map((a) => a.status).sort()).toEqual(['CANCELLED', 'CONFIRMED']);
  });
});

describe('POST /api/v1/staff/appointments/:id/cancel', () => {
  it('cancels an appointment at the staff member’s branch', async () => {
    const appt = await makeAppointment(branchAId, serviceAId, instantAt(5, '09:00'), 'SCHEDE23456');
    const res = await request(app)
      .post(`/api/v1/staff/appointments/${appt.id}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    const updated = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(updated.status).toBe('CANCELLED');
  });

  it("returns 404 for another branch's appointment", async () => {
    const foreign = await makeAppointment(
      branchBId,
      serviceBId,
      instantAt(5, '10:00'),
      'SCHEDF23456',
    );
    const res = await request(app)
      .post(`/api/v1/staff/appointments/${foreign.id}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
    expect(asError(res.body).error.code).toBe('APPOINTMENT_NOT_FOUND');
  });

  it('rejects without a token', async () => {
    const appt = await makeAppointment(branchAId, serviceAId, instantAt(5, '11:00'), 'SCHEDG23456');
    const res = await request(app).post(`/api/v1/staff/appointments/${appt.id}/cancel`);
    expect(res.status).toBe(401);
  });
});
