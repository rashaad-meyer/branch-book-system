import { randomBytes } from 'node:crypto';

// Unambiguous alphabet (no 0/O, 1/I/L) for human-friendly booking references.
// 10 chars over 31 symbols ≈ 49 bits of entropy — unguessable, since the
// reference alone authorizes viewing/cancelling a guest booking.
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const REFERENCE_LENGTH = 10;

export function generateReference(): string {
  const bytes = randomBytes(REFERENCE_LENGTH);
  let code = '';
  for (const byte of bytes) {
    code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  return code;
}
