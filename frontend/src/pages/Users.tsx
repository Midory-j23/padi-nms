import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { ManagedUser, Role } from "../api/types";
import { Empty, ErrorNote, Panel } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";

const field = "mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm";
type Pending = { kind: "reset" | "delete"; user: ManagedUser } | null;

function ActionDialog({ pending, onClose, onDone }: { pending: Pending; onClose: () => void; onDone: (list: ManagedUser[]) => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const run = useMutation({
    mutationFn: () => (pending!.kind === "delete" ? api.deleteUser(pending!.user.id) : api.updateUser(pending!.user.id, { password })),
    onSuccess: (r) => { onDone(r.data); onClose(); },
  });
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (pending && !d.open) { setPassword(""); run.reset(); d.showModal(); }
    if (!pending && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-md rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/50">
      {pending && (
        <form onSubmit={(e) => { e.preventDefault(); run.mutate(); }} className="space-y-4 p-5">
          <h2 className="text-base font-semibold">{pending.kind === "delete" ? t("Delete user") : t("Reset password")}</h2>
          <p className="text-sm text-dim"><bdi className="ltr">{pending.user.username}</bdi></p>
          {pending.kind === "delete" ? (
            <p className="text-sm">{t("This user will be removed and signed out immediately. This cannot be undone.")}</p>
          ) : (
            <label className="block text-sm">
              {t("New password")}
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" autoComplete="off" minLength={8} required className={field} />
              <span className="mt-1 block text-xs text-dim">{t("At least 8 characters. The user will be signed out everywhere and must use the new password.")}</span>
            </label>
          )}
          <ErrorNote error={run.error} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{t("Cancel")}</button>
            <button type="submit" disabled={run.isPending} className={`rounded-md px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60 ${pending.kind === "delete" ? "bg-down" : "bg-accent"}`}>
              {pending.kind === "delete" ? t("Delete") : t("Save")}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

export default function Users() {
  const { t } = useI18n();
  const f = useFormat();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const list = useQuery({ queryKey: ["users"], queryFn: api.users, refetchInterval: 30_000 });
  const users = list.data?.data ?? [];
  const setList = (l: ManagedUser[]) => qc.setQueryData(["users"], { data: l });

  const [pending, setPending] = useState<Pending>(null);
  const [form, setForm] = useState({ username: "", full_name: "", password: "", role: "observer" as Role });
  const create = useMutation({
    mutationFn: () => api.createUser({ ...form, username: form.username.trim() }),
    onSuccess: (r) => { setList(r.data); setForm({ username: "", full_name: "", password: "", role: "observer" }); },
  });
  const update = useMutation({
    mutationFn: (v: { id: number; body: Record<string, string | boolean> }) => api.updateUser(v.id, v.body),
    onSuccess: (r) => setList(r.data),
  });

  const roleLabel = (r: Role) => (r === "admin" ? t("Admin") : t("Observer"));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("Users")}</h1>
        <p className="mt-1 max-w-prose text-sm text-dim">{t("Admins can change everything and manage users. Observers can only view.")}</p>
      </div>

      <Panel title={t("Add user")}>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm">
              {t("Username")}
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} dir="ltr" autoComplete="off" autoCapitalize="none" required className={field} />
            </label>
            <label className="block text-sm">
              {t("Full name")}
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} dir="auto" maxLength={80} className={field} />
            </label>
            <label className="block text-sm">
              {t("Password")}
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" autoComplete="off" minLength={8} required className={field} />
            </label>
            <label className="block text-sm">
              {t("Role")}
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={field}>
                <option value="observer">{t("Observer")}</option>
                <option value="admin">{t("Admin")}</option>
              </select>
            </label>
          </div>
          <ErrorNote error={create.error} />
          <button type="submit" disabled={create.isPending} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60">
            {create.isPending ? t("Please wait") : t("Add user")}
          </button>
        </form>
      </Panel>

      <ErrorNote error={list.error} />
      <ErrorNote error={update.error} />

      <Panel title={t("People")} aside={<span className="text-xs text-dim">{t("{n} users", { n: f.num(users.length) })}</span>}>
        {list.isLoading ? (
          <Empty>{t("Loading")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="rt w-full min-w-[760px] text-sm">
              <thead className="border-b border-line bg-sunken text-xs text-dim">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("User")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Role")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Status")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Last sign-in")}</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">{t("Actions")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} className={u.active ? "" : "text-dim"}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium" dir="auto">{u.full_name || u.username}</div>
                        <div className="text-xs text-dim"><bdi className="ltr">@{u.username}</bdi>{self && ` · ${t("You")}`}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={u.role} disabled={self || update.isPending} aria-label={`${t("Role")}: ${u.username}`}
                          onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value } })}
                          className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm"
                        >
                          <option value="admin">{roleLabel("admin")}</option>
                          <option value="observer">{roleLabel("observer")}</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${!u.active ? "bg-dim" : u.online ? "bg-up" : "bg-line"}`} aria-hidden />
                          {!u.active ? t("Disabled") : u.online ? t("Online") : t("Offline")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{u.last_login ? f.epoch(u.last_login) : t("Never")}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button onClick={() => setPending({ kind: "reset", user: u })} className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-sunken">{t("Reset password")}</button>
                          {!self && (
                            <>
                              <button onClick={() => update.mutate({ id: u.id, body: { active: !u.active } })} disabled={update.isPending} className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-sunken">
                                {u.active ? t("Disable") : t("Enable")}
                              </button>
                              <button onClick={() => setPending({ kind: "delete", user: u })} className="rounded-md border border-down/50 px-2.5 py-1 text-xs text-down hover:bg-down/10">{t("Delete")}</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ActionDialog pending={pending} onClose={() => setPending(null)} onDone={setList} />
    </div>
  );
}
