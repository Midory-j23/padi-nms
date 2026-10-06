import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Alert } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { listFrom } from "../lib/extract";
import { isUp, useFormat } from "../lib/format";
import { isolate, useI18n } from "../lib/i18n";
import { Empty, ErrorNote, Panel } from "../components/ui";
import type { LogEntry, Service } from "../api/types";
import { serviceLevel } from "./Services";
import { entryText, entryTime } from "./Logs";

interface Item {
  key: string;
  rank: number; // lower is more urgent
  kind: string;
  tone: string;
  title: string;
  detail: string;
  to: string;
}

const alertTitle = (a: Alert, t: (k: string, v?: Record<string, string | number>) => string) =>
  a.rule || a.rule_name || a.name || (a.rule_id !== undefined ? t("Rule {id}", { id: a.rule_id }) : t("Alert"));

function Stat({ label, value, sub, tone = "text-ink", to }: { label: string; value: string; sub?: string; tone?: string; to: string }) {
  return (
    <Link to={to} className="block bg-panel p-5 hover:bg-sunken/60">
      <div className="text-xs text-dim">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-dim">{sub}</div>}
    </Link>
  );
}

export default function Dashboard() {
  const { t } = useI18n();
  const f = useFormat();
  const { ms } = useRefresh();
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices, refetchInterval: ms });
  const alerts = useQuery({ queryKey: ["alerts", "state=1"], queryFn: () => api.alerts("?state=1"), refetchInterval: ms });
  const services = useQuery({ queryKey: ["services"], queryFn: api.services, refetchInterval: ms });
  const events = useQuery({ queryKey: ["events", "eventlog", "recent"], queryFn: () => api.events({ type: "eventlog", limit: 8 }), refetchInterval: ms });

  const list = devices.data?.data ?? [];
  const names = new Map(list.map((d) => [d.device_id, d.sysName || d.hostname]));
  const down = list.filter((d) => !isUp(d.status));
  const active = alerts.data?.data ?? [];
  const critical = active.filter((a) => (a.severity || "").toLowerCase() === "critical");
  const svc = services.data ? listFrom<Service>(services.data.data, "services") : [];
  const svcBad = svc.filter((s) => serviceLevel(s) > 0);
  const recent = (events.data ? listFrom<LogEntry>(events.data.data, "logs") : []).slice(0, 8);

  const items: Item[] = [
    ...down.map((d): Item => ({
      key: `d${d.device_id}`, rank: 0, kind: t("Device down"), tone: "text-down",
      title: d.sysName || d.hostname, detail: d.ip || d.location || "", to: `/devices/${d.device_id}`,
    })),
    ...active.map((a, i): Item => {
      const crit = (a.severity || "").toLowerCase() === "critical";
      return {
        key: `a${a.alert_id ?? a.id ?? i}`, rank: crit ? 1 : 2, kind: crit ? t("Critical alert") : t("Alert"), tone: crit ? "text-down" : "text-warn",
        title: alertTitle(a, t), detail: (a.device_id !== undefined ? names.get(a.device_id) : undefined) ?? a.sysName ?? a.hostname ?? "",
        to: "/alerts",
      };
    }),
    ...svcBad.map((s, i): Item => ({
      key: `s${s.service_id ?? i}`, rank: serviceLevel(s) === 2 ? 1 : 3, kind: serviceLevel(s) === 2 ? t("Service critical") : t("Service warning"),
      tone: serviceLevel(s) === 2 ? "text-down" : "text-warn",
      title: s.service_type || s.service_name || t("Service"),
      detail: (s.device_id !== undefined ? names.get(s.device_id) : undefined) ?? s.hostname ?? "", to: "/services",
    })),
  ].sort((a, b) => a.rank - b.rank);

  const loading = devices.isLoading || alerts.isLoading;
  const err = devices.error ?? alerts.error;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">{t("Dashboard")}</h1>
      <ErrorNote error={err} />

      <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <Stat to="/devices" label={t("Devices up")} value={devices.isLoading ? "…" : t("{up} of {total}", { up: f.num(list.length - down.length), total: f.num(list.length) })} tone={down.length ? "text-ink" : "text-up"} />
        <Stat to="/devices" label={t("Devices down")} value={devices.isLoading ? "…" : f.num(down.length)} tone={down.length ? "text-down" : "text-ink"} />
        <Stat to="/alerts" label={t("Active alerts")} value={alerts.isLoading ? "…" : f.num(active.length)} sub={critical.length ? t("{n} critical", { n: f.num(critical.length) }) : undefined} tone={critical.length ? "text-down" : active.length ? "text-warn" : "text-ink"} />
        <Stat to="/services" label={t("Services not ok")} value={services.isLoading ? "…" : f.num(svcBad.length)} sub={svc.length ? t("of {n}", { n: f.num(svc.length) }) : undefined} tone={svcBad.length ? "text-warn" : "text-ink"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel title={t("Needs attention")} aside={items.length > 10 ? <span className="text-xs text-dim">{t("Showing 10 of {n}", { n: f.num(items.length) })}</span> : undefined}>
            {loading ? (
              <Empty>{t("Loading")}</Empty>
            ) : items.length === 0 ? (
              <Empty>{t("Nothing needs attention. All devices are up and no alerts are active.")}</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {items.slice(0, 10).map((it) => (
                  <li key={it.key}>
                    <Link to={it.to} className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-sunken/60">
                      <span className="min-w-0">
                        <span className="block truncate font-medium" dir="auto">{it.title}</span>
                        {it.detail && <span className="block truncate text-xs text-dim" dir="auto">{it.detail}</span>}
                      </span>
                      <span className={`shrink-0 text-xs font-semibold ${it.tone}`}>{it.kind}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="lg:col-span-2">
          <Panel title={t("Recent events")} aside={<Link to="/logs" className="text-xs text-accent hover:underline">{t("All logs")}</Link>}>
            {events.isError ? (
              <div className="p-4"><ErrorNote error={events.error} /></div>
            ) : recent.length === 0 ? (
              <Empty>{events.isLoading ? t("Loading") : t("No recent events.")}</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((e, i) => (
                  <li key={e.event_id ?? i} className="px-4 py-3">
                    <div className="text-sm" dir="auto">{entryText(e) || "—"}</div>
                    <div className="mt-0.5 text-xs text-dim tabular-nums">
                      {e.device_id !== undefined && names.get(e.device_id) ? t("{time} on {device}", { time: f.dateString(entryTime(e)), device: isolate(names.get(e.device_id)!) }) : f.dateString(entryTime(e))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
