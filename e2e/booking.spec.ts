import { expect, test } from '@playwright/test';

/**
 * The one journey that has to work: a guest books a slot in the browser and the
 * branch's staff member sees that exact booking on their schedule. It exercises
 * every layer end to end — React → nginx → Express → Prisma → Postgres → JWT auth —
 * with nothing stubbed, against the seeded compose stack.
 */

const STAFF_EMAIL = 'staff.capetown@example.com';
const STAFF_PASSWORD = 'Password123!';
const BRANCH = 'Cape Town CBD';
const SERVICE = 'Account Opening';

/** Next weekday at least `minDaysAhead` out — branches are closed on Sundays. */
function nextWeekday(minDaysAhead = 1): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + minDaysAhead);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

/** Options are labelled with extra detail (address, duration), so match on value. */
async function selectByOptionText(
  select: import('@playwright/test').Locator,
  text: string,
): Promise<void> {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  expect(value, `no <option> matching "${text}"`).toBeTruthy();
  await select.selectOption(value!);
}

test('guest books an appointment and branch staff see it on the schedule', async ({ page }) => {
  const bookingDate = nextWeekday();
  const customerName = `E2E Customer ${Date.now()}`;
  const customerEmail = `e2e+${Date.now()}@example.com`;

  // --- Customer: book a slot -------------------------------------------------
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Book a branch appointment' })).toBeVisible();

  await selectByOptionText(page.getByLabel('Branch'), BRANCH);
  await selectByOptionText(page.getByLabel('Service'), SERVICE);
  await page.getByLabel('Date').fill(bookingDate);

  // Slot buttons are labelled with branch-local times ("08:00").
  const slots = page.getByRole('button', { name: /^\d{2}:\d{2}$/ });
  await expect(slots.first()).toBeVisible();
  const slotTime = (await slots.first().textContent())?.trim();
  await slots.first().click();
  await expect(slots.first()).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Full name').fill(customerName);
  await page.getByLabel('Email').fill(customerEmail);
  await page.getByLabel(/^Phone/).fill('+27821234567');
  await page.getByRole('button', { name: 'Book appointment' }).click();

  // Confirmation page: URL carries the reference the customer manages the booking with.
  await expect(page).toHaveURL(/\/appointments\/[A-Z0-9]{10}$/);
  await expect(page.getByText(/Appointment confirmed!/)).toBeVisible();
  const reference = new URL(page.url()).pathname.split('/').pop()!;
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await expect(page.getByText(SERVICE)).toBeVisible();

  // --- Staff: the booking is on the branch schedule ---------------------------
  await page.goto('/staff');
  await expect(page).toHaveURL(/\/staff\/login$/); // unauthenticated staff are redirected

  await page.getByLabel('Email').fill(STAFF_EMAIL);
  await page.getByLabel('Password').fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: `${BRANCH} — schedule` })).toBeVisible();
  await page.locator('#schedule-date').fill(bookingDate);

  const row = page.getByRole('listitem').filter({ hasText: reference });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(customerName);
  await expect(row).toContainText(SERVICE);
  await expect(row).toContainText(customerEmail);
  await expect(row).toContainText(slotTime!);
  await expect(row).toContainText('CONFIRMED');
});
