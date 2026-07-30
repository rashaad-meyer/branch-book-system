import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

const app = createApp();

const EMAIL = 'auth.test@example.com';
const PASSWORD = 'Auth-Pass-123!';
let branchId: string;

interface LoginBody {
  token: string;
  user: { id: string; email: string };
}
interface ErrorBody {
  error: { code: string };
}
const asLogin = (body: unknown) => body as LoginBody;
const asError = (body: unknown) => body as ErrorBody;

beforeAll(async () => {
  const branch = await prisma.branch.create({
    data: {
      name: 'Auth Test Branch',
      branchStaffUsers: {
        create: [
          {
            email: EMAIL,
            passwordHash: await bcrypt.hash(PASSWORD, 10),
            fullName: 'Auth Tester',
          },
        ],
      },
    },
  });
  branchId = branch.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { branchId } });
  await prisma.branch.delete({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(asLogin(res.body).token).toBeTruthy();
    expect(asLogin(res.body).user.email).toBe(EMAIL);
  });

  it('rejects a wrong password with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(asError(res.body).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the same 401 (no account-existence leak)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(asError(res.body).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rate limits repeated attempts with 429', async () => {
    const limited = createApp({ loginRateLimitMax: 1 });
    await request(limited).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD });
    const res = await request(limited)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(429);
  });
});

describe('GET /api/v1/me', () => {
  it('returns the authenticated user', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    const token = asLogin(login.body).token;

    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body as { user: { email: string } }).user.email).toBe(EMAIL);
  });

  it('rejects a missing token with 401', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed token with 401', async () => {
    const res = await request(app).get('/api/v1/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(asError(res.body).error.code).toBe('INVALID_TOKEN');
  });
});
