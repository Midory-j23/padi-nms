import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { collectWith, num } from "../lib/extract";
import { useI18n } from "../lib/i18n";
import { ErrorNote, Panel } from "../components/ui";

type Mode = "snmp" | "ping";
type Version = "v2c" | "v1" | "v3";

const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const inputCls = "mt-1 block w-full max-w-md rounded-md border border-line bg-bg px-3 py-2 text-sm";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs text-dim">{hint}</span>}
    </label>
  );
}

export default function AddDevice() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("snmp");
  const [hostname, setHostname] = useState("");
  const [display, setDisplay] = useState("");
  const [location, setLocation] = useState("");
  const [hardware, setHardware] = useState("");
  const [os, setOs] = useState("");
  const [version, setVersion] = useState<Version>("v2c");
  const [community, setCommunity] = useState("");
  const [port, setPort] = useState("");
  const [transport, setTransport] = useState("");
  const [authlevel, setAuthlevel] = useState("authPriv");
  const [authname, setAuthname] = useState("");
  const [authpass, setAuthpass] = useState("");
  const [authalgo, setAuthalgo] = useState("SHA");
  const [cryptopass, setCryptopass] = useState("");
  const [cryptoalgo, setCryptoalgo] = useState("AES");
  const [forceAdd, setForceAdd] = useState(false);
  const [pingFallback, setPingFallback] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const needsAuth = version === "v3" && authlevel !== "noAuthNoPriv";
  const needsCrypto = version === "v3" && authlevel === "authPriv";

  const reset = () => {
    setHostname(""); setDisplay(""); setLocation(""); setHardware(""); setOs("");
    setCommunity(""); setAuthname(""); setAuthpass(""); setCryptopass("");
    setForceAdd(false); setPingFallback(false); setProblem(null);
    add.reset();
  };

  const add = useMutation({
    mutationFn: (body: Record<string, string | number | boolean>) => api.addDevice(body),
    onSuccess: () => {
      // Never keep credentials around after they were sent.
      setCommunity(""); setAuthpass(""); setCryptopass("");
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const validate = (): string | null => {
    const host = hostname.trim();
    if (!host) return "Enter a hostname or IP address.";
    if (!HOST_RE.test(host)) return "The hostname can only contain letters, digits, dots, dashes, underscores and colons.";
    if (port.trim()) {
      const n = Number(port);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return "The port must be a number from 1 to 65535.";
    }
    if (mode === "snmp") {
      if (version !== "v3" && !community) return "Enter the SNMP community.";
      if (version === "v3") {
        if (!authname.trim()) return "Enter the SNMPv3 username.";
        if (needsAuth && !authpass) return "Enter the authentication password.";
        if (needsCrypto && !cryptopass) return "Enter the privacy password.";
      }
    }
    return null;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    setProblem(v);
    if (v) return;

    const body: Record<string, string | number | boolean> = { hostname: hostname.trim() };
    if (display.trim()) body.display = display.trim();
    if (location.trim()) body.location = location.trim();
    if (mode === "ping") {
      body.snmp_disable = true;
      if (hardware.trim()) body.hardware = hardware.trim();
      if (os.trim()) body.os = os.trim();
    } else {
      body.snmpver = version;
      if (version === "v3") {
        body.authlevel = authlevel;
        body.authname = authname.trim();
        if (needsAuth) { body.authpass = authpass; body.authalgo = authalgo; }
        if (needsCrypto) { body.cryptopass = cryptopass; body.cryptoalgo = cryptoalgo; }
      } else {
        body.community = community;
      }
      if (port.trim()) body.port = Number(port);
      if (transport) body.transport = transport;
      if (pingFallback) body.ping_fallback = true;
    }
    if (forceAdd) body.force_add = true;
    add.mutate(body);
  };

  const newId = add.data ? num(collectWith(add.data.data, "device_id")[0]?.device_id) : undefined;

  if (add.isSuccess) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">{t("Device added.")}</h1>
        <Panel title={hostname.trim()}>
          <div className="space-y-4 p-4 text-sm">
            <p className="max-w-prose text-dim">{t("New devices fill in with full data after LibreNMS finishes discovery, usually within a few minutes.")}</p>
            <div className="flex flex-wrap gap-2">
              <Link to={newId !== undefined ? `/devices/${newId}` : "/devices"} className="rounded-md bg-accent px-4 py-2 font-semibold text-bg">{newId !== undefined ? t("Open device page") : t("Devices")}</Link>
              <button onClick={reset} className="rounded-md border border-line px-4 py-2 hover:bg-sunken">{t("Add another device")}</button>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Add device")}</h1>
        <p className="mt-1 max-w-prose text-sm text-dim">{t("Add a server, switch, router or client to monitoring without opening LibreNMS.")}</p>
      </div>

      <form onSubmit={submit} noValidate className="space-y-5">
        <Panel title={t("Monitoring type")}>
          <div className="grid gap-3 p-4 sm:grid-cols-2" role="radiogroup" aria-label={t("Monitoring type")}>
            {([
              ["snmp", "SNMP device", "For servers, switches and routers that answer SNMP."],
              ["ping", "Ping only", "For clients and anything without SNMP. Only reachability is monitored."],
            ] as [Mode, string, string][]).map(([id, title, hint]) => (
              <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${mode === id ? "border-accent bg-accent/5" : "border-line hover:bg-sunken/60"}`}>
                <input type="radio" name="mode" checked={mode === id} onChange={() => setMode(id)} className="mt-1" />
                <span>
                  <span className="block font-semibold">{t(title)}</span>
                  <span className="block text-xs text-dim">{t(hint)}</span>
                </span>
              </label>
            ))}
          </div>
        </Panel>

        <Panel title={t("Device")}>
          <div className="space-y-4 p-4">
            <Field label={t("Hostname or IP address")}>
              <input value={hostname} onChange={(e) => setHostname(e.target.value)} dir="ltr" autoFocus placeholder="192.168.1.10" className={inputCls} />
            </Field>
            <Field label={t("Display name (optional)")}>
              <input value={display} onChange={(e) => setDisplay(e.target.value)} dir="auto" className={inputCls} />
            </Field>
            <Field label={t("Location (optional)")}>
              <input value={location} onChange={(e) => setLocation(e.target.value)} dir="auto" className={inputCls} />
            </Field>
            {mode === "ping" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Hardware (optional)")}>
                  <input value={hardware} onChange={(e) => setHardware(e.target.value)} dir="auto" className={inputCls} />
                </Field>
                <Field label={t("Operating system (optional)")} hint={t("Sets the icon in LibreNMS, for example linux or windows.")}>
                  <input value={os} onChange={(e) => setOs(e.target.value)} dir="ltr" className={inputCls} />
                </Field>
              </div>
            )}
          </div>
        </Panel>

        {mode === "snmp" && (
          <Panel title="SNMP">
            <div className="space-y-4 p-4">
              <Field label={t("SNMP version")}>
                <select value={version} onChange={(e) => setVersion(e.target.value as Version)} className={inputCls}>
                  <option value="v2c">v2c</option>
                  <option value="v1">v1</option>
                  <option value="v3">v3</option>
                </select>
              </Field>

              {version !== "v3" ? (
                <Field label={t("Community")}>
                  <input type="password" value={community} onChange={(e) => setCommunity(e.target.value)} dir="ltr" autoComplete="off" className={inputCls} />
                </Field>
              ) : (
                <div className="space-y-4">
                  <Field label={t("Security level")}>
                    <select value={authlevel} onChange={(e) => setAuthlevel(e.target.value)} className={inputCls}>
                      <option value="noAuthNoPriv">noAuthNoPriv</option>
                      <option value="authNoPriv">authNoPriv</option>
                      <option value="authPriv">authPriv</option>
                    </select>
                  </Field>
                  <Field label={t("Username")}>
                    <input value={authname} onChange={(e) => setAuthname(e.target.value)} dir="ltr" autoComplete="off" className={inputCls} />
                  </Field>
                  {needsAuth && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t("Authentication password")}>
                        <input type="password" value={authpass} onChange={(e) => setAuthpass(e.target.value)} dir="ltr" autoComplete="off" className={inputCls} />
                      </Field>
                      <Field label={t("Authentication algorithm")}>
                        <select value={authalgo} onChange={(e) => setAuthalgo(e.target.value)} className={inputCls}>
                          <option>SHA</option>
                          <option>MD5</option>
                        </select>
                      </Field>
                    </div>
                  )}
                  {needsCrypto && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t("Privacy password")}>
                        <input type="password" value={cryptopass} onChange={(e) => setCryptopass(e.target.value)} dir="ltr" autoComplete="off" className={inputCls} />
                      </Field>
                      <Field label={t("Privacy algorithm")}>
                        <select value={cryptoalgo} onChange={(e) => setCryptoalgo(e.target.value)} className={inputCls}>
                          <option>AES</option>
                          <option>DES</option>
                        </select>
                      </Field>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-dim">{t("Credentials are sent to the backend and never shown again.")}</p>
            </div>
          </Panel>
        )}

        <details className="rounded-lg border border-line bg-panel">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">{t("Advanced options")}</summary>
          <div className="space-y-4 border-t border-line p-4">
            {mode === "snmp" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("SNMP port")} hint={t("Leave empty for the default (161).")}>
                  <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" dir="ltr" className={inputCls} />
                </Field>
                <Field label={t("Transport")}>
                  <select value={transport} onChange={(e) => setTransport(e.target.value)} className={inputCls}>
                    <option value="">{t("Default")}</option>
                    <option value="udp">udp</option>
                    <option value="tcp">tcp</option>
                    <option value="udp6">udp6</option>
                    <option value="tcp6">tcp6</option>
                  </select>
                </Field>
              </div>
            )}
            {mode === "snmp" && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={pingFallback} onChange={(e) => setPingFallback(e.target.checked)} className="mt-0.5" />
                <span>{t("If SNMP fails, add as ping only")}</span>
              </label>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={forceAdd} onChange={(e) => setForceAdd(e.target.checked)} className="mt-0.5" />
              <span>
                {t("Add even if the device does not answer now")}
                <span className="block text-xs text-dim">{t("Skips the reachability and SNMP checks. The device is added exactly as entered and shows as down until it responds.")}</span>
              </span>
            </label>
          </div>
        </details>

        {problem && <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{t(problem)}</div>}
        <ErrorNote error={add.error} />

        <div className="flex gap-2">
          <button type="submit" disabled={add.isPending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60">
            {add.isPending ? t("Adding") : t("Add device")}
          </button>
          <Link to="/devices" className="rounded-md border border-line px-4 py-2 text-sm hover:bg-sunken">{t("Cancel")}</Link>
        </div>
      </form>
    </div>
  );
}
