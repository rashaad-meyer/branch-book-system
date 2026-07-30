import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { api } from '../lib/api';
import { getToken, setToken, subscribe } from '../lib/auth';
import type { Appointment, Branch, LoginResponse, Schedule, Slot } from '../lib/types';

export function useAuthToken(): string | null {
  return useSyncExternalStore(subscribe, getToken);
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('/branches'),
    staleTime: 5 * 60 * 1000, // catalog data changes rarely
  });
}

export function useAvailability(branchId: string, serviceId: string, date: string) {
  return useQuery({
    queryKey: ['availability', branchId, serviceId, date],
    queryFn: () =>
      api.get<Slot[]>(`/branches/${branchId}/availability?serviceId=${serviceId}&date=${date}`),
    enabled: Boolean(branchId && serviceId && date),
    // Availability is inherently stale the moment it's fetched (someone else
    // may book); keep it fresh-ish and refetch after booking conflicts.
    staleTime: 15 * 1000,
  });
}

export function useAppointment(reference: string) {
  return useQuery({
    queryKey: ['appointment', reference],
    queryFn: () => api.get<Appointment>(`/appointments/${reference}`),
    enabled: Boolean(reference),
  });
}

export interface BookingInput {
  branchId: string;
  serviceId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  startsAt: string;
}

export function useBookAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: BookingInput; idempotencyKey: string }) =>
      api.post<Appointment>('/appointments', input, { 'Idempotency-Key': idempotencyKey }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['availability'] }),
  });
}

export function useCancelAppointment(reference: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Appointment>(`/appointments/${reference}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointment', reference] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api.post<LoginResponse>('/auth/login', credentials),
    onSuccess: (data) => setToken(data.token),
  });
}

export function useSchedule(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['schedule', date],
    queryFn: () => api.get<Schedule>(`/staff/schedule?date=${date}`),
    enabled: enabled && Boolean(date),
  });
}

export function useStaffCancel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appointmentId: string) =>
      api.post<Appointment>(`/staff/appointments/${appointmentId}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedule'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}
