import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';

// Compared against when the email doesn't exist, so both branches cost one
// bcrypt comparison — avoids leaking account existence via response timing.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

const INVALID_CREDENTIALS = () =>
  new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');

export interface LoginResult {
  token: string;
  user: { id: string; email: string; fullName: string };
}

export async function login(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    throw INVALID_CREDENTIALS();
  }

  const token = jwt.sign({}, env.JWT_SECRET, { subject: user.id, expiresIn: '1h' });

  return {
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName },
  };
}

export async function getUser(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true },
  });
  if (!user) throw new UnauthorizedError('Account no longer exists', 'INVALID_TOKEN');
  return user;
}
