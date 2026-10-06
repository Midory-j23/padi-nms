import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { api } from "../api/client";
import type { Port } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { listFrom, num } from "../lib/extract";
import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { Empty, ErrorNote, StatusBadge } from "../components/ui";
import Pager from "../components/Pager";

const PAGE_SIZE = 50;
type SortKey = "device" | "port" | "status" | "speed" | "in" | "out";

export default function Ports() {
  const { t } = useI18n();
  const f = useFormat();
  const { ms } = useRefresh();
  const ports = useQuery({ queryKey: ["ports"], queryFn: api.ports, refetchInterval: ms });
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices, refetchInterval: ms });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "up" | "down">("all");
  const [deviceId, setDeviceId] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "device", dir: 1 });
  const [page, setPage] = useState(0);

  const names = useMemo(() => {
    const m = new Map<number, string>();
    (devices.data?.data ?? []).forEach((d) => m.set(d.device_id, d.sysName || d.hostname));
    return m;
  }, [devices.data]);

  const all = useMemo(() => (ports.data ? listFrom<Port>(ports.data.data, "ports") : []), [ports.data]);
  const deviceName = (p: Port) => (p.device_id !== undefined ? names.get(p.device_id) : undefined) ?? p.hostname ?? "—";

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = all.filter((p) => {
      const up = p.ifOperStatus === "up";
      if (status === "up" && !up) return false;
      if (status === "down" && up) return false;
      if (deviceId !== "all" && String(p.device_id) !== deviceId) return false;
      if (!term) return true;
      return [p.ifName, p.ifDescr, p.ifAlias, deviceName(p)].some((v) => v?.toLowerCase().includes(term));
    });
    const val = (p: Port): string | number => {
      switch (sort.key) {
        case "device": return deviceName(p).toLowerCase();
        case "port": return (p.ifName || p.ifDescr || "").toLowerCase();
        case "status": return p.ifOperStatus === "up" ? 1 : 0;
        case "speed": return num(p.ifSpeed) ?? -1;
        case "in": return num(p.ifInOctets_rate) ?? -1;
        case "out": return num(p.ifOutOctets_rate) ?? -1;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.port_id - b.port_id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, search, status, deviceId, sort, names]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const downCount = all.filter((p) => p.ifOperStatus !== "up").length;

  const deviceOptions = useMemo(
    () => [...names.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [names],
  );

  const header = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="px-4 py-2.5 text-start font-medium">
      <button className="flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "in" || key === "out" || key === "speed" ? -1 : 1 }))}>
        {t(label)}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Ports")}</h1>
          <p className="mt-1 text-sm text-dim">{ports.isLoading ? t("Loading ports") : t("{n} ports, {down} not up", { n: f.num(all.length), down: f.num(downCount) })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-auto">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={t("Search port, label, device")} aria-label={t("Search ports")} className="w-full rounded-md border border-line bg-panel py-2 ps-9 sm:w-72 pe-3 text-sm placeholder:text-dim" />
          </div>
          <select
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => { const [k, d] = e.target.value.split(":"); setSort({ key: k as SortKey, dir: Number(d) as 1 | -1 }); }}
            aria-label={t("Sort by")}
            className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm sm:hidden"
          >
            {([["device", "Device"], ["port", "Port"], ["status", "Status"], ["speed", "Speed"], ["in", "In"], ["out", "Out"]] as [SortKey, string][]).flatMap(([k, l]) => [
              <option key={`${k}:1`} value={`${k}:1`}>{t("Sort by")}: {t(l)} ↑</option>,
              <option key={`${k}:-1`} value={`${k}:-1`}>{t("Sort by")}: {t(l)} ↓</option>,
            ])}
          </select>
          <select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); setPage(0); }} aria-label={t("Filter by device")} className="w-full rounded-md sm:w-auto sm:max-w-[200px] border border-line bg-panel px-3 py-2 text-sm">
            <option value="all">{t("All devices")}</option>
            {deviceOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }} aria-label={t("Filter by status")} className="rounded-md border border-line bg-panel px-3 py-2 text-sm">
            <option value="all">{t("All statuses")}</option>
            <option value="up">{t("Up")}</option>
            <option value="down">{t("Not up")}</option>
          </select>
        </div>
      </div>

      <ErrorNote error={ports.error} />

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="rt w-full min-w-[760px] text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-dim">
            <tr>
              {header("device", "Device")}
              {header("port", "Port")}
              {header("status", "Status")}
              {header("speed", "Speed")}
              {header("in", "In")}
              {header("out", "Out")}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((p) => (
              <tr key={p.port_id} className="hover:bg-sunken/60">
                <td className="px-4 py-2.5">
                  {p.device_id !== undefined ? (
                    <Link to={`/devices/${p.device_id}`} className="text-accent hover:underline">{deviceName(p)}</Link>
                  ) : deviceName(p)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="font-medium"><bdi className="ltr">{p.ifName || p.ifDescr || t("Port {id}", { id: f.num(p.port_id) })}</bdi></div>
                  {p.ifAlias && <div className="text-xs text-dim" dir="auto">{p.ifAlias}</div>}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge up={p.ifOperStatus === "up"} />
                  {p.ifAdminStatus === "down" && <div className="text-xs text-dim">{t("Disabled")}</div>}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{f.speed(num(p.ifSpeed))}</td>
                <td className="px-4 py-2.5 tabular-nums">{f.bitrate(num(p.ifInOctets_rate))}</td>
                <td className="px-4 py-2.5 tabular-nums">{f.bitrate(num(p.ifOutOctets_rate))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ports.isLoading && visible.length === 0 && <Empty>{all.length === 0 ? t("No ports reported yet.") : t("No ports match these filters.")}</Empty>}
      </div>

      <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
