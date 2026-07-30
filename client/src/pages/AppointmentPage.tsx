import { useLocation, useParams } from 'react-router-dom';

import { Alert, Spinner, StatusBadge, errorMessage, secondaryButtonClass } from '../components/ui';
import { useAppointment, useCancelAppointment } from '../hooks/queries';
import { formatDate, formatTime } from '../lib/format';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

export function AppointmentPage() {
  const { reference = '' } = useParams();
  const location = useLocation();
  const justBooked = Boolean((location.state as { justBooked?: boolean } | null)?.justBooked);

  const query = useAppointment(reference);
  const cancel = useCancelAppointment(reference);

  if (query.isPending) return <Spinner label="Loading booking…" />;
  if (query.isError) return <Alert tone="error">{errorMessage(query.error)}</Alert>;

  const appointment = query.data;
  const tz = appointment.branch?.timezone;
  const upcoming = new Date(appointment.startsAt).getTime() > Date.now();
  const cancellable = appointment.status === 'CONFIRMED' && upcoming;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {justBooked && (
        <Alert tone="success">
          Appointment confirmed! A confirmation has been sent (simulated) to{' '}
          <strong>{appointment.customerEmail}</strong>. Keep your reference safe — it's how you view
          or cancel this booking.
        </Alert>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">Booking reference</p>
            <p className="font-mono text-2xl font-bold tracking-wider text-slate-900">
              {appointment.reference}
            </p>
          </div>
          <StatusBadge status={appointment.status} />
        </div>

        <dl className="mt-4 divide-y divide-slate-100">
          <DetailRow label="Service" value={appointment.service?.name ?? '—'} />
          <DetailRow label="Branch" value={appointment.branch?.name ?? '—'} />
          {appointment.branch?.address && (
            <DetailRow label="Address" value={appointment.branch.address} />
          )}
          <DetailRow label="Date" value={formatDate(appointment.startsAt, tz)} />
          <DetailRow
            label="Time"
            value={`${formatTime(appointment.startsAt, tz)} – ${formatTime(appointment.endsAt, tz)}`}
          />
          <DetailRow label="Name" value={appointment.customerName} />
          <DetailRow label="Email" value={appointment.customerEmail} />
        </dl>

        {cancel.isError && (
          <div className="mt-4">
            <Alert tone="error">{errorMessage(cancel.error)}</Alert>
          </div>
        )}

        {cancellable && (
          <button
            type="button"
            className={`${secondaryButtonClass} mt-5 w-full text-red-700 hover:bg-red-50`}
            disabled={cancel.isPending}
            onClick={() => {
              if (window.confirm('Cancel this appointment? The slot will be released.')) {
                cancel.mutate();
              }
            }}
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel appointment'}
          </button>
        )}

        {appointment.status === 'CANCELLED' && (
          <p className="mt-4 text-center text-sm text-slate-500">
            This appointment was cancelled. You can book a new one any time.
          </p>
        )}
      </div>
    </div>
  );
}
