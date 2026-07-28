import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/errors.js';

/** Maps thrown errors to the `{ error: { code, message, details? } }` envelope. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.issues },
    });
    return;
  }

  req.log?.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};
