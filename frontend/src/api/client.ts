import { getBackendUrl } from "../lib/backend";
import { clearToken, getToken, UNAUTHORIZED_EVENT } from "../lib/session";
import type { PromDevice, PromSeries, PromStatus } from "./prometheus";
import type { Alert, AlertRule, AuthUser, Device, Envelope, Health, ManagedUser, RuleInput, ServiceInput } from "./types";

// Sub-resources are read through tolerant helpers, so they are typed as unknown.
type Raw = Envelope<unknown>;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const ACK_METHOD = "PUT";
// UNVERIFIED: how the proxy saves settings. Change if the backend expects PUT or a different path.
const SETTINGS_METHOD = "PUT";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  // A backend that accepts the connection but never answers must not leave the app on "Loading" forever.
  // Scans can legitimately take long, so they get no limit; reads get 20 s, changes 2 minutes.
  const limitMs = path.startsWith("/discovery") ? 0 : (init?.method ?? "GET") === "GET" ? 20_000 : 120_000;
  const ctrl = new AbortController();
  const timer = limitMs ? setTimeout(() => ctrl.abort(), limitMs) : undefined;
  try {
    res = await fetch(`${getBackendUrl()}/api${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      ctrl.signal.aborted
        ? "The backend did not answer in time. Check that it is running, then try again."
        : "The backend is not reachable. Check the backend address in Settings.",
      0,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.error?.message ?? body.detail ?? body.message ?? detail;
    } catch {
      /* keep statusText */
    }
    // A rejected token (expired, signed out elsewhere, user disabled) sends everyone back to the login page.
    if (res.status === 401 && getToken()) {
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status);
  }
  return res.json() as Promise<T>;
}

// LibreNMS can send an object where the UI expects text (for example a location record). Flatten it.
function flatDevice(d: Device): Device {
  const out = { ...d } as unknown as Record<string, unknown>;
  for (const k of ["location", "display", "sysName", "hostname", "hardware", "os", "type", "notes", "purpose", "version", "serial", "sysDescr"]) {
    const v = out[k];
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      out[k] = String(Array.isArray(v) ? v.join(", ") : o.location ?? o.name ?? o.display ?? "");
    }
  }
  return out as unknown as Device;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export interface Session {
  token: string;
  expires_at: number;
  user: AuthUser;
}

export const api = {
  authStatus: () => request<Envelope<{ needs_setup: boolean }>>("/auth/status"),
  login: (username: string, password: string, remember: boolean) =>
    request<Envelope<Session>>("/auth/login", post({ username, password, remember })),
  setupAdmin: (username: string, password: string, full_name: string, remember: boolean) =>
    request<Envelope<Session>>("/auth/setup", post({ username, password, full_name, remember })),
  me: () => request<Envelope<AuthUser>>("/auth/me"),
  logout: () => request<Envelope<unknown>>("/auth/logout", post({})),
  changePassword: (current_password: string, new_password: string) =>
    request<Envelope<unknown>>("/auth/password", post({ current_password, new_password })),
  users: () => request<Envelope<ManagedUser[]>>("/users"),
  createUser: (b: { username: string; password: string; role: string; full_name: string }) =>
    request<Envelope<ManagedUser[]>>("/users", post(b)),
  updateUser: (id: number, b: Record<string, string | boolean>) =>
    request<Envelope<ManagedUser[]>>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteUser: (id: number) => request<Envelope<ManagedUser[]>>(`/users/${id}`, { method: "DELETE" }),

  health: () => request<Health>("/health"),
  devices: () => request<Envelope<Device[]>>("/devices?per_page=5000").then((r) => ({ ...r, data: (r.data ?? []).map(flatDevice) })),
  alerts: (query = "") => request<Envelope<Alert[]>>(`/alerts${query ? `${query}&` : "?"}per_page=1000`),
  device: (id: string | number) => request<Envelope<Device>>(`/devices/${id}`).then((r) => ({ ...r, data: r.data ? flatDevice(r.data) : r.data })),
  deviceHealth: (id: string | number) => request<Raw>(`/devices/${id}/health`),
  deviceAvailability: (id: string | number) => request<Raw>(`/devices/${id}/availability`),
  deviceOutages: (id: string | number) => request<Raw>(`/devices/${id}/outages`),
  topology: () => request<Raw>("/topology"),
  settings: () => request<unknown>("/settings"),
  saveSettings: (body: { url?: string; token?: string; prometheus_url?: string }) =>
    request<unknown>("/settings", { method: SETTINGS_METHOD, body: JSON.stringify(body) }),
  services: () => request<Raw>("/services"),
  rules: () => request<Envelope<AlertRule[]>>("/rules"),
  addRule: (b: RuleInput) => request<Raw>("/rules", { method: "POST", body: JSON.stringify(b) }),
  updateRule: (id: number, b: RuleInput) => request<Raw>(`/rules/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteRule: (id: number) => request<Raw>(`/rules/${id}`, { method: "DELETE" }),
  addService: (b: ServiceInput) => request<Raw>("/services", { method: "POST", body: JSON.stringify(b) }),
  updateService: (id: number, b: ServiceInput) => request<Raw>(`/services/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
  deleteService: (id: number) => request<Raw>(`/services/${id}`, { method: "DELETE" }),
  prometheusStatus: () => request<PromStatus>("/prometheus/status"),
  prometheusRange: (query: string, range: number) =>
    request<Envelope<{ series: PromSeries[] }>>(`/prometheus/query_range?${new URLSearchParams({ query, range: String(range) })}`),
  devicePrometheus: (id: string | number, range: number) =>
    request<Envelope<PromDevice>>(`/devices/${id}/prometheus?range=${range}`),
  // UNVERIFIED: the proxy's query parameters for /api/events (type, limit, start, hostname).
  events: (params: { type?: string; limit?: number; start?: number; hostname?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
    const q = qs.toString();
    return request<Raw>(`/events${q ? `?${q}` : ""}`);
  },
  ports: () => request<Raw>("/ports?per_page=20000"),
  // UNVERIFIED: the proxy's acknowledge route method. Change ACK_METHOD if the backend uses PUT.
  ackAlert: (id: number | string, body: { note?: string; until_clear?: boolean }) =>
    request<unknown>(`/alerts/${id}/ack`, { method: ACK_METHOD, body: JSON.stringify(body) }),
  // LibreNMS field names (hostname, snmpver, community, snmp_disable, ...) are sent as is; the proxy filters them.
  addDevice: (body: Record<string, string | number | boolean>) =>
    request<Raw>("/devices", { method: "POST", body: JSON.stringify(body) }),
  // LibreNMS: DELETE /api/v0/devices/:hostname (the proxy maps the id).
  removeDevice: (id: string | number) => request<Raw>(`/devices/${id}`, { method: "DELETE" }),
  editDevice: (id: string | number, body: Record<string, string | number | boolean>) =>
    request<Raw>(`/devices/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  scanNetwork: (target: string) =>
    request<Raw>("/discovery/scan", { method: "POST", body: JSON.stringify({ target }) }),
  bulkAddDevices: (body: Record<string, string | boolean | string[]>) =>
    request<Raw>("/discovery/add", { method: "POST", body: JSON.stringify(body) }),
  startPortScan: (host: string, mode: "known" | "range", start: number, end: number) =>
    request<Raw>("/discovery/ports/start", { method: "POST", body: JSON.stringify({ host, mode, start, end }) }),
  portScanStatus: (id: string) => request<Raw>(`/discovery/ports/${id}`),
  cancelPortScan: (id: string) => request<Raw>(`/discovery/ports/${id}/cancel`, { method: "POST" }),
  devicePorts: (id: string | number) => request<Raw>(`/devices/${id}/ports`),
};
