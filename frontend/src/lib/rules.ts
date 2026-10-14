import type { BuilderCondition, RuleBuilder, RuleSeverity } from "../api/types";

export interface FieldDef {
  field: string;
  label: string; // translation key
  type: "integer" | "string";
  /** A fixed yes/no test: the operator and value cannot be changed. */
  fixed?: { operator: string; value: string };
  hint?: string;
}

export const FIELDS: FieldDef[] = [
  { field: "macros.device_down", label: "Device is down", type: "integer", fixed: { operator: "equal", value: "1" } },
  { field: "devices.status", label: "Device status (1 = up, 0 = down)", type: "integer" },
  { field: "devices.uptime", label: "Device uptime (seconds)", type: "integer" },
  { field: "processors.processor_usage", label: "CPU usage (%)", type: "integer" },
  { field: "mempools.mempool_perc", label: "Memory usage (%)", type: "integer" },
  { field: "storage.storage_perc", label: "Disk usage (%)", type: "integer" },
  { field: "ports.ifOperStatus", label: "Port state", type: "string", hint: "up, down" },
  { field: "ports.ifAdminStatus", label: "Port admin state", type: "string", hint: "up, down" },
  { field: "ports.deleted", label: "Port is deleted (1 or 0)", type: "integer" },
  { field: "ports.ifInErrors_delta", label: "Port input errors since last poll", type: "integer" },
  { field: "ports.ifOutErrors_delta", label: "Port output errors since last poll", type: "integer" },
  { field: "devices.hostname", label: "Device host name", type: "string" },
  { field: "devices.os", label: "Operating system", type: "string" },
];

export const CUSTOM_FIELD = "__custom__";

export const OPERATORS: { value: string; label: string; noValue?: boolean }[] = [
  { value: "equal", label: "is" },
  { value: "not_equal", label: "is not" },
  { value: "less", label: "is less than" },
  { value: "less_or_equal", label: "is at most" },
  { value: "greater", label: "is greater than" },
  { value: "greater_or_equal", label: "is at least" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "begins_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "regex", label: "matches regex" },
];
export const NO_VALUE_OPERATORS = new Set(["is_empty", "is_not_empty", "is_null", "is_not_null"]);
export const FIELD_PATTERN = /^[A-Za-z0-9_]{1,40}\.[A-Za-z0-9_]{1,60}$/;

export interface Condition { field: string; operator: string; value: string }

export const isGroup = (r: BuilderCondition | RuleBuilder): r is RuleBuilder => "rules" in r;

/** A rule whose conditions are all plain tests (no nested groups) can be edited here. */
export const isFlat = (b: RuleBuilder | null): b is RuleBuilder => !!b && b.rules.length > 0 && b.rules.every((r) => !isGroup(r));

export const fieldDef = (field: string) => FIELDS.find((f) => f.field === field);
export const fieldType = (field: string, value: string): "integer" | "string" =>
  fieldDef(field)?.type ?? (/^-?\d+(\.\d+)?$/.test(value.trim()) ? "integer" : "string");

export function toConditions(b: RuleBuilder): Condition[] {
  return b.rules.filter((r): r is BuilderCondition => !isGroup(r)).map((r) => ({
    field: r.field || r.id || "", operator: r.operator, value: String(r.value ?? ""),
  }));
}

export function toBuilder(condition: "AND" | "OR", conds: Condition[]): RuleBuilder {
  return {
    condition,
    rules: conds.map((c) => ({ field: c.field, operator: c.operator, value: c.value.trim(), type: fieldType(c.field, c.value) })),
  };
}

const SYMBOL: Record<string, string> = { equal: "=", not_equal: "≠", less: "<", less_or_equal: "≤", greater: ">", greater_or_equal: "≥" };

/** A short readable summary such as "CPU usage (%) ≥ 90 AND ...". `t` translates field labels. */
export function summarize(b: RuleBuilder | null, t: (k: string) => string, and = "AND", or = "OR"): string {
  if (!b) return "—";
  const part = (r: BuilderCondition | RuleBuilder): string => {
    if (isGroup(r)) return `(${r.rules.map(part).join(` ${r.condition === "OR" ? or : and} `)})`;
    const f = r.field || r.id || "";
    const def = fieldDef(f);
    if (def?.fixed) return t(def.label);
    const op = SYMBOL[r.operator] ?? t(OPERATORS.find((o) => o.value === r.operator)?.label ?? r.operator);
    const name = def ? t(def.label) : f;
    return NO_VALUE_OPERATORS.has(r.operator) ? `${name} ${op}` : `${name} ${op} ${r.value ?? ""}`;
  };
  return b.rules.map(part).join(` ${b.condition === "OR" ? or : and} `);
}

export interface RuleTemplate {
  key: string;
  name: string; // translation keys
  description: string;
  severity: RuleSeverity;
  delay: number; // seconds
  interval: number; // seconds
  condition: "AND" | "OR";
  conditions: Condition[];
}

export const TEMPLATES: RuleTemplate[] = [
  {
    key: "down", name: "Device down", description: "Alert when a device stops answering.", severity: "critical", delay: 300, interval: 300,
    condition: "AND", conditions: [{ field: "macros.device_down", operator: "equal", value: "1" }],
  },
  {
    key: "cpu", name: "High CPU usage", description: "CPU usage is 90% or more.", severity: "warning", delay: 900, interval: 3600,
    condition: "AND", conditions: [{ field: "processors.processor_usage", operator: "greater_or_equal", value: "90" }],
  },
  {
    key: "memory", name: "High memory usage", description: "Memory usage is 90% or more.", severity: "warning", delay: 900, interval: 3600,
    condition: "AND", conditions: [{ field: "mempools.mempool_perc", operator: "greater_or_equal", value: "90" }],
  },
  {
    key: "disk", name: "Disk almost full", description: "A disk is 90% full or more.", severity: "warning", delay: 900, interval: 86400,
    condition: "AND", conditions: [{ field: "storage.storage_perc", operator: "greater_or_equal", value: "90" }],
  },
  {
    key: "port", name: "Port down", description: "A port that should be up is down.", severity: "warning", delay: 300, interval: 3600,
    condition: "AND",
    conditions: [
      { field: "ports.ifOperStatus", operator: "equal", value: "down" },
      { field: "ports.ifAdminStatus", operator: "equal", value: "up" },
      { field: "ports.deleted", operator: "equal", value: "0" },
    ],
  },
  {
    key: "reboot", name: "Device rebooted", description: "A device was restarted in the last 5 minutes.", severity: "warning", delay: 0, interval: 0,
    condition: "AND",
    conditions: [
      { field: "devices.uptime", operator: "less", value: "300" },
      { field: "devices.status", operator: "equal", value: "1" },
    ],
  },
];
