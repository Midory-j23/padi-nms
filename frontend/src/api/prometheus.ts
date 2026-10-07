export interface PromSeries { label: string; metric: Record<string, string>; points: [number, number][] }
export interface PromPanel { id: string; title: string; unit: string; series: PromSeries[] }
export interface PromDevice { matcher: string; range: number; panels: PromPanel[] }
export interface PromStatus { configured: boolean; ok: boolean; version: string | null; latency_ms: number | null; message: string | null }

export const RANGES: [number, string][] = [
  [900, "15 minutes"], [3600, "1 hour"], [21600, "6 hours"], [86400, "24 hours"], [604800, "7 days"],
];
