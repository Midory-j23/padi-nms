import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Search } from "lucide-react";
import { api } from "../api/client";
import type { Device } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { summarizeHealth } from "../lib/extract";
import { isUp, useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { Empty, ErrorNote, Meter, StatusBadge } from "../components/ui";
import Pager from "../components/Pager";

const PAGE_SIZE = 25;

type SortKey = "hostname" | "status" | "os" | "location" | "uptime";

// CPU and memory have no bulk endpoint, so each visible row fetches its own.
// Only rows on the current page are mounted, which keeps this to PAGE_SIZE requests.
function LoadCells({ id }: { id: number }) {
  const { t } = useI18n();
  const { ms } = useRefresh();
  const q = useQuery({
    queryKey: ["device", id, "health"],
    queryFn: () => api.deviceHealth(id),
    refetchInterval: ms ? ms * 2 : false,
    staleTime: 30_000,
  });
  const h = q.data ? summarizeHealth(q.data.data) : undefined;
  if (q.isLoading) {
    return (
      <>
        <td className="px-4 py-2.5 text-dim">…</td>
        <td className="px-4 py-2.5 text-dim">…</td>
      </>
    );
  }
  return (
    <>
      <td className="px-4 py-2.5"><Meter value={h?.cpu} label={t("CPU")} /></td>
      <td className="px-4 py-2.5"><Meter value={h?.memory} label={t("Memory")} /></td>
    </>
  );
}

export default function Devices() {
  const { t } = useI18n();
  const f = useFormat();
  const { ms } = useRefresh();
  const q = useQuery({ queryKey: ["devices"], queryFn: api.devices, refetchInterval: ms });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "up" | "down">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [page, setPage] = useState(0);

  const all = q.data?.data ?? [];

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = all.filter((d) => {
      if (status === "up" && !isUp(d.status)) return false;
      if (status === "down" && isUp(d.status)) return false;
      if (!term) return true;
      return [d.hostname, d.sysName, d.ip, d.os, d.hardware, d.location].some((v) => v?.toLowerCase().includes(term));
    });
    const val = (d: Device) => {
      switch (sort.key) {
        case "hostname": return (d.sysName || d.hostname || "").toLowerCase();
        case "status": return isUp(d.status) ? 1 : 0; // down first when ascending
        case "os": return (d.os || "").toLowerCase();
        case "location": return (d.location || "").toLowerCase();
        case "uptime": return d.uptime ?? -1;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || (a.hostname || "").localeCompare(b.hostname || "");
    });
  }, [all, search, status, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const downCount = all.filter((d) => !isUp(d.status)).length;

  const header = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="px-4 py-2.5 text-start font-medium">
      <button
        className="flex items-center gap-1 hover:text-ink"
        onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))}
      >
        {t(label)}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Devices")}</h1>
          <p className="mt-1 text-sm text-dim">
            {q.isLoading ? t("Loading devices") : t("{n} devices, {down} down", { n: f.num(all.length), down: f.num(downCount) })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/devices/new" className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg">
            <Plus size={14} aria-hidden /> {t("Add device")}
          </Link>
          <Link to="/devices/scan" className="rounded-md border border-line px-3 py-2 text-sm hover:bg-sunken">{t("Scan network")}</Link>
          <div className="relative w-full sm:w-auto">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder={t("Search name, IP, OS, location")}
              aria-label={t("Search devices")}
              className="w-full rounded-md border border-line bg-panel py-2 ps-9 sm:w-72 pe-3 text-sm placeholder:text-dim"
            />
          </div>
          <select
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => { const [k, d] = e.target.value.split(":"); setSort({ key: k as SortKey, dir: Number(d) as 1 | -1 }); }}
            aria-label={t("Sort by")}
            className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm sm:hidden"
          >
            {([["hostname", "Device"], ["status", "Status"], ["os", "OS"], ["location", "Location"], ["uptime", "Uptime"]] as [SortKey, string][]).flatMap(([k, l]) => [
              <option key={`${k}:1`} value={`${k}:1`}>{t("Sort by")}: {t(l)} ↑</option>,
              <option key={`${k}:-1`} value={`${k}:-1`}>{t("Sort by")}: {t(l)} ↓</option>,
            ])}
          </select>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}
            aria-label={t("Filter by status")}
            className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
          >
            <option value="all">{t("All statuses")}</option>
            <option value="up">{t("Up")}</option>
            <option value="down">{t("Down")}</option>
          </select>
        </div>
      </div>

      <ErrorNote error={q.error} />

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="rt w-full min-w-[820px] text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-dim">
            <tr>
              {header("hostname", "Device")}
              {header("status", "Status")}
              {header("os", "OS")}
              {header("location", "Location")}
              {header("uptime", "Uptime")}
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("CPU")}</th>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Memory")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((d) => (
              <tr key={d.device_id} className="hover:bg-sunken/60">
                <td className="px-4 py-2.5">
                  <Link to={`/devices/${d.device_id}`} className="font-semibold text-accent hover:underline">
                    {d.sysName || d.hostname}
                  </Link>
                  {d.ip && <div className="font-mono text-xs text-dim"><bdi className="ltr">{d.ip}</bdi></div>}
                </td>
                <td className="px-4 py-2.5"><StatusBadge up={isUp(d.status)} /></td>
                <td className="px-4 py-2.5">
                  {d.os || "—"}
                  {d.hardware && <div className="text-xs text-dim">{d.hardware}</div>}
                </td>
                <td className="px-4 py-2.5">{d.location || "—"}</td>
                <td className="px-4 py-2.5 tabular-nums">{f.uptime(d.uptime)}</td>
                <LoadCells id={d.device_id} />
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && visible.length === 0 && (
          <Empty>{all.length === 0 ? t("No devices yet. Add devices in LibreNMS and they appear here.") : t("No devices match these filters.")}</Empty>
        )}
      </div>

      <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
