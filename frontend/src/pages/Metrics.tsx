import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { RANGES } from "../api/prometheus";
import { useI18n } from "../lib/i18n";
import { Empty, ErrorNote, Panel } from "../components/ui";
import SeriesChart from "../components/SeriesChart";

const EXAMPLES: [string, string][] = [
  ["Devices up", "sum(padi_device_up)"],
  ["Devices down", "count(padi_device_up == 0)"],
  ["Active alerts", "sum(padi_alerts_active)"],
  ["CPU per server", '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'],
  ["Memory per server", "100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))"],
  ["Probe latency (ms)", "probe_duration_seconds * 1000"],
];

export default function Metrics() {
  const { t } = useI18n();
  const status = useQuery({ queryKey: ["prometheus", "status"], queryFn: api.prometheusStatus });
  const [query, setQuery] = useState("sum(padi_device_up)");
  const [range, setRange] = useState(3600);
  const [shownRange, setShownRange] = useState(3600);
  const run = useMutation({
    mutationFn: () => api.prometheusRange(query.trim(), range),
    onSuccess: () => setShownRange(range),
  });
  const series = run.data?.data.series ?? [];
  const inputCls = "rounded-md border border-line bg-bg px-3 py-2 text-sm";

  if (status.data && !status.data.configured) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">{t("Metrics")}</h1>
        <Panel title={t("Prometheus")}>
          <Empty>
            {t("Prometheus is not connected.")}{" "}
            <Link to="/settings" className="text-accent underline">{t("Settings")}</Link>
          </Empty>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Metrics")}</h1>
        <p className="mt-1 max-w-prose text-sm text-dim">{t("Run any PromQL query against your Prometheus and chart the result.")}</p>
      </div>

      <Panel title={t("Query")}>
        <form className="space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); if (query.trim()) run.mutate(); }}>
          <label className="block text-sm">
            PromQL
            <textarea value={query} onChange={(e) => setQuery(e.target.value)} dir="ltr" rows={3} spellCheck={false}
              className={`${inputCls} mt-1 block w-full font-mono`} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {EXAMPLES.map(([label, q]) => (
              <button key={label} type="button" onClick={() => setQuery(q)}
                className="rounded-full border border-line px-3 py-1 text-xs hover:bg-sunken">{t(label)}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label={t("Time range")} className={inputCls}>
              {RANGES.map(([s, l]) => <option key={s} value={s}>{t(l)}</option>)}
            </select>
            <button type="submit" disabled={run.isPending || !query.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60">
              {run.isPending ? t("Running") : t("Run query")}
            </button>
          </div>
        </form>
      </Panel>

      <ErrorNote error={run.error} />

      {run.isSuccess && (
        <Panel title={t("Result")}>
          {series.length === 0 ? (
            <Empty>{t("The query returned no data for this time range.")}</Empty>
          ) : (
            <div className="space-y-3 p-4">
              <SeriesChart series={series} range={shownRange} />
              {series.length >= 12 && <p className="text-xs text-dim">{t("Only the first 12 series are shown.")}</p>}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
