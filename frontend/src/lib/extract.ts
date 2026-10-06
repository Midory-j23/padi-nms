// The backend passes LibreNMS payloads through, and their nesting is UNVERIFIED.
// These helpers find what the UI needs without depending on exact wrapper keys.

/** Return the list under `key`, or the data itself if it is already a list, or the first list found. */
export function listFrom<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (key && Array.isArray(obj[key])) return obj[key] as T[];
    for (const v of Object.values(obj)) if (Array.isArray(v)) return v as T[];
  }
  return [];
}

/** Collect every object (at any depth) that has the given field. */
export function collectWith(data: unknown, field: string, out: Record<string, unknown>[] = []) {
  if (Array.isArray(data)) data.forEach((d) => collectWith(d, field, out));
  else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (field in obj) out.push(obj);
    else Object.values(obj).forEach((v) => collectWith(v, field, out));
  }
  return out;
}

export const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

export interface HealthSummary {
  cpu?: number;
  memory?: number;
  storage: { name: string; percent: number }[];
}

export function summarizeHealth(data: unknown): HealthSummary {
  const cpus = collectWith(data, "processor_usage").map((r) => num(r.processor_usage)).filter((n): n is number => n !== undefined);
  const mems = collectWith(data, "mempool_perc").map((r) => num(r.mempool_perc)).filter((n): n is number => n !== undefined);
  const storage = collectWith(data, "storage_perc").flatMap((r) => {
    const percent = num(r.storage_perc);
    return percent === undefined ? [] : [{ name: String(r.storage_descr ?? r.storage_mount ?? "Disk"), percent }];
  });
  return {
    cpu: cpus.length ? cpus.reduce((a, b) => a + b, 0) / cpus.length : undefined,
    memory: mems.length ? Math.max(...mems) : undefined,
    storage,
  };
}
