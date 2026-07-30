import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BookPage } from './BookPage';

const BRANCH = {
  id: '11111111-1111-7111-8111-111111111111',
  name: 'Cape Town CBD',
  address: '1 Adderley Street',
  timezone: 'Africa/Johannesburg',
  operatingHours: { mon: ['08:00', '17:00'] },
  services: [
    { id: '22222222-2222-7222-8222-222222222222', name: 'Account Opening', durationMinutes: 30 },
  ],
};

// 06:00/06:30 UTC = 08:00/08:30 Johannesburg wall time.
const SLOTS = [
  { startsAt: '2026-08-03T06:00:00.000Z', endsAt: '2026-08-03T06:30:00.000Z' },
  { startsAt: '2026-08-03T06:30:00.000Z', endsAt: '2026-08-03T07:00:00.000Z' },
];

const CREATED = {
  id: '33333333-3333-7333-8333-333333333333',
  reference: 'K7MPQ2XZW4',
  status: 'CONFIRMED',
};

function mockApi() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith('/branches')) {
        return Promise.resolve(new Response(JSON.stringify([BRANCH]), { status: 200 }));
      }
      if (url.includes('/availability')) {
        return Promise.resolve(new Response(JSON.stringify(SLOTS), { status: 200 }));
      }
      if (url.endsWith('/appointments') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify(CREATED), { status: 201 }));
      }
      return Promise.resolve(new Response('null', { status: 404 }));
    }),
  );
  return calls;
}

function ConfirmationMarker() {
  const { reference } = useParams();
  return <div>confirmation for {reference}</div>;
}

function renderBookPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<BookPage />} />
          <Route path="/appointments/:reference" element={<ConfirmationMarker />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BookPage', () => {
  it('walks the full flow: pick branch, service and slot, book, land on confirmation', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderBookPage();

    // Branch + service selection (services arrive embedded in the branch).
    await user.selectOptions(await screen.findByLabelText('Branch'), BRANCH.id);
    await user.selectOptions(screen.getByLabelText('Service'), BRANCH.services[0]!.id);

    // Slots render as branch-local wall times.
    const slotButton = await screen.findByRole('button', { name: '08:00' });
    expect(screen.getByRole('button', { name: '08:30' })).toBeInTheDocument();
    await user.click(slotButton);
    expect(slotButton).toHaveAttribute('aria-pressed', 'true');

    // Submit is gated until the details are filled in.
    const submit = screen.getByRole('button', { name: 'Book appointment' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Full name'), 'Ayesha Adams');
    await user.type(screen.getByLabelText('Email'), 'ayesha@example.com');
    expect(submit).toBeEnabled();

    await user.click(submit);

    // Lands on the confirmation route for the returned reference.
    await screen.findByText(`confirmation for ${CREATED.reference}`);

    // The booking request carried the right payload and an Idempotency-Key.
    const post = calls.find((c) => c.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(post!.init!.body as string) as Record<string, unknown>;
    expect(body.startsAt).toBe(SLOTS[0]!.startsAt);
    expect(body.customerName).toBe('Ayesha Adams');
    const headers = post!.init!.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps the submit disabled until a slot is chosen', async () => {
    mockApi();
    const user = userEvent.setup();
    renderBookPage();

    await user.selectOptions(await screen.findByLabelText('Branch'), BRANCH.id);
    await user.selectOptions(screen.getByLabelText('Service'), BRANCH.services[0]!.id);
    await user.type(screen.getByLabelText('Full name'), 'No Slot');
    await user.type(screen.getByLabelText('Email'), 'noslot@example.com');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Book appointment' })).toBeDisabled(),
    );
  });
});
