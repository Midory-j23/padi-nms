// Where the Padi backend (FastAPI proxy) lives. Empty = same origin (Vite dev proxy / reverse proxy).
const KEY = "padi.backendUrl";

export function normalizeBackendUrl(raw: string): string {
  let v = raw.trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`; // allow "192.168.1.20:8000"
  v = v.replace(/\/api$/i, "");
  return v;
}

export function getBackendUrl(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setBackendUrl(raw: string) {
  const v = normalizeBackendUrl(raw);
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
