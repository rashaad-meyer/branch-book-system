export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  operatingHours: Record<string, [string, string]>;
  services: Service[];
}

export interface Slot {
  startsAt: string;
  endsAt: string;
}

export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED';

export interface Appointment {
  id: string;
  reference: string;
  status: AppointmentStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  branchId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  branch?: { name: string; address: string | null; timezone: string };
  service?: Service;
}

export interface LoginResponse {
  token: string;
  user: { id: string; email: string; fullName: string };
}

export interface Schedule {
  branch: { id: string; name: string; timezone: string };
  date: string;
  appointments: Array<Appointment & { service: Service }>;
}
