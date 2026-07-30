import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Alert,
  Field,
  Spinner,
  errorMessage,
  inputClass,
  primaryButtonClass,
} from '../components/ui';
import { useAvailability, useBookAppointment, useBranches } from '../hooks/queries';
import { ApiError } from '../lib/api';
import { dateInputValue, formatTime } from '../lib/format';
import type { Slot } from '../lib/types';

const BOOKING_HORIZON_DAYS = 90;

export function BookPage() {
  const navigate = useNavigate();
  const branchesQuery = useBranches();

  const [branchId, setBranchId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(dateInputValue(1));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const branches = branchesQuery.data ?? [];
  const branch = branches.find((b) => b.id === branchId);
  const services = branch?.services ?? [];

  const availabilityQuery = useAvailability(branchId, serviceId, date);
  const booking = useBookAppointment();

  // Stable per payload: retrying the identical submission replays the original
  // booking server-side; any change produces a fresh key (the server rejects
  // key reuse with a different payload).
  const idempotencyKey = useMemo(
    () => crypto.randomUUID(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [branchId, serviceId, slot?.startsAt, customerName, customerEmail, customerPhone],
  );

  const canSubmit =
    Boolean(branch && serviceId && slot && customerName.trim() && customerEmail.trim()) &&
    !booking.isPending;

  function selectBranch(id: string) {
    setBranchId(id);
    setServiceId('');
    setSlot(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!slot || !canSubmit) return;
    booking.mutate(
      {
        input: {
          branchId,
          serviceId,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
          startsAt: slot.startsAt,
        },
        idempotencyKey,
      },
      {
        onSuccess: (appointment) => {
          void navigate(`/appointments/${appointment.reference}`, { state: { justBooked: true } });
        },
        onError: (error) => {
          // Someone beat us to the slot: clear the selection; the availability
          // list refreshes automatically (onSettled invalidation).
          if (error instanceof ApiError && error.code === 'SLOT_TAKEN') setSlot(null);
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Book a branch appointment</h1>
      <p className="mt-1 text-sm text-slate-500">
        Choose a branch, service and time — no account needed. You'll receive a booking reference to
        manage your appointment.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            1. Where and what
          </h2>

          {branchesQuery.isPending && <Spinner label="Loading branches…" />}
          {branchesQuery.isError && <Alert tone="error">{errorMessage(branchesQuery.error)}</Alert>}

          {branchesQuery.isSuccess && (
            <>
              <Field label="Branch" htmlFor="branch">
                <select
                  id="branch"
                  className={inputClass}
                  value={branchId}
                  onChange={(e) => selectBranch(e.target.value)}
                >
                  <option value="">Select a branch…</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.address ? ` — ${b.address}` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Service" htmlFor="service">
                <select
                  id="service"
                  className={inputClass}
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                    setSlot(null);
                  }}
                  disabled={!branch}
                >
                  <option value="">{branch ? 'Select a service…' : 'Choose a branch first'}</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min)
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Date" htmlFor="date">
                <input
                  id="date"
                  type="date"
                  className={inputClass}
                  value={date}
                  min={dateInputValue(0)}
                  max={dateInputValue(BOOKING_HORIZON_DAYS)}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSlot(null);
                  }}
                />
              </Field>
            </>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            2. Pick a time{branch ? ` (${branch.name} local time)` : ''}
          </h2>

          {!branchId || !serviceId ? (
            <p className="text-sm text-slate-400">Choose a branch and service to see open slots.</p>
          ) : availabilityQuery.isPending ? (
            <Spinner label="Checking availability…" />
          ) : availabilityQuery.isError ? (
            <Alert tone="error">{errorMessage(availabilityQuery.error)}</Alert>
          ) : availabilityQuery.data.length === 0 ? (
            <Alert tone="info">No open slots on this day — try another date.</Alert>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {availabilityQuery.data.map((s) => {
                const selected = slot?.startsAt === s.startsAt;
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    onClick={() => setSlot(s)}
                    aria-pressed={selected}
                    className={`rounded-md border px-2 py-1.5 text-sm font-medium ${
                      selected
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                  >
                    {formatTime(s.startsAt, branch?.timezone)}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            3. Your details
          </h2>

          <Field label="Full name" htmlFor="name">
            <input
              id="name"
              className={inputClass}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoComplete="name"
              maxLength={100}
              required
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              className={inputClass}
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          <Field label="Phone (optional, e.g. +27821234567)" htmlFor="phone">
            <input
              id="phone"
              type="tel"
              className={inputClass}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              autoComplete="tel"
              pattern="\+[1-9]\d{7,14}"
            />
          </Field>

          {booking.isError && <Alert tone="error">{errorMessage(booking.error)}</Alert>}

          <button type="submit" className={`${primaryButtonClass} w-full`} disabled={!canSubmit}>
            {booking.isPending ? 'Booking…' : 'Book appointment'}
          </button>
        </section>
      </form>
    </div>
  );
}
