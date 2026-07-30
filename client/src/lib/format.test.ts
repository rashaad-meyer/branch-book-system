import { describe, expect, it } from 'vitest';

import { formatDate, formatTime } from './format';

describe('formatTime', () => {
  it('renders a UTC instant as branch-local wall time', () => {
    // 06:00 UTC = 08:00 in Johannesburg (UTC+2, no DST).
    expect(formatTime('2026-08-03T06:00:00.000Z', 'Africa/Johannesburg')).toBe('08:00');
  });

  it('respects DST in observing zones', () => {
    expect(formatTime('2026-08-03T07:00:00.000Z', 'Europe/London')).toBe('08:00');
    expect(formatTime('2026-01-05T08:00:00.000Z', 'Europe/London')).toBe('08:00');
  });
});

describe('formatDate', () => {
  it('renders the branch-local calendar day, not the UTC one', () => {
    // 23:00 UTC on the 3rd is already the 4th in Johannesburg.
    expect(formatDate('2026-08-03T23:00:00.000Z', 'Africa/Johannesburg')).toContain('4');
  });
});
