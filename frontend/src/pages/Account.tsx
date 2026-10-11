import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";
import { ErrorNote, Panel } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

const field = "mt-1 block w-full max-w-sm rounded-md border border-line bg-bg px-3 py-2 text-sm";

export default function Account() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => { setDone(true); setCurrent(""); setNext(""); setConfirm(""); },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (next.length < 8) { setProblem("The password must be at least 8 characters."); return; }
    if (next !== confirm) { setProblem("The two passwords do not match."); return; }
    setProblem(null);
    save.mutate();
  };

  if (!user) return null;
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">{t("My account")}</h1>

      <Panel title={t("Profile")}>
        <dl className="grid gap-4 p-4 sm:grid-cols-3">
          <div><dt className="text-xs text-dim">{t("Full name")}</dt><dd className="mt-1 text-sm" dir="auto">{user.full_name || "—"}</dd></div>
          <div><dt className="text-xs text-dim">{t("Username")}</dt><dd className="mt-1 text-sm"><bdi className="ltr">{user.username}</bdi></dd></div>
          <div><dt className="text-xs text-dim">{t("Role")}</dt><dd className="mt-1 text-sm">{user.role === "admin" ? t("Admin") : t("Observer")}</dd></div>
        </dl>
      </Panel>

      <Panel title={t("Change password")}>
        <form onSubmit={submit} className="space-y-4 p-4">
          <label className="block text-sm">
            {t("Current password")}
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" dir="ltr" required className={field} />
          </label>
          <label className="block text-sm">
            {t("New password")}
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" dir="ltr" required className={field} />
          </label>
          <label className="block text-sm">
            {t("Confirm password")}
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" dir="ltr" required className={field} />
          </label>
          <p className="text-xs text-dim">{t("Changing your password signs you out on all other devices.")}</p>
          {problem && <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{t(problem)}</div>}
          <ErrorNote error={save.error} />
          {done && <p className="text-sm text-up" role="status">{t("Password changed.")}</p>}
          <button type="submit" disabled={save.isPending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60">
            {save.isPending ? t("Please wait") : t("Change password")}
          </button>
        </form>
      </Panel>

      <button onClick={logout} className="rounded-md border border-line px-4 py-2 text-sm hover:bg-sunken">{t("Sign out")}</button>
    </div>
  );
}
