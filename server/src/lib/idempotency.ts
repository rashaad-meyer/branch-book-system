import { createHash } from 'node:crypto';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { ConflictError, UnprocessableError } from './errors.js';

/**
 * At-most-once request handling keyed by a client-supplied `Idempotency-Key`.
 *
 * A first request "claims" the key by inserting an IN_PROGRESS row (the primary
 * key makes the claim atomic across app instances). The winner runs the
 * operation and stores its response; a retry with the same key replays that
 * stored response instead of running the operation again. This turns a lost
 * response (network timeout, double-submit) from a duplicate booking — or a
 * misleading `409 SLOT_TAKEN` when the client collides with its own earlier
 * write — into an exact replay of the original outcome.
 *
 * Concurrent requests sharing a key follow Stripe's semantics: the loser of the
 * claim gets `409 IDEMPOTENCY_IN_PROGRESS` and, once it retries, replays the
 * now-completed response. A key reused with different parameters is a client
 * error → `422 IDEMPOTENCY_KEY_REUSED`.
 */

const MAX_CLAIM_ATTEMPTS = 3;

export interface IdempotentResult<T> {
  status: number;
  /** For a freshly processed request this is the operation's value; for a
   *  replay it is the stored JSON. Both serialize identically via `res.json`. */
  body: T | Prisma.JsonValue;
  replayed: boolean;
}

/** SHA-256 over the canonical (key-sorted) request params. */
export function fingerprintRequest(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(params, Object.keys(params).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Runs `operation` under idempotency when `key` is provided; otherwise runs it
 * directly. `successStatus` is the HTTP status captured for a successful run.
 */
export async function runIdempotent<T>(
  prisma: PrismaClient,
  key: string | undefined,
  fingerprint: string,
  successStatus: number,
  operation: () => Promise<T>,
): Promise<IdempotentResult<T>> {
  if (!key) {
    return { status: successStatus, body: await operation(), replayed: false };
  }

  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    try {
      await prisma.idempotencyKey.create({ data: { key, requestHash: fingerprint } });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // Someone else holds this key. Inspect their record.
      const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
      if (!existing) continue; // owner failed and released it — retry the claim

      if (existing.requestHash !== fingerprint) {
        throw new UnprocessableError(
          'IDEMPOTENCY_KEY_REUSED',
          'This Idempotency-Key was already used with different request parameters',
        );
      }
      if (existing.status === 'COMPLETED') {
        return {
          status: existing.responseStatus ?? successStatus,
          body: existing.responseBody,
          replayed: true,
        };
      }
      throw new ConflictError(
        'IDEMPOTENCY_IN_PROGRESS',
        'A request with this Idempotency-Key is already being processed',
      );
    }

    // Claim won — we own the key.
    try {
      const value = await operation();
      // Round-trip through JSON so Dates become ISO strings — exactly what
      // `res.json` would emit — and the result is a storable JsonValue.
      const serialized: unknown = JSON.parse(JSON.stringify(value));
      const responseBody = serialized as Prisma.InputJsonValue;
      await prisma.idempotencyKey.update({
        where: { key },
        data: { status: 'COMPLETED', responseStatus: successStatus, responseBody },
      });
      return { status: successStatus, body: value, replayed: false };
    } catch (error) {
      // Release the claim so the key can be retried; never mask the real error.
      await prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
      throw error;
    }
  }

  throw new ConflictError(
    'IDEMPOTENCY_IN_PROGRESS',
    'A request with this Idempotency-Key is already being processed',
  );
}
