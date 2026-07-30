import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { Layout } from './components/Layout';
import { ApiError } from './lib/api';
import { AppointmentPage } from './pages/AppointmentPage';
import { BookPage } from './pages/BookPage';
import { FindBookingPage } from './pages/FindBookingPage';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { StaffSchedulePage } from './pages/StaffSchedulePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Client errors (validation, 404, auth) won't succeed on retry.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <BookPage /> },
      { path: '/find', element: <FindBookingPage /> },
      { path: '/appointments/:reference', element: <AppointmentPage /> },
      { path: '/staff/login', element: <StaffLoginPage /> },
      { path: '/staff', element: <StaffSchedulePage /> },
      { path: '*', element: <FindBookingPage /> },
    ],
  },
]);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
