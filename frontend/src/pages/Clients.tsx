import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "../api/client";
import type { AuditEntry, ClientRecord } from "../api/types";
import { useRefresh } from "../lib/refresh";
import { useFormat } from "../lib/format";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Empty, ErrorNote, Panel } from "../components/ui";
import Pager from "../components/Pager";

const PAGE_SIZE = 25;
type Tab = "clients" | "activity";
type StatusFilter = "active" | "removed" | "all";

const ACTION_LABEL: Record<string, string> = {
  "client.add": "Client added",
  "client.remove": "Client removed",
  "client.update": "Client updated",
  "client.import": "Clients imported",
};

const field = "mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm";

function EditDialog({ client, onClose }: { client: ClientRecord | null; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ display_name: "", location: "", owner: "", notes: "" });

  const save = useMutation({
    mutationFn: () => api.updateClient(client!.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      onClose();
    },
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (client && !d.open) {
      setForm({
        display_name: client.display_name ?? "",
        location: client.location ?? "",
        owner: client.owner ?? "",
        notes: client.notes ?? "",
      });
      save.reset();
      d.showModal();
    }
    if (!client && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-md rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/50">
      <form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
        <div>
          <h2 className="text-base font-semibold">{t("Edit client")}</h2>
          {client && <bdi className="ltr mt-1 block font-mono text-xs text-dim">{client.hostname}</bdi>}
        </div>
        <label className="block text-sm">{t("Display name")}
          <input value={form.display_name} onChange={set("display_name")} dir="auto" maxLength={120} className={field} />
        </label>
        <label className="block text-sm">{t("Location")}
          <input value={form.location} onChange={set("location")} dir="auto" maxLength={200} className={field} />
        </label>
        <label className="block text-sm">{t("Owner")}
          <input value={form.owner} onChange={set("owner")} dir="auto" maxLength={120} className={field} />
        </label>
        <label className="block text-sm">{t("Notes")}
          <textarea value={form.notes} onChange={set("notes")} dir="auto" rows={3} maxLength={2000} className={field} />
        </label>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{t("Cancel")}</button>
          <button type="submit" disabled={save.isPending} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60">
            {save.isPending ? t("Saving") : t("Save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function NotSetUp() {
  const { t } = useI18n();
  return (
    <Panel title={t("Database")}>
      <Empty>{t("The database is not set up. Add MONGODB_URI to the backend .env file and restart the backend.")}</Empty>
    </Panel>
  );
}

function ClientsTab() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const f = useFormat();
  const { ms } = useRefresh();
  const [status, setStatus] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const qc = useQueryClient();

  const importer = useMutation({
    mutationFn: api.importClients,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  const q = useQuery({ queryKey: ["clients", status], queryFn: () => api.clients(status), refetchInterval: ms });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data?.data ?? []).filter(
      (c) => !term || [c.hostname, c.display_name, c.location, c.owner, c.notes].some((v) => v?.toLowerCase().includes(term)),
    );
  }, [q.data, search]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  if (q.data?.database === "off") return <NotSetUp />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">{q.isLoading ? t("Loading clients") : t("{n} clients", { n: f.num(rows.length) })}</p>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && <button onClick={() => importer.mutate()} disabled={importer.isPending}
            title={t("Copies the devices that already exist in LibreNMS into this list. Devices already listed are left as they are.")}
            className="rounded-md border border-line px-3 py-2 text-sm hover:bg-sunken disabled:opacity-60">
            {importer.isPending ? t("Importing") : t("Import from LibreNMS")}
          </button>}
          <div className="relative w-full sm:w-auto">
            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder={t("Search clients")} aria-label={t("Search clients")}
              className="w-full rounded-md border border-line bg-panel py-2 ps-9 pe-3 text-sm placeholder:text-dim sm:w-72" />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(0); }}
            aria-label={t("Filter by status")} className="rounded-md border border-line bg-panel px-3 py-2 text-sm">
            <option value="active">{t("Active")}</option>
            <option value="removed">{t("Removed")}</option>
            <option value="all">{t("All")}</option>
          </select>
        </div>
      </div>

      <ErrorNote error={q.error ?? importer.error} />
      {importer.isSuccess && (
        <p className="rounded-md border border-up/40 bg-up/10 px-4 py-3 text-sm" role="status">
          {t("Imported {n} devices, {skipped} were already in the list.", { n: f.num(importer.data.data.imported), skipped: f.num(importer.data.data.skipped) })}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="rt w-full min-w-[900px] text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-dim">
            <tr>
              {["Client", "Type", "Location", "Owner", "Added", "Status"].map((h) => (
                <th key={h} scope="col" className="px-4 py-2.5 text-start font-medium">{t(h)}</th>
              ))}
              <th scope="col" className="px-4 py-2.5"><span className="sr-only">{t("Actions")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((c) => (
              <tr key={c.id} className="align-top hover:bg-sunken/60">
                <td className="px-4 py-2.5">
                  {c.status === "active" && c.librenms_device_id != null ? (
                    <Link to={`/devices/${c.librenms_device_id}`} className="font-semibold text-accent hover:underline" dir="auto">{c.display_name || c.hostname}</Link>
                  ) : (
                    <span className="font-semibold" dir="auto">{c.display_name || c.hostname}</span>
                  )}
                  {c.display_name && <div className="font-mono text-xs text-dim"><bdi className="ltr">{c.hostname}</bdi></div>}
                  {c.notes && <div className="mt-1 max-w-xs truncate text-xs text-dim" dir="auto" title={c.notes}>{c.notes}</div>}
                </td>
                <td className="px-4 py-2.5" data-label={t("Type")}>
                  {c.type === "ping" ? t("Ping only") : t("SNMP device")}
                  {c.snmp_version && <div className="text-xs text-dim">{c.snmp_version}</div>}
                </td>
                <td className="px-4 py-2.5" data-label={t("Location")} dir="auto">{c.location || "—"}</td>
                <td className="px-4 py-2.5" data-label={t("Owner")} dir="auto">{c.owner || "—"}</td>
                <td className="px-4 py-2.5" data-label={t("Added")}>
                  {f.dateString(c.added_at)}
                  <div className="text-xs text-dim">{c.imported_from ? t("Imported from LibreNMS") : c.source === "scan" ? t("Found by scan") : t("Added by hand")}{c.added_by ? ` · ${c.added_by}` : ""}</div>
                </td>
                <td className="px-4 py-2.5" data-label={t("Status")}>
                  <span className={`text-xs font-semibold ${c.status === "active" ? "text-up" : "text-dim"}`}>{c.status === "active" ? t("Active") : t("Removed")}</span>
                  {c.removed_at && <div className="text-xs text-dim">{f.dateString(c.removed_at)}</div>}
                </td>
                <td className="px-4 py-2.5 text-end">
                  {isAdmin && <button onClick={() => setEditing(c)} className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-sunken">{t("Edit")}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && visible.length === 0 && (
          <Empty>{(q.data?.data ?? []).length === 0 ? t("No clients recorded yet. Devices you add in this app are saved here. Use Import from LibreNMS to bring in the ones you already have.") : t("No clients match this search.")}</Empty>
        )}
      </div>

      <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
      <EditDialog client={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function ActivityTab() {
  const { t } = useI18n();
  const f = useFormat();
  const { ms } = useRefresh();
  const [page, setPage] = useState(0);
  const q = useQuery({ queryKey: ["audit"], queryFn: () => api.audit(500), refetchInterval: ms });

  if (q.data?.database === "off") return <NotSetUp />;

  const rows: AuditEntry[] = q.data?.data ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <ErrorNote error={q.error} />
      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="rt w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-sunken text-xs text-dim">
            <tr>
              {["Time", "Action", "Target", "Result", "Message"].map((h) => (
                <th key={h} scope="col" className="px-4 py-2.5 text-start font-medium">{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((a) => (
              <tr key={a.id} className="align-top hover:bg-sunken/60">
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{f.dateString(a.at)}</td>
                <td className="px-4 py-2.5" data-label={t("Action")}>{ACTION_LABEL[a.action] ? t(ACTION_LABEL[a.action]) : a.action}</td>
                <td className="px-4 py-2.5" data-label={t("Target")}><bdi className="ltr">{a.target || "—"}</bdi></td>
                <td className="px-4 py-2.5" data-label={t("Result")}>
                  <span className={`text-xs font-semibold ${a.ok ? "text-up" : "text-down"}`}>{a.ok ? t("Succeeded") : t("Failed")}</span>
                </td>
                <td className="px-4 py-2.5 text-dim" data-label={t("Message")} dir="auto">{a.message ? t(a.message) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!q.isLoading && visible.length === 0 && <Empty>{t("No activity recorded yet.")}</Empty>}
      </div>
      <Pager page={current} pages={pages} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}

export default function Clients() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("clients");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t("Clients")}</h1>
        {isAdmin && <div className="flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label={t("Clients")}>
          {(["clients", "activity"] as Tab[]).map((id) => (
            <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id}
              className={`px-3 py-2 ${tab === id ? "bg-accent/10 font-semibold text-accent" : "bg-panel hover:bg-sunken"}`}>
              {id === "clients" ? t("Clients") : t("Activity")}
            </button>
          ))}
        </div>}
      </div>
      {tab === "clients" || !isAdmin ? <ClientsTab /> : <ActivityTab />}
    </div>
  );
}
