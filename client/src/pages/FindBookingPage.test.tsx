import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { FindBookingPage } from './FindBookingPage';

function DetailMarker() {
  const { reference } = useParams();
  return <div>detail for {reference}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/find']}>
      <Routes>
        <Route path="/find" element={<FindBookingPage />} />
        <Route path="/appointments/:reference" element={<DetailMarker />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FindBookingPage', () => {
  it('disables the button until the reference has a valid format', async () => {
    const user = userEvent.setup();
    renderPage();

    const button = screen.getByRole('button', { name: 'Find booking' });
    expect(button).toBeDisabled();

    // Contains characters outside the unambiguous alphabet (0, 1, I, L, O).
    await user.type(screen.getByLabelText('Booking reference'), 'ABC01ILO23');
    expect(button).toBeDisabled();
  });

  it('normalizes lowercase input and navigates to the booking', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Booking reference'), 'k7mpq2xzw4');
    await user.click(screen.getByRole('button', { name: 'Find booking' }));

    await screen.findByText('detail for K7MPQ2XZW4');
  });
});
