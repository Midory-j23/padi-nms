import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "../api/client";
import type { Availability as Avail } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { listFrom, num } from "../lib/extract";
import { isUp, useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { Empty, ErrorNote, StatusBadge } from "../components/ui";
import Pager from "../components/Pager";

const PAGE_SIZE = 25;
const PERIODS = [
  { seconds: 86400, label: "24 hours" },
  { seconds: 604800, label: "7 days" },
  { seconds: 2592000, label: "30 days" },
  { seconds: 31536000, label: "1 year" },
];

// No bulk availability endpoint exists, so each visible row loads its own.
function AvailabilityCells({ id }: { id: number }) {
  const f = useFormat();
  const { ms } = useRefresh();
  const q = useQuery({
    queryKey: ["device", String(id), "availability"],
    queryFn: () => api.deviceAvailability(id),
    refetchInterval: ms ? ms * 4 : false,
    staleTime: 60_000,
  });
  const list = q.data ? listFrom<Avail>(q.data.data, "availability") : [];
  return (
    <>
      {PERIODS.map((p) => {
        const pct = num(list.find((a) => a.duration === p.seconds)?.availability_perc);
        return (
          <td key={p.seconds} className={`px-4 py-2.5 tabular-nums ${pct !== undefined && pct < 99 ? "font-semibold text-warn" : ""}`}>
            {q.isLoading ? <span className="text-dim">…</span> : pct === undefined ? "—" : f.pct(pct, 2)}
          </td>
        );
      })}
    </>
  );
}

export default function Availability() {
  const { t } = useI18n();
  const { ms } = useRefresh();
  const q = useQuery({ queryKey: ["devices"], queryFn: api.devices, refetchInterval: ms });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data?.data ?? [])
      .filter((d) => !term || [d.hostname, d.sysName, d.ip, d.location].some((v) => v?.toLowerCase().includes(term)))
      .sort((a, b) => Number(isUp(a.status)) - Number(isUp(b.status)) || (a.sysName || a.hostname).localeCompare(b.sysName || b.hostname));
  }, [q.data, search]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Availability")}</h1>
          <p className="mt-1 text-sm text-dim">{t("Share of time each device answered polling. Values under 99% are highlighted.")}</p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
          <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={t("Search name, IP, location")} aria-label={t("Search devices")} className="w-full rounded-md border border-line bg-panel py-2 ps-9 sm:w-72 pe-3 text-sm placeholder:text-dim" />
        </div>
      </div>

      <ErrorNote error={q.error} />

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="rt w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-dim">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Device")}</th>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Status")}</th>
              {PERIODS.map((p) => <th key={p.seconds} scope="col" className="px-4 py-2.5 text-start font-medium">{t(p.label)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((d) => (
              <tr key={d.device_id} className="hover:bg-sunken/60">
                <td className="px-4 py-2.5">
                  <Link to={`/devices/${d.device_id}`} className="font-semibold text-accent hover:underline">{d.sysName || d.hostname}</Link>
                </td>
                <td className="px-4 py-2.5"><StatusBadge up={isUp(d.status)} /></td>
                <AvailabilityCells id={d.device_id} />
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && visible.length === 0 && <Empty>{rows.length === 0 && !search ? t("No devices yet.") : t("No devices match this search.")}</Empty>}
      </div>
      <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
