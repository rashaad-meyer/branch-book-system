import { describe, expect, it } from 'vitest';

import { findAvailableSlots, timeSlots, zonedWallTimeToUtc } from './availability.js';

const utc = (time: string) => new Date(`2026-08-03T${time}:00.000Z`);

describe('zonedWallTimeToUtc', () => {
  it('converts SAST wall time to the UTC instant two hours earlier', () => {
    const result = zonedWallTimeToUtc('2026-08-03', '08:00', 'Africa/Johannesburg');
    expect(result.toISOString()).toBe('2026-08-03T06:00:00.000Z');
  });

  it('respects DST in zones that observe it', () => {
    // London is UTC+1 in August (BST) and UTC+0 in January (GMT).
    expect(zonedWallTimeToUtc('2026-08-03', '08:00', 'Europe/London').toISOString()).toBe(
      '2026-08-03T07:00:00.000Z',
    );
    expect(zonedWallTimeToUtc('2026-01-05', '08:00', 'Europe/London').toISOString()).toBe(
      '2026-01-05T08:00:00.000Z',
    );
  });
});

describe('timeSlots', () => {
  it('steps from open up to but not including close', () => {
    const slots = timeSlots(utc('08:00'), utc('10:00'), 30);
    expect(slots.map((s) => s.toISOString())).toEqual([
      '2026-08-03T08:00:00.000Z',
      '2026-08-03T08:30:00.000Z',
      '2026-08-03T09:00:00.000Z',
      '2026-08-03T09:30:00.000Z',
    ]);
  });

  it('returns no slots when open equals close', () => {
    expect(timeSlots(utc('08:00'), utc('08:00'), 30)).toEqual([]);
  });
});

describe('findAvailableSlots', () => {
  const candidates = timeSlots(utc('08:00'), utc('10:00'), 30);

  it('returns every slot that fits when there are no appointments', () => {
    const slots = findAvailableSlots(candidates, [], 30, utc('10:00'));
    expect(slots).toHaveLength(4);
  });

  it('drops slots whose duration would run past closing time', () => {
    const slots = findAvailableSlots(candidates, [], 60, utc('10:00'));
    // 09:30 + 60min = 10:30 > close; 09:00 + 60min = 10:00 exactly fits.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-08-03T08:00:00.000Z',
      '2026-08-03T08:30:00.000Z',
      '2026-08-03T09:00:00.000Z',
    ]);
  });

  it('removes slots overlapping an existing appointment', () => {
    const appointments = [{ startsAt: utc('08:30'), endsAt: utc('09:00') }];
    const slots = findAvailableSlots(candidates, appointments, 30, utc('10:00'));
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-08-03T08:00:00.000Z',
      '2026-08-03T09:00:00.000Z',
      '2026-08-03T09:30:00.000Z',
    ]);
  });

  it('keeps slots exactly adjacent to an appointment (half-open ranges)', () => {
    const appointments = [{ startsAt: utc('08:30'), endsAt: utc('09:00') }];
    const slots = findAvailableSlots(candidates, appointments, 30, utc('10:00'));
    const starts = slots.map((s) => s.startsAt.toISOString());
    // Slot ending 08:30 (touches start) and slot starting 09:00 (touches end) both survive.
    expect(starts).toContain('2026-08-03T08:00:00.000Z');
    expect(starts).toContain('2026-08-03T09:00:00.000Z');
  });

  it('removes a long slot that straddles a short appointment', () => {
    const appointments = [{ startsAt: utc('08:30'), endsAt: utc('08:45') }];
    const slots = findAvailableSlots(candidates, appointments, 60, utc('10:00'));
    // 08:00–09:00 overlaps 08:30–08:45; only 09:00–10:00 fits cleanly.
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual(['2026-08-03T09:00:00.000Z']);
  });

  it('excludes slots starting before notBefore', () => {
    const slots = findAvailableSlots(candidates, [], 30, utc('10:00'), utc('08:45'));
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-08-03T09:00:00.000Z',
      '2026-08-03T09:30:00.000Z',
    ]);
  });

  it('keeps a slot starting exactly at notBefore', () => {
    const slots = findAvailableSlots(candidates, [], 30, utc('10:00'), utc('09:00'));
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-08-03T09:00:00.000Z');
  });
});
