import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { generateReference } from '../src/lib/reference.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** Next occurrence of `hour:minute` (branch-local SAST, UTC+2) at least one day out. */
function upcomingSlot(daysFromNow: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hour - 2, minute, 0, 0); // SAST is UTC+2, no DST
  return date;
}

async function main() {
  // Wipe in FK dependency order so the seed is re-runnable.
  await prisma.appointment.deleteMany();
  await prisma.user.deleteMany();
  await prisma.service.deleteMany();
  await prisma.branch.deleteMany();

  const capeTown = await prisma.branch.create({
    data: {
      name: 'Cape Town CBD',
      address: '1 Adderley Street, Cape Town, 8001',
      services: {
        create: [
          { name: 'Card Collection', durationMinutes: 15 },
          { name: 'Account Opening', durationMinutes: 30 },
          { name: 'Home Loan Consultation', durationMinutes: 60 },
        ],
      },
    },
    include: { services: true },
  });

  const stellenbosch = await prisma.branch.create({
    data: {
      name: 'Stellenbosch',
      address: '12 Bird Street, Stellenbosch, 7600',
      operatingHours: {
        mon: ['09:00', '16:00'],
        tue: ['09:00', '16:00'],
        wed: ['09:00', '16:00'],
        thu: ['09:00', '16:00'],
        fri: ['09:00', '16:00'],
      },
      services: {
        create: [
          { name: 'Card Collection', durationMinutes: 15 },
          { name: 'Account Opening', durationMinutes: 30 },
        ],
      },
    },
    include: { services: true },
  });

  const passwordHash = await bcrypt.hash('Password123!', 10);
  await prisma.user.createMany({
    data: [
      {
        email: 'staff.capetown@example.com',
        passwordHash,
        fullName: 'Thandi Nkosi',
        branchId: capeTown.id,
      },
      {
        email: 'staff.stellenbosch@example.com',
        passwordHash,
        fullName: 'Pieter van der Merwe',
        branchId: stellenbosch.id,
      },
    ],
  });

  const accountOpening = capeTown.services.find((s) => s.name === 'Account Opening');
  const cardCollection = capeTown.services.find((s) => s.name === 'Card Collection');
  if (!accountOpening || !cardCollection) {
    throw new Error('Seeded services not found');
  }

  await prisma.appointment.createMany({
    data: [
      {
        branchId: capeTown.id,
        serviceId: accountOpening.id,
        reference: generateReference(),
        customerName: 'Ayesha Adams',
        customerEmail: 'ayesha@example.com',
        customerPhone: '+27821234567',
        startsAt: upcomingSlot(1, 9, 0),
        endsAt: upcomingSlot(1, 9, 30),
      },
      {
        branchId: capeTown.id,
        serviceId: cardCollection.id,
        reference: generateReference(),
        customerName: 'Sipho Dlamini',
        customerEmail: 'sipho@example.com',
        startsAt: upcomingSlot(1, 10, 0),
        endsAt: upcomingSlot(1, 10, 15),
      },
      {
        branchId: capeTown.id,
        serviceId: accountOpening.id,
        reference: generateReference(),
        customerName: 'Lerato Mokoena',
        customerEmail: 'lerato@example.com',
        startsAt: upcomingSlot(2, 11, 0),
        endsAt: upcomingSlot(2, 11, 30),
        status: 'CANCELLED',
      },
    ],
  });

  const counts = {
    branches: await prisma.branch.count(),
    services: await prisma.service.count(),
    users: await prisma.user.count(),
    appointments: await prisma.appointment.count(),
  };
  console.log('Seeded:', counts);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
