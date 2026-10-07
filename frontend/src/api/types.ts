// Shapes returned by the FastAPI proxy. Field names marked UNVERIFIED have not
// been checked against a live LibreNMS server yet, so everything is optional.
export type Source = "live" | "mock";

export interface Envelope<T> {
  source: Source;
  data: T;
}

export interface Health {
  status: string;
  source: Source;
  configured: boolean;
  version?: string;
  message?: string;
}

export interface Device {
  device_id: number;
  hostname: string;
  sysName?: string;
  display?: string;
  notes?: string | null;
  purpose?: string | null;
  port?: number;
  disabled?: number | boolean;
  ignore?: number | boolean;
  ip?: string;
  os?: string;
  hardware?: string;
  location?: string;
  status?: number | string | boolean; // list: 1/0; single device may be true/false
  type?: string;
  serial?: string | null;
  version?: string | null;
  sysDescr?: string | null;
  snmpver?: string;
  snmp_disable?: number | boolean;
  status_reason?: string;
  last_ping?: string | null;
  last_ping_timetaken?: number | null;
  uptime?: number;
  last_polled?: string;
}

export interface Alert {
  id?: number;
  alert_id?: number;
  device_id?: number;
  rule_id?: number;
  hostname?: string;
  sysName?: string;
  rule?: string; // UNVERIFIED: the backend joins rule names; the key may be rule, name or rule_name
  rule_name?: string;
  name?: string;
  info?: unknown;
  notes?: string;
  severity?: string;
  state?: number; // 0 ok, 1 alert, 2 acknowledged
  timestamp?: string;
}

// UNVERIFIED: shapes of the per-device sub-resources. The UI reads them through
// the tolerant helpers in lib/extract.ts instead of trusting exact nesting.
export interface Availability {
  duration?: number; // seconds: 86400, 604800, 2592000, 31536000
  availability_perc?: number | string;
}
export interface Outage {
  going_down?: number; // epoch seconds
  up_again?: number | null;
}
export interface Port {
  port_id: number;
  device_id?: number;
  hostname?: string;
  ifName?: string;
  ifDescr?: string;
  ifAlias?: string;
  ifOperStatus?: string;
  ifAdminStatus?: string;
  ifSpeed?: number;
  ifInOctets_rate?: number;
  ifOutOctets_rate?: number;
}

// UNVERIFIED: field names for services and log entries.
export interface Service {
  service_id?: number;
  device_id?: number;
  service_type?: string;
  service_name?: string;
  service_desc?: string;
  service_status?: number | string; // LibreNMS: 0 ok, 1 warning, 2 critical
  service_message?: string;
  service_changed?: number; // epoch seconds
  hostname?: string;
}
export interface LogEntry {
  event_id?: number;
  datetime?: string;
  timestamp?: string;
  device_id?: number;
  hostname?: string;
  message?: string;
  msg?: string;
  type?: string;
  severity?: number | string; // eventlog: 1 ok, 2 info, 3 notice, 4 warning, 5 error
  program?: string;
}

// UNVERIFIED: LibreNMS /resources/links field names as passed through by the proxy.
export interface TopologyLink {
  id?: number;
  local_device_id?: number;
  local_port_id?: number;
  local_port?: string;
  remote_device_id?: number | null;
  remote_hostname?: string;
  remote_port?: string;
  protocol?: string;
  remote_platform?: string;
}
