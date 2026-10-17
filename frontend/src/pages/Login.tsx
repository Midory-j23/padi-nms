import { useState } from "react";
import { Eye, EyeOff, Languages, Moon, Sun } from "lucide-react";
import { translateMessage } from "../components/ui";
import { getBackendUrl, normalizeBackendUrl, setBackendUrl } from "../lib/backend";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";

const input = "mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm";

function Password({ label, value, onChange, autoComplete, id }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; id: string }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <label className="block text-sm" htmlFor={id}>
      {label}
      {/* The field is always left-to-right, so the button and the padding must use the same fixed side
          (otherwise, on a right-to-left page, the button lands on the left and covers the text). */}
      <span className="relative mt-1 block" dir="ltr">
        <input
          id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} dir="ltr" required
          className="block w-full rounded-md border border-line bg-bg py-2.5 pl-3 pr-11 text-sm"
        />
        <button
          type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t("Hide password") : t("Show password")}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-dim hover:text-ink"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </label>
  );
}

/** Backend address, needed when the app is opened from a different address than the backend. */
function BackendAddress() {
  const { t } = useI18n();
  const { retry } = useAuth();
  const [value, setValue] = useState(getBackendUrl());
  return (
    <form
      className="space-y-2 border-t border-line pt-4"
      onSubmit={(e) => { e.preventDefault(); setBackendUrl(value); setValue(normalizeBackendUrl(value)); retry(); }}
    >
      <label className="block text-sm">
        {t("Padi backend URL")}
        <input value={value} onChange={(e) => setValue(e.target.value)} dir="ltr" placeholder="http://192.168.1.20:8001" className={input} />
      </label>
      <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{t("Save address and retry")}</button>
    </form>
  );
}

export default function Login() {
  const { t, lang, toggleLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { phase, offlineError, login, setup, retry } = useAuth();

  const setupMode = phase === "setup";
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setupMode) {
      if (password.length < 8) { setError("The password must be at least 8 characters."); return; }
      if (password !== confirm) { setError("The two passwords do not match."); return; }
    }
    setBusy(true);
    try {
      if (setupMode) await setup(username.trim(), password, fullName.trim(), remember);
      else await login(username.trim(), password, remember);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected server error.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-bg">
      <div className="flex justify-end gap-2 p-4">
        <button onClick={toggleLang} aria-label={t("Switch language")} className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-xs hover:bg-sunken">
          <Languages size={14} aria-hidden />
          {lang === "fa" ? "English" : "فارسی"}
        </button>
        <button onClick={toggle} aria-label={t("Switch theme")} className="grid h-8 w-8 place-items-center rounded-md border border-line bg-panel hover:bg-sunken">
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <img src="/logo.png" alt="" width={110} height={100} className="h-24 w-auto dark:invert" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Padi NMS</h1>
              <p className="mt-1 text-sm text-dim">
                {phase === "offline" ? t("Cannot reach the server") : setupMode ? t("Create the first admin account") : t("Sign in to continue")}
              </p>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-line bg-panel p-5">
            {phase === "loading" && <p className="text-center text-sm text-dim" role="status">{t("Loading")}</p>}

            {phase === "offline" && (
              <div className="space-y-4">
                <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{translateMessage(t, offlineError ?? "")}</div>
                <button onClick={retry} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg">{t("Try again")}</button>
                <BackendAddress />
              </div>
            )}

            {(phase === "anon" || phase === "setup") && (
              <form onSubmit={submit} className="space-y-4">
                {setupMode && <p className="text-sm text-dim">{t("This is a new installation. The account you create now will be the administrator.")}</p>}
                <label className="block text-sm">
                  {t("Username")}
                  <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr" required autoFocus className={input} />
                </label>
                {setupMode && (
                  <label className="block text-sm">
                    {t("Full name")}
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" dir="auto" maxLength={80} className={input} />
                  </label>
                )}
                <Password id="pw" label={t("Password")} value={password} onChange={setPassword} autoComplete={setupMode ? "new-password" : "current-password"} />
                {setupMode && <Password id="pw2" label={t("Confirm password")} value={confirm} onChange={setConfirm} autoComplete="new-password" />}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  {t("Stay signed in on this device")}
                </label>
                {error && <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{translateMessage(t, error)}</div>}
                <button type="submit" disabled={busy} className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-60">
                  {busy ? t("Please wait") : setupMode ? t("Create account") : t("Sign in")}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
