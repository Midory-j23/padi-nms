import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { api } from "../api/client";
import type { Alert } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { useFormat } from "../lib/format";
import { isolate, useI18n } from "../lib/i18n";
import { Empty, ErrorNote } from "../components/ui";
import Pager from "../components/Pager";

const PAGE_SIZE = 25;
type StateFilter = "active" | "acknowledged" | "all";

const STATE_QUERY: Record<StateFilter, string> = { active: "state=1", acknowledged: "state=2", all: "" };

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-down/15 text-down",
  warning: "bg-warn/15 text-warn",
  ok: "bg-up/15 text-up",
};

const alertId = (a: Alert) => a.alert_id ?? a.id;
const ruleName = (a: Alert, t: (k: string, v?: Record<string, string | number>) => string) =>
  a.rule || a.rule_name || a.name || (a.rule_id !== undefined ? t("Rule {id}", { id: a.rule_id }) : t("Alert"));

const SEVERITY_LABEL: Record<string, string> = { critical: "Critical", warning: "Warning", ok: "Ok" };

function SeverityBadge({ severity }: { severity?: string }) {
  const { t } = useI18n();
  const key = (severity || "").toLowerCase();
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_TONE[key] ?? "bg-sunken text-dim"}`}>
      {SEVERITY_LABEL[key] ? t(SEVERITY_LABEL[key]) : severity ? severity[0].toUpperCase() + severity.slice(1) : t("Unknown")}
    </span>
  );
}

function AckDialog({ alert, onClose }: { alert: Alert | null; onClose: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const ref = useRef<HTMLDialogElement>(null);
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [untilClear, setUntilClear] = useState(true);

  const ack = useMutation({
    mutationFn: () => api.ackAlert(alertId(alert!)!, { note: note.trim() || undefined, until_clear: untilClear }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      onClose();
    },
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (alert && !d.open) {
      setNote("");
      setUntilClear(true);
      ack.reset();
      d.showModal();
    }
    if (!alert && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert]);

  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-md rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/50">
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold">{t("Acknowledge alert")}</h2>
          {alert && <p className="mt-1 text-sm text-dim">{t("{rule} on {device}", { rule: isolate(ruleName(alert, t)), device: isolate(alert.sysName || alert.hostname || t("device {id}", { id: alert.device_id !== undefined ? f.num(alert.device_id) : "" })) })}</p>}
        </div>
        <label className="block text-sm">
          {t("Note (optional)")}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={untilClear} onChange={(e) => setUntilClear(e.target.checked)} className="mt-0.5" />
          <span>{t("Keep acknowledged until the alert clears")}</span>
        </label>
        {ack.error && <ErrorNote error={ack.error} />}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{t("Cancel")}</button>
          <button onClick={() => ack.mutate()} disabled={ack.isPending} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60">
            {ack.isPending ? t("Acknowledging") : t("Acknowledge")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default function Alerts() {
  const { t } = useI18n();
  const f = useFormat();
  const { ms } = useRefresh();
  const [state, setState] = useState<StateFilter>("active");
  const [severity, setSeverity] = useState("all");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<Alert | null>(null);

  const query = [STATE_QUERY[state], severity !== "all" ? `severity=${severity}` : ""].filter(Boolean).join("&");
  const q = useQuery({ queryKey: ["alerts", query], queryFn: () => api.alerts(query ? `?${query}` : ""), refetchInterval: ms });
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices, refetchInterval: ms });

  const names = useMemo(() => {
    const m = new Map<number, string>();
    (devices.data?.data ?? []).forEach((d) => m.set(d.device_id, d.sysName || d.hostname));
    return m;
  }, [devices.data]);

  const rows = useMemo(
    () => [...(q.data?.data ?? [])].sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")),
    [q.data],
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Alerts")}</h1>
          <p className="mt-1 text-sm text-dim">{q.isLoading ? t("Loading alerts") : t(state === "active" ? "{n} active" : state === "acknowledged" ? "{n} acknowledged" : "{n} alerts", { n: f.num(rows.length) })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label={t("Alert state")}>
            {(["active", "acknowledged", "all"] as StateFilter[]).map((s) => (
              <button key={s} onClick={() => { setState(s); setPage(0); }} aria-pressed={state === s} className={`px-3 py-2 ${state === s ? "bg-accent/10 font-semibold text-accent" : "bg-panel hover:bg-sunken"}`}>
                {t(s === "active" ? "Active" : s === "acknowledged" ? "Acknowledged" : "All")}
              </button>
            ))}
          </div>
          <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(0); }} aria-label={t("Filter by severity")} className="rounded-md border border-line bg-panel px-3 py-2 text-sm">
            <option value="all">{t("All severities")}</option>
            <option value="critical">{t("Critical")}</option>
            <option value="warning">{t("Warning")}</option>
            <option value="ok">{t("Ok")}</option>
          </select>
        </div>
      </div>

      <ErrorNote error={q.error} />

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="rt w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-dim">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Severity")}</th>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Alert")}</th>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Device")}</th>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Raised")}</th>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("State")}</th>
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">{t("Actions")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((a, i) => {
              const dev = a.device_id !== undefined ? names.get(a.device_id) : undefined;
              const label = dev ?? a.sysName ?? a.hostname ?? "—";
              return (
                <tr key={alertId(a) ?? i} className="hover:bg-sunken/60">
                  <td className="px-4 py-2.5"><SeverityBadge severity={a.severity} /></td>
                  <td className="px-4 py-2.5 font-medium" dir="auto">{ruleName(a, t)}</td>
                  <td className="px-4 py-2.5">
                    {a.device_id !== undefined ? <Link to={`/devices/${a.device_id}`} className="text-accent hover:underline">{label}</Link> : label}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{f.dateString(a.timestamp)}</td>
                  <td className="px-4 py-2.5">{a.state === 2 ? t("Acknowledged") : a.state === 1 ? t("Active") : t("Cleared")}</td>
                  <td className="px-4 py-2.5 text-end">
                    {a.state === 1 && alertId(a) !== undefined && (
                      <button onClick={() => setTarget(a)} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs hover:bg-sunken">
                        <Check size={12} aria-hidden /> {t("Acknowledge")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!q.isLoading && visible.length === 0 && (
          <Empty>{state === "active" && severity === "all" ? t("No active alerts. Everything is running within its rules.") : t("No alerts match these filters.")}</Empty>
        )}
      </div>

      <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
      <AckDialog alert={target} onClose={() => setTarget(null)} />
    </div>
  );
}
