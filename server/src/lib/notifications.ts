export interface BookingConfirmation {
  reference: string;
  customerName: string;
  customerEmail: string;
  branchName: string;
  serviceName: string;
  startsAt: Date;
}

/**
 * Seam for outbound customer notifications. The console implementation
 * simulates the confirmation the brief asks for; a real email/SMS provider
 * would implement the same interface (ideally fed by an outbox table so
 * delivery can be retried independently of the booking transaction).
 */
export interface Notifier {
  sendBookingConfirmation(confirmation: BookingConfirmation): Promise<void>;
  sendBookingCancellation(confirmation: BookingConfirmation): Promise<void>;
}

export const consoleNotifier: Notifier = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async sendBookingConfirmation(c) {
    console.log(
      `[simulated email → ${c.customerEmail}] ` +
        `Hi ${c.customerName}, your ${c.serviceName} appointment at ${c.branchName} ` +
        `is confirmed for ${c.startsAt.toISOString()}. Reference: ${c.reference}`,
    );
  },
  // eslint-disable-next-line @typescript-eslint/require-await
  async sendBookingCancellation(c) {
    console.log(
      `[simulated email → ${c.customerEmail}] ` +
        `Hi ${c.customerName}, your ${c.serviceName} appointment at ${c.branchName} ` +
        `for ${c.startsAt.toISOString()} has been cancelled. Reference: ${c.reference}`,
    );
  },
};
