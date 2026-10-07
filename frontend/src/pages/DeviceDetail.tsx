import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Availability, Outage, Port } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { listFrom, num, summarizeHealth } from "../lib/extract";
import { isUp, useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { Empty, ErrorNote, Meter, Panel, StatusBadge } from "../components/ui";
import OpenPorts from "../components/OpenPorts";
import RemoveDeviceDialog from "../components/RemoveDeviceDialog";

const PERIODS: Record<number, string> = { 86400: "24 hours", 604800: "7 days", 2592000: "30 days", 31536000: "1 year" };

function Fact({ label, value, ltr }: { label: string; value?: string | number | null; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-dim">{label}</dt>
      <dd className="mt-0.5 break-words">{value ? ltr ? <bdi className="ltr">{value}</bdi> : value : "—"}</dd>
    </div>
  );
}

export default function DeviceDetail() {
  const { t, dir } = useI18n();
  const f = useFormat();
  const BackIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const { id = "" } = useParams();
  const { ms } = useRefresh();
  const device = useQuery({ queryKey: ["device", id], queryFn: () => api.device(id), refetchInterval: ms });
  const health = useQuery({ queryKey: ["device", Number(id), "health"], queryFn: () => api.deviceHealth(id), refetchInterval: ms });
  const avail = useQuery({ queryKey: ["device", id, "availability"], queryFn: () => api.deviceAvailability(id), refetchInterval: ms ? ms * 4 : false });
  const outages = useQuery({ queryKey: ["device", id, "outages"], queryFn: () => api.deviceOutages(id), refetchInterval: ms ? ms * 4 : false });
  const ports = useQuery({ queryKey: ["device", id, "ports"], queryFn: () => api.devicePorts(id), refetchInterval: ms });
  const [onlyUp, setOnlyUp] = useState(false);
  const [removing, setRemoving] = useState(false);

  const d = device.data?.data;
  const h = health.data ? summarizeHealth(health.data.data) : undefined;
  const availability = avail.data ? listFrom<Availability>(avail.data.data, "availability") : [];
  const outageList = outages.data ? listFrom<Outage>(outages.data.data, "outages") : [];
  const portList = ports.data ? listFrom<Port>(ports.data.data, "ports") : [];
  const shownPorts = onlyUp ? portList.filter((p) => p.ifOperStatus === "up") : portList;

  return (
    <div className="space-y-5">
      <Link to="/devices" className="inline-flex items-center gap-1 text-sm text-dim hover:text-ink">
        <BackIcon size={14} aria-hidden /> {t("Devices")}
      </Link>

      <ErrorNote error={device.error} />

      {d && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{d.sysName || d.hostname}</h1>
            <StatusBadge up={isUp(d.status)} />
            <button
              onClick={() => setRemoving(true)}
              className="ms-auto flex items-center gap-1.5 rounded-md border border-down/50 px-3 py-1.5 text-sm text-down hover:bg-down/10"
            >
              <Trash2 size={14} aria-hidden /> {t("Remove device")}
            </button>
          </div>
          <RemoveDeviceDialog open={removing} onClose={() => setRemoving(false)} id={id} hostname={d.hostname} label={d.sysName || d.hostname} />

          <Panel title={t("Overview")}>
            <dl className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label={t("Hostname")} value={d.hostname} ltr />
              <Fact label={t("IP address")} value={d.ip} ltr />
              <Fact label={t("Operating system")} value={d.os} />
              <Fact label={t("Hardware")} value={d.hardware} />
              <Fact label={t("Location")} value={d.location} />
              <Fact label={t("Uptime")} value={f.uptime(d.uptime)} />
              <Fact label={t("Last polled")} value={f.dateString(d.last_polled)} />
              <Fact label={t("Type")} value={d.type} />
              <Fact label={t("Serial number")} value={d.serial} ltr />
              <Fact label={t("Firmware version")} value={d.version} ltr />
              <Fact label={t("Monitoring")} value={d.snmp_disable === 1 || d.snmp_disable === true ? t("Ping only") : `SNMP ${d.snmpver ?? ""}`} />
              <Fact label={t("Last ping")} value={d.last_ping ? f.dateString(d.last_ping) : undefined} />
              {!isUp(d.status) && <Fact label={t("Status reason")} value={d.status_reason} />}
              <div className="sm:col-span-2 lg:col-span-4"><Fact label={t("Description")} value={d.sysDescr} ltr /></div>
            </dl>
          </Panel>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("Resources")}>
          {health.isError ? (
            <div className="p-4"><ErrorNote error={health.error} /></div>
          ) : !h ? (
            <Empty>{t("Loading resources")}</Empty>
          ) : h.cpu === undefined && h.memory === undefined && h.storage.length === 0 ? (
            <Empty>{t("No CPU, memory or storage data reported for this device.")}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              <li className="flex items-center justify-between px-4 py-3"><span>{t("CPU")}</span><Meter value={h.cpu} label={t("CPU")} /></li>
              <li className="flex items-center justify-between px-4 py-3"><span>{t("Memory")}</span><Meter value={h.memory} label={t("Memory")} /></li>
              {h.storage.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="truncate" dir="auto">{s.name}</span>
                  <Meter value={s.percent} label={s.name} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("Availability")}>
          {avail.isError ? (
            <div className="p-4"><ErrorNote error={avail.error} /></div>
          ) : availability.length === 0 ? (
            <Empty>{avail.isLoading ? t("Loading availability") : t("No availability data for this device.")}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {availability.map((a, i) => {
                const pct = num(a.availability_perc);
                return (
                  <li key={i} className="flex items-center justify-between px-4 py-3">
                    <span>{t("Last {period}", { period: PERIODS[a.duration ?? 0] ? t(PERIODS[a.duration ?? 0]) : t("{n} days", { n: f.num(Math.round((a.duration ?? 0) / 86400)) }) })}</span>
                    <span className={`font-semibold tabular-nums ${pct !== undefined && pct < 99 ? "text-warn" : ""}`}>
                      {pct === undefined ? "—" : f.pct(pct, 2)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={t("Downtime events")}>
        {outages.isError ? (
          <div className="p-4"><ErrorNote error={outages.error} /></div>
        ) : outageList.length === 0 ? (
          <Empty>{outages.isLoading ? t("Loading downtime events") : t("No downtime recorded.")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="rt w-full min-w-[480px] text-sm">
              <thead className="border-b border-line bg-sunken text-xs text-dim">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Went down")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Came back")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Duration")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...outageList].sort((a, b) => (b.going_down ?? 0) - (a.going_down ?? 0)).slice(0, 50).map((o, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5">{f.epoch(o.going_down)}</td>
                    <td className="px-4 py-2.5">{o.up_again ? f.epoch(o.up_again) : <span className="text-down">{t("Still down")}</span>}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {o.going_down ? f.duration((o.up_again ?? Math.floor(Date.now() / 1000)) - o.going_down) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {d && (d.ip || d.hostname) && /^\d{1,3}(\.\d{1,3}){3}$/.test(String(d.ip || d.hostname)) && (
        <OpenPorts host={String(d.ip || d.hostname)} />
      )}

      <Panel
        title={portList.length ? `${t("Ports")} (${f.num(portList.length)})` : t("Ports")}
        aside={
          <label className="flex items-center gap-2 text-xs text-dim">
            <input type="checkbox" checked={onlyUp} onChange={(e) => setOnlyUp(e.target.checked)} />
            {t("Only ports that are up")}
          </label>
        }
      >
        {ports.isError ? (
          <div className="p-4"><ErrorNote error={ports.error} /></div>
        ) : shownPorts.length === 0 ? (
          <Empty>{ports.isLoading ? t("Loading ports") : t("No ports to show.")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="rt w-full min-w-[720px] text-sm">
              <thead className="border-b border-line bg-sunken text-xs text-dim">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Port")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Status")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Speed")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("In")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Out")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shownPorts.map((p) => (
                  <tr key={p.port_id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium"><bdi className="ltr">{p.ifName || p.ifDescr}</bdi></div>
                      {p.ifAlias && <div className="text-xs text-dim" dir="auto">{p.ifAlias}</div>}
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge up={p.ifOperStatus === "up"} /></td>
                    <td className="px-4 py-2.5 tabular-nums">{f.speed(p.ifSpeed)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{f.bitrate(p.ifInOctets_rate)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{f.bitrate(p.ifOutOctets_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

