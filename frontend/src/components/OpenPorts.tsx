import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useI18n } from "../lib/i18n";
import { ErrorNote, Panel } from "./ui";

interface Job { id: string; host: string; status: "running" | "done" | "cancelled" | "error"; total: number; scanned: number; open: { port: number; service: string }[] }

const inputCls = "rounded-md border border-line bg-bg px-3 py-2 text-sm";

/** Port scanner: IP, "known ports" or a range (1-65535), Start scan, live list of listening ports.
 *  With `host` set it scans that device; otherwise it asks for an IP. */
export default function OpenPorts({ host }: { host?: string }) {
  const { t } = useI18n();
  const [ip, setIp] = useState(host ?? "");
  const [mode, setMode] = useState<"known" | "range">("known");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("65535");
  const [job, setJob] = useState<Job | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { if (host) setIp(host); }, [host]);
  useEffect(() => () => window.clearInterval(timer.current), []); // stop polling when the page closes

  const running = job?.status === "running";

  // Follow a running scan; results appear as they are found.
  useEffect(() => {
    if (!job || job.status !== "running") return;
    const id = job.id;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      try {
        const res = await api.portScanStatus(id);
        const j = res.data as Job;
        setJob(j);
        if (j.status !== "running") window.clearInterval(timer.current);
      } catch (e) {
        window.clearInterval(timer.current);
        setError(e);
      }
    }, 700);
    return () => window.clearInterval(timer.current);
  }, [job?.id, job?.status]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const target = ip.trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(target)) { setProblem("Enter a valid IPv4 address."); return; }
    const a = Number(from), b = Number(to);
    if (mode === "range" && !(Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b <= 65535 && a <= b)) {
      setProblem("Enter a port range between 1 and 65535."); return;
    }
    setProblem(null);
    setStarting(true);
    try {
      const res = await api.startPortScan(target, mode, a, b);
      setJob(res.data as Job);
    } catch (err) {
      setError(err);
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    if (!job) return;
    try { setJob((await api.cancelPortScan(job.id)).data as Job); } catch (e) { setError(e); }
  };

  const pct = job && job.total ? Math.min(100, Math.round((job.scanned / job.total) * 100)) : 0;

  return (
    <Panel title={t("Port scan")}>
      <form onSubmit={start} className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <label className="block text-sm">
            {t("IP address")}
            <input
              value={ip} onChange={(e) => setIp(e.target.value)} dir="ltr" readOnly={!!host} disabled={running}
              placeholder="192.168.1.10" className={`${inputCls} mt-1 block w-full sm:w-44`}
            />
          </label>
          <fieldset className="space-y-2 text-sm" disabled={running}>
            <legend className="sr-only">{t("Ports to scan")}</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name={`mode-${host ?? "any"}`} checked={mode === "known"} onChange={() => setMode("known")} />
              {t("Scan only known ports")}
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="radio" name={`mode-${host ?? "any"}`} checked={mode === "range"} onChange={() => setMode("range")} />
              {t("Scan ports range")}
              <input value={from} onChange={(e) => setFrom(e.target.value)} onFocus={() => setMode("range")} inputMode="numeric" dir="ltr" aria-label={t("From port")} className={`${inputCls} w-20`} />
              <span aria-hidden>→</span>
              <input value={to} onChange={(e) => setTo(e.target.value)} onFocus={() => setMode("range")} inputMode="numeric" dir="ltr" aria-label={t("To port")} className={`${inputCls} w-24`} />
            </label>
          </fieldset>
          {running ? (
            <button type="button" onClick={stop} className="rounded-md border border-line px-4 py-2 text-sm font-semibold hover:bg-sunken">{t("Stop scan")}</button>
          ) : (
            <button type="submit" disabled={starting} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60">{t("Start scan")}</button>
          )}
        </div>
        {problem && <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{t(problem)}</div>}
        <ErrorNote error={error} />
      </form>

      {job && (
        <div className="space-y-3 border-t border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-dim">
            <span>
              <bdi className="ltr">{job.host}</bdi>{" · "}
              {running ? t("Scanning") : job.status === "cancelled" ? t("Scan stopped") : job.status === "error" ? t("Scan failed") : t("Scan finished")}
            </span>
            <span className="tabular-nums"><bdi className="ltr">{job.scanned} / {job.total}</bdi></span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("Scan progress")}>
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <ul className="max-h-72 min-h-24 space-y-1 overflow-y-auto rounded-md border border-line bg-sunken p-3 font-mono text-[13px]" dir="ltr" aria-live="polite">
            {job.open.map((o) => (
              <li key={o.port}>Port #{o.port} ({o.service || "unknown"}): <span className="text-up">{t("listening")}</span></li>
            ))}
            {job.open.length === 0 && <li className="text-dim">{running ? t("Nothing found yet.") : t("No open ports found. Ports behind a firewall also look closed.")}</li>}
          </ul>
        </div>
      )}
    </Panel>
  );
}
