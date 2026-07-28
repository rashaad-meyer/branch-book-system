import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/** Verifies the Bearer JWT and attaches the user id to the request. */
export const requiredAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError();
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      throw new UnauthorizedError('Invalid token', 'INVALID_TOKEN');
    }
    req.userId = payload.sub;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token', 'INVALID_TOKEN');
  }
};

/** For handlers behind requireAuth — narrows the optional userId. */
export function authedUserId(userId: string | undefined): string {
  if (!userId) throw new UnauthorizedError();
  return userId;
}
