import type { ReactNode } from 'react';

import { ApiError } from '../lib/api';
import type { AppointmentStatus } from '../lib/types';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-slate-500" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      {label}
    </div>
  );
}

export function Alert({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-green-200 bg-green-50 text-green-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  }[tone];
  return (
    <div
      className={`rounded-md border px-4 py-3 text-sm ${styles}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return 'Could not reach the server — check your connection';
  return 'Something went wrong';
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const styles =
    status === 'CONFIRMED'
      ? 'bg-green-100 text-green-800'
      : 'bg-slate-200 text-slate-600 line-through';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50';

export const primaryButtonClass =
  'inline-flex items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold ' +
  'text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButtonClass =
  'inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 ' +
  'text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 ' +
  'focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50';
