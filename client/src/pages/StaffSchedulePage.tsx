import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import {
  Alert,
  Spinner,
  StatusBadge,
  errorMessage,
  inputClass,
  secondaryButtonClass,
} from '../components/ui';
import { useAuthToken, useSchedule, useStaffCancel } from '../hooks/queries';
import { dateInputValue, formatTime } from '../lib/format';

export function StaffSchedulePage() {
  const token = useAuthToken();
  const [date, setDate] = useState(dateInputValue(0));
  const schedule = useSchedule(date, Boolean(token));
  const cancel = useStaffCancel();

  // Also triggers when the api wrapper clears an expired token on 401.
  if (!token) return <Navigate to="/staff/login" replace />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {schedule.data ? `${schedule.data.branch.name} — schedule` : 'Branch schedule'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            All appointments for the selected day, including cancellations.
          </p>
        </div>
        <div>
          <label htmlFor="schedule-date" className="sr-only">
            Date
          </label>
          <input
            id="schedule-date"
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-6">
        {schedule.isPending && <Spinner label="Loading schedule…" />}
        {schedule.isError && <Alert tone="error">{errorMessage(schedule.error)}</Alert>}
        {cancel.isError && (
          <div className="mb-4">
            <Alert tone="error">{errorMessage(cancel.error)}</Alert>
          </div>
        )}

        {schedule.isSuccess &&
          (schedule.data.appointments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              No appointments on this day.
            </div>
          ) : (
            <ul className="space-y-2">
              {schedule.data.appointments.map((appointment) => {
                const tz = schedule.data.branch.timezone;
                const upcoming = new Date(appointment.startsAt).getTime() > Date.now();
                const cancellable = appointment.status === 'CONFIRMED' && upcoming;
                return (
                  <li
                    key={appointment.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="w-24 font-mono text-sm font-semibold text-slate-900">
                      {formatTime(appointment.startsAt, tz)}–{formatTime(appointment.endsAt, tz)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {appointment.customerName}
                        <span className="ml-2 font-normal text-slate-500">
                          {appointment.service.name}
                        </span>
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {appointment.customerEmail}
                        {appointment.customerPhone ? ` · ${appointment.customerPhone}` : ''}
                        {' · '}
                        <span className="font-mono">{appointment.reference}</span>
                      </p>
                    </div>
                    <StatusBadge status={appointment.status} />
                    {cancellable && (
                      <button
                        type="button"
                        className={`${secondaryButtonClass} px-3 py-1 text-red-700 hover:bg-red-50`}
                        disabled={cancel.isPending}
                        onClick={() => {
                          if (window.confirm(`Cancel ${appointment.customerName}'s appointment?`)) {
                            cancel.mutate(appointment.id);
                          }
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </div>
  );
}
