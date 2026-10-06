import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useTheme } from "../lib/theme";
import { REFRESH_OPTIONS, useIntervalLabel, useRefresh, type Interval } from "../lib/refresh";
import { useI18n } from "../lib/i18n";
import { getBackendUrl, normalizeBackendUrl, setBackendUrl } from "../lib/backend";
import { ErrorNote, Panel } from "../components/ui";

// UNVERIFIED: the shape returned by GET /api/settings. The token is never returned, only whether one is set.
function readSettings(raw: unknown) {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const inner = (o.data && typeof o.data === "object" ? o.data : o) as Record<string, unknown>;
  const url = (inner.url ?? inner.librenms_url ?? inner.base_url ?? "") as string;
  const tokenSet = Boolean(inner.token_set ?? inner.has_token ?? inner.token_configured ?? inner.configured);
  return { url, tokenSet };
}

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const intervalLabel = useIntervalLabel();
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();
  const { seconds, setSeconds } = useRefresh();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const current = readSettings(settings.data);

  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  useEffect(() => { if (settings.data) setUrl(current.url); }, [settings.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.saveSettings({ url: url.trim(), ...(token ? { token } : {}) }),
    onSuccess: () => {
      setToken("");
      qc.invalidateQueries(); // every page should re-read from the new server
    },
  });

  const test = useMutation({ mutationFn: api.health });

  const [backend, setBackend] = useState(getBackendUrl());
  const [backendMsg, setBackendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const testBackend = useMutation({
    mutationFn: async () => {
      const base = normalizeBackendUrl(backend);
      const res = await fetch(`${base}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onSuccess: () => setBackendMsg({ ok: true, text: "Backend reachable." }),
    onError: () => setBackendMsg({ ok: false, text: "Cannot reach the backend at this address (check the address, that it is running, and CORS)." }),
  });
  const saveBackend = () => {
    setBackendUrl(backend);
    setBackend(normalizeBackendUrl(backend));
    qc.invalidateQueries(); // every page re-reads from the new backend
    setBackendMsg({ ok: true, text: "Backend address saved." });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">{t("Settings")}</h1>

      <Panel title={t("Backend address")}>
        <form className="space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); saveBackend(); }}>
          <label className="block text-sm">
            {t("Padi backend URL")}
            <input type="text" dir="ltr" value={backend} onChange={(e) => { setBackend(e.target.value); setBackendMsg(null); }} placeholder="http://192.168.1.20:8000" className="mt-1 w-full max-w-lg rounded-md border border-line bg-bg px-3 py-2 text-sm" />
            <span className="mt-1 block text-xs text-dim">{t("Leave empty to use the same address this page was loaded from.")}</span>
          </label>
          {backendMsg && <p className={`text-sm ${backendMsg.ok ? "text-up" : "text-down"}`} role="status">{t(backendMsg.text)}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg">{t("Save address")}</button>
            <button type="button" onClick={() => testBackend.mutate()} disabled={testBackend.isPending} className="rounded-md border border-line px-4 py-2 text-sm hover:bg-sunken">
              {testBackend.isPending ? t("Testing") : t("Test backend")}
            </button>
          </div>
        </form>
      </Panel>

      <Panel title={t("LibreNMS connection")}>
        <form className="space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <label className="block text-sm">
            {t("Server URL")}
            <input type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://librenms.example.local" className="mt-1 w-full max-w-lg rounded-md border border-line bg-bg px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            {t("API token")}
            <input type="password" dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder={current.tokenSet ? t("A token is saved. Enter a new one to replace it.") : t("Paste a token")} className="mt-1 w-full max-w-lg rounded-md border border-line bg-bg px-3 py-2 text-sm" />
            <span className="mt-1 block text-xs text-dim">{t("The token is sent to the backend and never shown again.")}</span>
          </label>
          <ErrorNote error={settings.error ?? save.error} />
          {save.isSuccess && <p className="text-sm text-up" role="status">{t("Settings saved.")}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={save.isPending || !url.trim()} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60">
              {save.isPending ? t("Saving") : t("Save settings")}
            </button>
            <button type="button" onClick={() => test.mutate()} disabled={test.isPending} className="rounded-md border border-line px-4 py-2 text-sm hover:bg-sunken">
              {test.isPending ? t("Testing") : t("Test connection")}
            </button>
            {test.data && (
              <span className={`text-sm ${test.data.source === "mock" ? "text-warn" : test.data.status === "ok" ? "text-up" : "text-down"}`} role="status">
                {test.data.source === "mock" ? t("Not configured, showing sample data.") : test.data.status === "ok" ? (test.data.version ? t("Connected to LibreNMS {version}.", { version: test.data.version }) : t("Connected.")) : test.data.message ? t(test.data.message) : t("LibreNMS did not answer.")}
              </span>
            )}
            {test.error && <span className="text-sm text-down" role="alert">{t((test.error as Error).message)}</span>}
          </div>
        </form>
        {health.data?.source === "mock" && (
          <p className="border-t border-line px-4 py-3 text-xs text-dim">{t("Without a server URL and token the app shows sample data.")}</p>
        )}
      </Panel>

      <Panel title={t("This browser")}>
        <div className="space-y-4 p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span>{t("Theme")}</span>
            <button onClick={toggle} className="rounded-md border border-line px-3 py-1.5 hover:bg-sunken">{theme === "dark" ? t("Dark. Switch to light") : t("Light. Switch to dark")}</button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>{t("Language")}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value as "en" | "fa")} aria-label={t("Language")} className="rounded-md border border-line bg-panel px-3 py-1.5">
              <option value="en">English</option>
              <option value="fa">فارسی</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span>{t("Auto-refresh")}</span>
            <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value) as Interval)} aria-label={t("Auto-refresh")} className="rounded-md border border-line bg-panel px-3 py-1.5">
              {REFRESH_OPTIONS.map((s) => <option key={s} value={s}>{intervalLabel(s)}</option>)}
            </select>
          </div>
        </div>
      </Panel>
    </div>
  );
}
