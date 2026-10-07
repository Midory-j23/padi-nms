import { getBackendUrl } from "../lib/backend";
import type { PromDevice, PromSeries, PromStatus } from "./prometheus";
import type { Alert, Device, Envelope, Health } from "./types";

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
  try {
    res = await fetch(`${getBackendUrl()}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("The backend is not reachable. Check the backend address in Settings.", 0);
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
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/health"),
  devices: () => request<Envelope<Device[]>>("/devices?per_page=5000"),
  alerts: (query = "") => request<Envelope<Alert[]>>(`/alerts${query ? `${query}&` : "?"}per_page=1000`),
  device: (id: string | number) => request<Envelope<Device>>(`/devices/${id}`),
  deviceHealth: (id: string | number) => request<Raw>(`/devices/${id}/health`),
  deviceAvailability: (id: string | number) => request<Raw>(`/devices/${id}/availability`),
  deviceOutages: (id: string | number) => request<Raw>(`/devices/${id}/outages`),
  topology: () => request<Raw>("/topology"),
  settings: () => request<unknown>("/settings"),
  saveSettings: (body: { url?: string; token?: string; prometheus_url?: string }) =>
    request<unknown>("/settings", { method: SETTINGS_METHOD, body: JSON.stringify(body) }),
  services: () => request<Raw>("/services"),
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
