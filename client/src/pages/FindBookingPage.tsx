import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Field, inputClass, primaryButtonClass } from '../components/ui';

const REFERENCE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;

export function FindBookingPage() {
  const navigate = useNavigate();
  const [reference, setReference] = useState('');
  const normalized = reference.trim().toUpperCase();
  const valid = REFERENCE_PATTERN.test(normalized);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-slate-900">Find your booking</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter the 10-character reference from your confirmation.
      </p>

      <form
        className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void navigate(`/appointments/${normalized}`);
        }}
      >
        <Field label="Booking reference" htmlFor="reference">
          <input
            id="reference"
            className={`${inputClass} font-mono uppercase tracking-wider`}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. K7MPQ2XZW4"
            maxLength={10}
            required
          />
        </Field>
        <button type="submit" className={`${primaryButtonClass} w-full`} disabled={!valid}>
          Find booking
        </button>
      </form>
    </div>
  );
}
