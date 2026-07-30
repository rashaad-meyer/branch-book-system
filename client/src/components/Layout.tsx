import { NavLink, Outlet } from 'react-router-dom';

import { clearToken } from '../lib/auth';
import { useAuthToken } from '../hooks/queries';

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-blue-800 text-white' : 'text-blue-100 hover:bg-blue-800/60 hover:text-white'
  }`;
}

export function Layout() {
  const token = useAuthToken();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="bg-blue-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <NavLink to="/" className="text-lg font-semibold text-white">
            Branch Booking
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Book
            </NavLink>
            <NavLink to="/find" className={navClass}>
              Find booking
            </NavLink>
            <NavLink to="/staff" className={navClass}>
              Staff
            </NavLink>
            {token && (
              <button
                type="button"
                onClick={clearToken}
                className="ml-2 rounded-md px-3 py-1.5 text-sm font-medium text-blue-200 hover:bg-blue-800/60 hover:text-white"
              >
                Log out
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        Branch Appointment Booking — assessment project. Confirmations are simulated.
      </footer>
    </div>
  );
}
