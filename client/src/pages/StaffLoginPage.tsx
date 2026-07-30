import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { Alert, Field, errorMessage, inputClass, primaryButtonClass } from '../components/ui';
import { useAuthToken, useLogin } from '../hooks/queries';

export function StaffLoginPage() {
  const navigate = useNavigate();
  const token = useAuthToken();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (token) return <Navigate to="/staff" replace />;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold text-slate-900">Staff login</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to view your branch's schedule.</p>

      <form
        className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate(
            { email: email.trim(), password },
            { onSuccess: () => void navigate('/staff', { replace: true }) },
          );
        }}
      >
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        {login.isError && <Alert tone="error">{errorMessage(login.error)}</Alert>}

        <button
          type="submit"
          className={`${primaryButtonClass} w-full`}
          disabled={login.isPending || !email.trim() || !password}
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
