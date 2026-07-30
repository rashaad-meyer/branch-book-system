/** "08:30" in the given IANA timezone (falls back to the viewer's zone). */
export function formatTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

/** "Mon, 3 Aug 2026" in the given timezone. */
export function formatDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}

/** YYYY-MM-DD for date inputs, offset in days from today. */
export function dateInputValue(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
