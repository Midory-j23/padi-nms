import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "../api/client";
import type { Service } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { listFrom, num } from "../lib/extract";
import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { Empty, ErrorNote } from "../components/ui";
import Pager from "../components/Pager";

const PAGE_SIZE = 25;
const LABEL = ["Ok", "Warning", "Critical"];
const TONE = ["text-up", "text-warn", "text-down"];
const DOT = ["bg-up", "bg-warn", "bg-down"];

export const serviceLevel = (s: Service) => {
  const n = num(s.service_status);
  return n === undefined ? 2 : Math.min(2, Math.max(0, n));
};

export default function Services() {
  const { t } = useI18n();
  const f = useFormat();
  const { ms } = useRefresh();
  const q = useQuery({ queryKey: ["services"], queryFn: api.services, refetchInterval: ms });
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices, refetchInterval: ms });
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("all");
  const [page, setPage] = useState(0);

  const names = useMemo(() => {
    const m = new Map<number, string>();
    (devices.data?.data ?? []).forEach((d) => m.set(d.device_id, d.sysName || d.hostname));
    return m;
  }, [devices.data]);

  const all = useMemo(() => (q.data ? listFrom<Service>(q.data.data, "services") : []), [q.data]);
  const devName = (s: Service) => (s.device_id !== undefined ? names.get(s.device_id) : undefined) ?? s.hostname ?? "—";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all
      .filter((s) => {
        if (level === "problem" && serviceLevel(s) === 0) return false;
        if (level !== "all" && level !== "problem" && serviceLevel(s) !== Number(level)) return false;
        if (!term) return true;
        return [s.service_type, s.service_desc, s.service_name, s.service_message, devName(s)].some((v) => v?.toLowerCase().includes(term));
      })
      .sort((a, b) => serviceLevel(b) - serviceLevel(a) || devName(a).localeCompare(devName(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, level, names]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const bad = all.filter((s) => serviceLevel(s) > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Services")}</h1>
          <p className="mt-1 text-sm text-dim">{q.isLoading ? t("Loading services") : t("{n} services, {bad} not ok", { n: f.num(all.length), bad: f.num(bad) })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-auto">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={t("Search service, device, message")} aria-label={t("Search services")} className="w-full rounded-md border border-line bg-panel py-2 ps-9 sm:w-72 pe-3 text-sm placeholder:text-dim" />
          </div>
          <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(0); }} aria-label={t("Filter by status")} className="rounded-md border border-line bg-panel px-3 py-2 text-sm">
            <option value="all">{t("All statuses")}</option>
            <option value="problem">{t("Not ok")}</option>
            <option value="0">{t("Ok")}</option>
            <option value="1">{t("Warning")}</option>
            <option value="2">{t("Critical")}</option>
          </select>
        </div>
      </div>

      <ErrorNote error={q.error} />

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="rt w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-dim">
            <tr>
              {["Status", "Service", "Device", "Message", "Changed"].map((h) => (
                <th key={h} scope="col" className="px-4 py-2.5 text-start font-medium">{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((s, i) => {
              const l = serviceLevel(s);
              return (
                <tr key={s.service_id ?? i} className="hover:bg-sunken/60">
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${TONE[l]}`}>
                      <span className={`h-2 w-2 rounded-full ${DOT[l]}`} aria-hidden />
                      {t(LABEL[l])}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{s.service_type || s.service_name || t("Service")}</div>
                    {s.service_desc && <div className="text-xs text-dim">{s.service_desc}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.device_id !== undefined ? <Link to={`/devices/${s.device_id}`} className="text-accent hover:underline">{devName(s)}</Link> : devName(s)}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-dim" dir="auto" title={s.service_message}>{s.service_message || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums">{f.epoch(s.service_changed)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!q.isLoading && visible.length === 0 && (
          <Empty>{all.length === 0 ? t("No services are configured in LibreNMS.") : t("No services match these filters.")}</Empty>
        )}
      </div>
      <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
