import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import type { Port } from "../api/types";
import { listFrom, num } from "../lib/extract";
import { useTheme } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { useFormat } from "../lib/format";
import { useIntervalLabel } from "../lib/refresh";
import { Empty, ErrorNote, Panel } from "../components/ui";

const MAX_POINTS = 120;
const INTERVALS = [15, 30, 60, 300];
interface Sample { t: number; time: string; inMbit?: number; outMbit?: number }

export default function Performance() {
  const { t } = useI18n();
  const f = useFormat();
  const intervalLabel = useIntervalLabel();
  const { theme } = useTheme();
  const colors = theme === "dark" ? { inn: "#40bed6", out: "#e8a634", grid: "#284252", text: "#8c9dad" } : { inn: "#0e7490", out: "#c4780a", grid: "#d6dde4", text: "#607080" };

  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices });
  const [deviceId, setDeviceId] = useState("");
  const [portId, setPortId] = useState("");
  const [every, setEvery] = useState(60);
  const [samples, setSamples] = useState<Sample[]>([]);
  const lastKey = useRef("");

  const ports = useQuery({ queryKey: ["device", deviceId, "ports"], queryFn: () => api.devicePorts(deviceId), enabled: !!deviceId });
  const portList = useMemo(() => (ports.data ? listFrom<Port>(ports.data.data, "ports") : []), [ports.data]);

  // Poll the chosen device's ports and keep a rolling buffer for the selected port.
  const poll = useQuery({
    queryKey: ["perf", deviceId, portId],
    queryFn: () => api.devicePorts(deviceId),
    enabled: !!deviceId && !!portId,
    refetchInterval: every * 1000,
    staleTime: 0,
  });

  useEffect(() => {
    const key = `${deviceId}/${portId}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      setSamples([]);
    }
  }, [deviceId, portId]);

  useEffect(() => {
    if (!poll.data || !portId) return;
    const port = listFrom<Port>(poll.data.data, "ports").find((p) => String(p.port_id) === portId);
    if (!port) return;
    // UNVERIFIED: *_rate fields assumed to be bytes per second.
    const toMbit = (v: unknown) => { const n = num(v); return n === undefined ? undefined : (n * 8) / 1e6; };
    const now = new Date();
    setSamples((s) => [...s, { t: now.getTime(), time: f.clock(now), inMbit: toMbit(port.ifInOctets_rate), outMbit: toMbit(port.ifOutOctets_rate) }].slice(-MAX_POINTS));
  }, [poll.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedDevices = useMemo(() => [...(devices.data?.data ?? [])].sort((a, b) => (a.sysName || a.hostname).localeCompare(b.sysName || b.hostname)), [devices.data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Performance")}</h1>
        <p className="mt-1 max-w-prose text-sm text-dim">
          {t("Live traffic for one port. The chart starts when you pick a port and only covers the time this page stays open.")}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-dim">
          {t("Device")}
          <select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); setPortId(""); }} className="mt-1 block w-full rounded-md sm:w-60 border border-line bg-panel px-3 py-2 text-sm text-ink">
            <option value="">{t("Choose a device")}</option>
            {sortedDevices.map((d) => <option key={d.device_id} value={d.device_id}>{d.sysName || d.hostname}</option>)}
          </select>
        </label>
        <label className="text-xs text-dim">
          {t("Port")}
          <select value={portId} onChange={(e) => setPortId(e.target.value)} disabled={!deviceId} className="mt-1 block w-full rounded-md sm:w-60 border border-line bg-panel px-3 py-2 text-sm text-ink disabled:opacity-50">
            <option value="">{ports.isLoading ? t("Loading ports") : t("Choose a port")}</option>
            {portList.map((p) => <option key={p.port_id} value={p.port_id}>{p.ifName || p.ifDescr}{p.ifAlias ? ` (${p.ifAlias})` : ""}</option>)}
          </select>
        </label>
        <label className="text-xs text-dim">
          {t("Sample every")}
          <select value={every} onChange={(e) => setEvery(Number(e.target.value))} className="mt-1 block rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink">
            {INTERVALS.map((s) => <option key={s} value={s}>{intervalLabel(s)}</option>)}
          </select>
        </label>
      </div>

      <ErrorNote error={devices.error ?? ports.error ?? poll.error} />

      <Panel title={t("Traffic")} aside={samples.length ? <span className="text-xs text-dim">{t("{n} samples", { n: f.num(samples.length) })}</span> : undefined}>
        {!portId ? (
          <Empty>{t("Choose a device and a port to start charting.")}</Empty>
        ) : samples.length < 2 ? (
          <Empty>{t("Waiting for the second sample. The next one arrives within {wait}.", { wait: intervalLabel(every) })}</Empty>
        ) : (
          <div className="h-80 p-4" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={samples} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke={colors.text} fontSize={11} minTickGap={40} />
                <YAxis stroke={colors.text} fontSize={11} unit=" Mbit/s" width={80} tickFormatter={(v) => f.num(Number(v), 1)} />
                <Tooltip formatter={(v) => (typeof v === "number" ? `${f.num(v, 2)} Mbit/s` : v)} />
                <Legend />
                <Line type="monotone" dataKey="inMbit" name={t("In")} stroke={colors.inn} dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line type="monotone" dataKey="outMbit" name={t("Out")} stroke={colors.out} dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-dim">
          {t("LibreNMS recalculates these rates only when it polls the device, every 5 minutes by default. Sampling faster than that repeats the same value.")}
        </p>
      </Panel>

      <Panel title={t("History")}>
        <Empty>
          {t("Charts for the last hour to the last 30 days need a metric store (Prometheus or InfluxDB). They are not wired up yet.")}
        </Empty>
      </Panel>
    </div>
  );
}
