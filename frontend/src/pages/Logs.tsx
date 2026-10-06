import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "../api/client";
import type { LogEntry } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { listFrom } from "../lib/extract";
import { Empty, ErrorNote } from "../components/ui";
import Pager from "../components/Pager";

const PAGE_SIZE = 50;
const KINDS = [
  { id: "eventlog", label: "Events" },
  { id: "syslog", label: "Syslog" },
  { id: "alertlog", label: "Alert history" },
];
// Event log severities from the LibreNMS docs examples (UNVERIFIED for syslog and alert log).
const SEVERITY: Record<string, { label: string; tone: string }> = {
  "1": { label: "Ok", tone: "bg-up/15 text-up" },
  "2": { label: "Info", tone: "bg-info/15 text-info" },
  "3": { label: "Notice", tone: "bg-info/15 text-info" },
  "4": { label: "Warning", tone: "bg-warn/15 text-warn" },
  "5": { label: "Error", tone: "bg-down/15 text-down" },
};

export const entryText = (e: LogEntry) => e.message ?? e.msg ?? "";
export const entryTime = (e: LogEntry) => e.datetime ?? e.timestamp ?? "";

export default function Logs() {
  const { t } = useI18n();
  const f = useFormat();
  const { ms } = useRefresh();
  const [kind, setKind] = useState("eventlog");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const q = useQuery({
    queryKey: ["events", kind],
    queryFn: () => api.events({ type: kind, limit: 500 }),
    refetchInterval: ms,
  });
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices, refetchInterval: ms });

  const names = useMemo(() => {
    const m = new Map<number, string>();
    (devices.data?.data ?? []).forEach((d) => m.set(d.device_id, d.sysName || d.hostname));
    return m;
  }, [devices.data]);

  const all = useMemo(() => (q.data ? listFrom<LogEntry>(q.data.data, "logs") : []), [q.data]);
  const devName = (e: LogEntry) => (e.device_id !== undefined ? names.get(e.device_id) : undefined) ?? e.hostname ?? "—";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((e) => !term || [entryText(e), devName(e), e.type, e.program].some((v) => v?.toLowerCase().includes(term)))
      .sort((a, b) => entryTime(b).localeCompare(entryTime(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, names]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Logs")}</h1>
          <p className="mt-1 text-sm text-dim">{q.isLoading ? t("Loading logs") : t("Latest {n} entries", { n: f.num(all.length) })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label={t("Log type")}>
            {KINDS.map((k) => (
              <button key={k.id} onClick={() => { setKind(k.id); setPage(0); }} aria-pressed={kind === k.id} className={`px-3 py-2 ${kind === k.id ? "bg-accent/10 font-semibold text-accent" : "bg-panel hover:bg-sunken"}`}>
                {t(k.label)}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-auto">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={t("Search message or device")} aria-label={t("Search logs")} className="w-full rounded-md border border-line bg-panel py-2 ps-9 sm:w-64 pe-3 text-sm placeholder:text-dim" />
          </div>
        </div>
      </div>

      <ErrorNote error={q.error} />

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="rt w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-dim">
            <tr>
              {["Time", "Device", "Level", "Message"].map((h) => (
                <th key={h} scope="col" className="px-4 py-2.5 text-start font-medium">{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((e, i) => {
              const sev = SEVERITY[String(e.severity)];
              return (
                <tr key={e.event_id ?? i} className="align-top hover:bg-sunken/60">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{f.dateString(entryTime(e))}</td>
                  <td className="px-4 py-2.5">
                    {e.device_id !== undefined ? <Link to={`/devices/${e.device_id}`} className="text-accent hover:underline">{devName(e)}</Link> : devName(e)}
                  </td>
                  <td className="px-4 py-2.5">
                    {sev ? <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${sev.tone}`}>{t(sev.label)}</span> : <span className="text-dim">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span dir="auto">{entryText(e) || "—"}</span>
                    {(e.type || e.program) && <div className="text-xs text-dim">{e.type || e.program}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!q.isLoading && visible.length === 0 && <Empty>{all.length === 0 ? t("No log entries returned.") : t("No entries match this search.")}</Empty>}
      </div>
      <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
