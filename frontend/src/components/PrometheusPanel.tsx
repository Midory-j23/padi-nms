import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { RANGES } from "../api/prometheus";
import { useI18n } from "../lib/i18n";
import { useRefresh } from "../lib/refresh";
import { Empty, ErrorNote, Panel } from "./ui";
import SeriesChart from "./SeriesChart";

/** Charts for one device, read from Prometheus (node_exporter / blackbox_exporter metrics). */
export default function PrometheusPanel({ deviceId }: { deviceId: string }) {
  const { t } = useI18n();
  const { ms } = useRefresh();
  const [range, setRange] = useState(3600);
  const status = useQuery({ queryKey: ["prometheus", "status"], queryFn: api.prometheusStatus });
  const configured = status.data?.configured;
  const q = useQuery({
    queryKey: ["device", deviceId, "prometheus", range],
    queryFn: () => api.devicePrometheus(deviceId, range),
    enabled: configured === true,
    refetchInterval: ms ? ms * 2 : false,
  });
  const panels = (q.data?.data.panels ?? []).filter((p) => p.series.length > 0);

  const aside = (
    <select value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label={t("Time range")}
      className="rounded-md border border-line bg-panel px-2 py-1.5 text-xs">
      {RANGES.map(([s, l]) => <option key={s} value={s}>{t(l)}</option>)}
    </select>
  );

  return (
    <Panel title={t("Prometheus metrics")} aside={configured ? aside : undefined}>
      {status.isLoading ? (
        <Empty>{t("Loading")}</Empty>
      ) : !configured ? (
        <Empty>
          {t("Prometheus is not connected.")}{" "}
          <Link to="/settings" className="text-accent underline">{t("Settings")}</Link>
        </Empty>
      ) : q.isError ? (
        <div className="p-4"><ErrorNote error={q.error} /></div>
      ) : q.isLoading ? (
        <Empty>{t("Loading")}</Empty>
      ) : panels.length === 0 ? (
        <Empty>{t("Prometheus has no data for this device. It needs node_exporter (or blackbox_exporter) scraped with this device's IP address as the instance.")}</Empty>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {panels.map((p) => (
            <div key={p.id} className="min-w-0 rounded-md border border-line p-3">
              <h3 className="mb-2 text-sm font-semibold">{t(p.title)}{p.unit && <span className="ms-1 text-xs font-normal text-dim"><bdi className="ltr">({p.unit})</bdi></span>}</h3>
              <SeriesChart series={p.series} unit={p.unit} range={range} height={180} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
