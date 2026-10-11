// The sign-in token. "Stay signed in" keeps it across browser restarts (localStorage);
// otherwise it lives only until the tab is closed (sessionStorage).
const KEY = "padi.token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string, remember: boolean) {
  clearToken();
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, token);
  } catch {
    /* storage unavailable: the user will have to sign in again after a reload */
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Fired by the API client when the server says the session is no longer valid. */
export const UNAUTHORIZED_EVENT = "padi:unauthorized";
