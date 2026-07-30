// Tiny observable token store so components re-render on login/logout
// (including the automatic logout the API wrapper performs on a 401).
const STORAGE_KEY = 'staff_token';

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token);
  emit();
}

export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
