import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useI18n } from "../lib/i18n";
import OpenPorts from "../components/OpenPorts";
import { ErrorNote, Panel, translateMessage } from "../components/ui";

interface Found { ip: string; name: string; already_added: boolean }
interface ScanData { scanned: number; found: Found[] }
interface AddResult { host: string; ok: boolean; message: string }
interface AddData { results: AddResult[]; added: number; failed: number }

const inputCls = "mt-1 block w-full max-w-md rounded-md border border-line bg-bg px-3 py-2 text-sm";
const ipKey = (ip: string) => ip.split(".").reduce((a, o) => a * 256 + Number(o), 0);

export default function ScanNetwork() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [target, setTarget] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pingOnly, setPingOnly] = useState(false);
  const [community, setCommunity] = useState("");
  const [snmpver, setSnmpver] = useState("v2c");
  const [fallback, setFallback] = useState(true);
  const [forceAdd, setForceAdd] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: (tg: string) => api.scanNetwork(tg),
    onSuccess: (res) => {
      const found = ((res.data as ScanData).found ?? []).filter((f) => !f.already_added);
      setSelected(new Set(found.map((f) => f.ip))); // new devices start selected
      add.reset();
    },
  });
  const add = useMutation({
    mutationFn: (body: Record<string, string | boolean | string[]>) => api.bulkAddDevices(body),
    onSuccess: () => {
      setCommunity(""); // never keep credentials after they were sent
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const data = scan.data?.data as ScanData | undefined;
  const found = [...(data?.found ?? [])].sort((a, b) => ipKey(a.ip) - ipKey(b.ip));
  const fresh = found.filter((f) => !f.already_added);
  const result = add.data?.data as AddData | undefined;

  const toggle = (ip: string) =>
    setSelected((s) => { const n = new Set(s); n.has(ip) ? n.delete(ip) : n.add(ip); return n; });

  const runScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) { setProblem("Enter an IP range to scan, for example 172.16.32.0/24."); return; }
    setProblem(null);
    scan.mutate(target.trim());
  };

  const runAdd = () => {
    if (selected.size === 0) { setProblem("Select at least one device to add."); return; }
    if (!pingOnly && !community) { setProblem("Enter the SNMP community, or choose ping only."); return; }
    setProblem(null);
    const body: Record<string, string | boolean | string[]> = { hosts: [...selected], ping_only: pingOnly };
    if (!pingOnly) { body.community = community; body.snmpver = snmpver; body.ping_fallback = fallback; }
    if (forceAdd) body.force_add = true;
    add.mutate(body);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Scan network")}</h1>
        <p className="mt-1 max-w-prose text-sm text-dim">{t("Find every device that answers on an IP range and add them all at once.")}</p>
      </div>

      <Panel title={t("IP range")}>
        <form onSubmit={runScan} className="space-y-4 p-4">
          <label className="block text-sm">
            {t("Range to scan")}
            <input value={target} onChange={(e) => setTarget(e.target.value)} dir="ltr" autoFocus placeholder="172.16.32.0/24" className={inputCls} />
            <span className="mt-1 block text-xs text-dim">{t("Examples: 172.16.32.0/24, 172.16.32. or 172.16.32.10-50. Up to 1024 addresses.")}</span>
          </label>
          <button type="submit" disabled={scan.isPending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60">
            {scan.isPending ? t("Scanning") : t("Scan")}
          </button>
        </form>
      </Panel>

      <ErrorNote error={scan.error} />

      {data && (
        <Panel title={t("Devices found")}>
          {found.length === 0 ? (
            <p className="p-4 text-sm text-dim">{t("Nothing answered ping in this range. Devices that block ping will not appear; add those one by one.")}</p>
          ) : (
            <div>
              <p className="border-b border-line px-4 py-2.5 text-sm text-dim">
                {t("{n} of {total} addresses answered", { n: String(found.length), total: String(data.scanned) })}
                {found.length > fresh.length && ` · ${found.length - fresh.length} ${t("already monitored")}`}
              </p>
              <label className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm sm:hidden">
                <input type="checkbox" checked={fresh.length > 0 && selected.size === fresh.length} onChange={(e) => setSelected(e.target.checked ? new Set(fresh.map((f) => f.ip)) : new Set())} />
                {t("Select all")}
              </label>
              <div className="overflow-x-auto">
                <table className="rt w-full min-w-[420px] text-sm">
                  <thead className="border-b border-line bg-sunken text-xs text-dim">
                    <tr>
                      <th className="w-10 px-4 py-2.5">
                        <input
                          type="checkbox" aria-label={t("Select all")}
                          checked={fresh.length > 0 && selected.size === fresh.length}
                          onChange={(e) => setSelected(e.target.checked ? new Set(fresh.map((f) => f.ip)) : new Set())}
                        />
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("IP address")}</th>
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Name")}</th>
                      <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {found.map((f) => (
                      <tr key={f.ip} className={f.already_added ? "text-dim" : ""}>
                        <td className="px-4 py-2.5">
                          <input type="checkbox" aria-label={f.ip} disabled={f.already_added} checked={selected.has(f.ip)} onChange={() => toggle(f.ip)} />
                        </td>
                        <td className="px-4 py-2.5"><bdi className="ltr">{f.ip}</bdi></td>
                        <td className="px-4 py-2.5"><bdi className="ltr">{f.name || "—"}</bdi></td>
                        <td className="px-4 py-2.5">{f.already_added ? t("Already monitored") : t("New")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
      )}

      {fresh.length > 0 && !result && (
        <Panel title={t("How to add them")}>
          <div className="space-y-4 p-4">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={pingOnly} onChange={(e) => setPingOnly(e.target.checked)} className="mt-0.5" />
              <span>{t("Ping only (clients without SNMP)")}</span>
            </label>
            {!pingOnly && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  {t("SNMP community")}
                  <input type="password" value={community} onChange={(e) => setCommunity(e.target.value)} dir="ltr" autoComplete="off" className={inputCls} />
                </label>
                <label className="block text-sm">
                  {t("SNMP version")}
                  <select value={snmpver} onChange={(e) => setSnmpver(e.target.value)} className={inputCls}>
                    <option value="v2c">v2c</option>
                    <option value="v1">v1</option>
                  </select>
                </label>
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} className="mt-0.5" />
                  <span>{t("If SNMP fails, add as ping only")}</span>
                </label>
              </div>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={forceAdd} onChange={(e) => setForceAdd(e.target.checked)} className="mt-0.5" />
              <span>{t("Add even if LibreNMS cannot reach them now")}</span>
            </label>
            {problem && <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{t(problem)}</div>}
            <ErrorNote error={add.error} />
            <button onClick={runAdd} disabled={add.isPending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60">
              {add.isPending ? t("Adding") : `${t("Add selected")} (${selected.size})`}
            </button>
            {add.isPending && <p className="text-xs text-dim">{t("This can take a while: LibreNMS checks each device.")}</p>}
          </div>
        </Panel>
      )}
      {problem && !(fresh.length > 0 && !result) && <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{t(problem)}</div>}

      {result && (
        <Panel title={t("Result")}>
          <div className="space-y-3 p-4 text-sm">
            <p className="font-semibold">{`${result.added} ${t("added")}${result.failed ? `, ${result.failed} ${t("failed")}` : ""}`}</p>
            {result.results.filter((r) => !r.ok).map((r) => (
              <p key={r.host} className="text-down"><bdi className="ltr">{r.host}</bdi>: {translateMessage(t, r.message)}</p>
            ))}
            <p className="text-dim">{t("New devices fill in with full data after LibreNMS finishes discovery, usually within a few minutes.")}</p>
            <Link to="/devices" className="inline-block rounded-md bg-accent px-4 py-2 font-semibold text-bg">{t("Devices")}</Link>
          </div>
        </Panel>
      )}

      <OpenPorts />
    </div>
  );
}
