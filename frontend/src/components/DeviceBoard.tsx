import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Device } from "../api/types";
import { isUp, useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { Empty, Panel } from "./ui";

type Level = "down" | "problem" | "ok" | "unknown";

const ORDER: Level[] = ["down", "problem", "ok", "unknown"];
const STYLE: Record<Level, { tile: string; dot: string }> = {
  down: { tile: "bg-down text-bg", dot: "bg-down" },
  problem: { tile: "bg-warn text-bg", dot: "bg-warn" },
  ok: { tile: "bg-up text-bg", dot: "bg-up" },
  unknown: { tile: "bg-dim text-bg", dot: "bg-dim" },
};

export const deviceName = (d: Device) => d.display || d.sysName || d.hostname;

/** `problems` maps device_id to the number of active alerts / failing services on it. */
export function levelOf(d: Device, problems: Map<number, number>): Level {
  const off = d.disabled === 1 || d.disabled === true || d.ignore === 1 || d.ignore === true;
  if (off || d.status === undefined || d.status === null) return "unknown";
  if (!isUp(d.status)) return "down";
  return (problems.get(d.device_id) ?? 0) > 0 ? "problem" : "ok";
}

export default function DeviceBoard({ devices, problems, loading }: { devices: Device[]; problems: Map<number, number>; loading: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const [levels, setLevels] = useState<Set<Level>>(new Set());
  const [sites, setSites] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const label: Record<Level, string> = { down: t("Down"), problem: t("Problem"), ok: t("Up"), unknown: t("Unknown") };
  const siteOf = (d: Device) => d.location?.trim() || "";

  const rows = useMemo(
    () => devices.map((d) => ({ d, level: levelOf(d, problems) })),
    [devices, problems],
  );
  const counts = useMemo(() => {
    const c: Record<Level, number> = { down: 0, problem: 0, ok: 0, unknown: 0 };
    rows.forEach((r) => { c[r.level]++; });
    return c;
  }, [rows]);
  const allSites = useMemo(
    () => [...new Set(devices.map((d) => d.location?.trim() || "").filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [devices],
  );

  const q = query.trim().toLowerCase();
  const shown = rows
    .filter((r) => levels.size === 0 || levels.has(r.level))
    .filter((r) => sites.size === 0 || sites.has(siteOf(r.d)))
    .filter((r) => !q || [r.d.hostname, r.d.sysName, r.d.display, r.d.ip, r.d.location].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || deviceName(a.d).localeCompare(deviceName(b.d)));

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    apply(n);
  };
  const chip = (on: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${on ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line bg-panel hover:bg-sunken"}`;

  return (
    <Panel
      title={t("Device status")}
      aside={<span className="text-xs text-dim">{t("{n} devices", { n: f.num(shown.length) })}</span>}
    >
      <div className="space-y-3 border-b border-line p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Filter by status")}>
          {ORDER.map((l) => (
            <button key={l} type="button" aria-pressed={levels.has(l)} onClick={() => toggle(levels, l, setLevels)} className={chip(levels.has(l))}>
              <span className={`h-2.5 w-2.5 rounded-full ${STYLE[l].dot}`} aria-hidden />
              {label[l]}
              <span className="tabular-nums text-dim">{f.num(counts[l])}</span>
            </button>
          ))}
        </div>
        {allSites.length > 0 && (
          <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto" role="group" aria-label={t("Filter by site")}>
            {allSites.map((s) => (
              <button key={s} type="button" aria-pressed={sites.has(s)} onClick={() => toggle(sites, s, setSites)} className={chip(sites.has(s))}>
                <bdi>{s}</bdi>
              </button>
            ))}
          </div>
        )}
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)} dir="auto"
          placeholder={t("Search devices")} aria-label={t("Search devices")}
          className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm sm:max-w-xs"
        />
      </div>

      {loading ? (
        <Empty>{t("Loading")}</Empty>
      ) : shown.length === 0 ? (
        <Empty>{rows.length === 0 ? t("No devices yet.") : t("No devices match these filters.")}</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map(({ d, level }) => {
            const n = problems.get(d.device_id) ?? 0;
            return (
              <li key={d.device_id}>
                <Link
                  to={`/devices/${d.device_id}`}
                  title={`${deviceName(d)}${d.ip ? ` · ${d.ip}` : ""}${n ? ` · ${t("{n} active issues", { n: f.num(n) })}` : ""}`}
                  className={`flex h-28 flex-col justify-between rounded-lg p-3 shadow-sm outline-offset-2 transition-opacity hover:opacity-90 sm:h-32 ${STYLE[level].tile}`}
                >
                  <span className="flex items-start justify-between gap-2 text-[11px] font-semibold opacity-90">
                    <span>{label[level]}</span>
                    {n > 0 && level !== "down" && <span className="tabular-nums"><bdi>{f.num(n)}</bdi> ⚠</span>}
                  </span>
                  <span className="line-clamp-3 text-center text-[15px] font-semibold leading-snug" dir="auto">{deviceName(d)}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="max-w-[70%] truncate rounded bg-black/25 px-2 py-0.5 text-[11px] font-semibold" dir="auto">{siteOf(d) || "—"}</span>
                    {d.ip && <bdi className="ltr truncate text-[11px] opacity-90">{d.ip}</bdi>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
