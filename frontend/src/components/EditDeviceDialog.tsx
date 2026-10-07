import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Device } from "../api/types";
import { useI18n } from "../lib/i18n";
import { isUp } from "../lib/format";
import { ErrorNote } from "./ui";

const TYPES = ["", "server", "network", "firewall", "printer", "workstation", "storage", "power", "wireless", "appliance", "environment", "other"];
const TYPE_LABEL: Record<string, string> = {
  server: "Server", network: "Network", firewall: "Firewall", printer: "Printer", workstation: "Workstation",
  storage: "Storage", power: "Power", wireless: "Wireless", appliance: "Appliance", environment: "Environment", other: "Other",
};

const field = "mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm";

interface Form { display: string; type: string; location: string; purpose: string; notes: string; snmpver: string; port: string; community: string; disabled: boolean; ignore: boolean }

const initial = (d: Device): Form => ({
  display: d.display ?? "",
  type: d.type ?? "",
  location: d.location ?? "",
  purpose: d.purpose ?? "",
  notes: d.notes ?? "",
  snmpver: d.snmpver ?? "v2c",
  port: String(d.port ?? 161),
  community: "",
  disabled: d.disabled === 1 || d.disabled === true,
  ignore: d.ignore === 1 || d.ignore === true,
});

/** Edits the allow-listed device fields. Only fields that changed are sent. */
export default function EditDeviceDialog({ open, onClose, id, device }: { open: boolean; onClose: () => void; id: string; device: Device }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Form>(() => initial(device));
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, string | number | boolean>) => api.editDevice(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["device", id] });
      qc.invalidateQueries({ queryKey: ["devices"] });
      onClose();
    },
  });

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      setForm(initial(device)); // start from the latest values each time it opens
      setProblem(null);
      save.reset();
      dlg.showModal();
    }
    if (!open && dlg.open) dlg.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const start = initial(device);
    const body: Record<string, string | number | boolean> = {};
    (["display", "type", "location", "purpose", "notes", "snmpver"] as const).forEach((k) => {
      if (form[k] !== start[k]) body[k] = form[k];
    });
    if (form.port !== start.port) {
      const p = Number(form.port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) { setProblem("The SNMP port must be between 1 and 65535."); return; }
      body.port = p;
    }
    if (form.community) body.community = form.community;
    if (form.disabled !== start.disabled) body.disabled = form.disabled;
    if (form.ignore !== start.ignore) body.ignore = form.ignore;
    if (Object.keys(body).length === 0) { onClose(); return; }
    setProblem(null);
    save.mutate(body);
  };

  const viaSnmp = !(device.snmp_disable === 1 || device.snmp_disable === true);

  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-xl rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/50">
      <form onSubmit={submit} className="max-h-[85vh] space-y-4 overflow-y-auto p-5">
        <div>
          <h2 className="text-base font-semibold">{t("Edit device")}</h2>
          <p className="mt-1 text-sm text-dim"><bdi className="ltr">{device.hostname}</bdi>{" · "}{isUp(device.status) ? t("Up") : t("Down")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            {t("Display name")}
            <input value={form.display} onChange={(e) => set("display", e.target.value)} dir="auto" maxLength={255} className={field} />
          </label>
          <label className="block text-sm">
            {t("Type")}
            <select value={form.type} onChange={(e) => set("type", e.target.value)} className={field}>
              {TYPES.map((v) => <option key={v} value={v}>{v ? t(TYPE_LABEL[v]) : t("Not set")}</option>)}
              {form.type && !TYPES.includes(form.type) && <option value={form.type}>{form.type}</option>}
            </select>
          </label>
          <label className="block text-sm">
            {t("Location")}
            <input value={form.location} onChange={(e) => set("location", e.target.value)} dir="auto" maxLength={255} className={field} />
          </label>
          <label className="block text-sm">
            {t("Purpose")}
            <input value={form.purpose} onChange={(e) => set("purpose", e.target.value)} dir="auto" maxLength={255} className={field} />
          </label>
          <label className="block text-sm sm:col-span-2">
            {t("Notes")}
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} dir="auto" rows={3} maxLength={2000} className={field} />
          </label>
        </div>

        {viaSnmp && (
          <fieldset className="grid gap-4 rounded-md border border-line p-4 sm:grid-cols-3">
            <legend className="px-1 text-xs text-dim">SNMP</legend>
            <label className="block text-sm">
              {t("SNMP version")}
              <select value={form.snmpver} onChange={(e) => set("snmpver", e.target.value)} className={field}>
                <option value="v1">v1</option><option value="v2c">v2c</option><option value="v3">v3</option>
              </select>
            </label>
            <label className="block text-sm">
              {t("SNMP port")}
              <input value={form.port} onChange={(e) => set("port", e.target.value)} inputMode="numeric" dir="ltr" className={field} />
            </label>
            <label className="block text-sm">
              {t("SNMP community")}
              <input type="password" value={form.community} onChange={(e) => set("community", e.target.value)} dir="ltr" autoComplete="off" placeholder={t("Leave empty to keep")} className={field} />
            </label>
          </fieldset>
        )}

        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={form.disabled} onChange={(e) => set("disabled", e.target.checked)} className="mt-0.5" />
            <span>{t("Stop monitoring this device (disabled)")}</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={form.ignore} onChange={(e) => set("ignore", e.target.checked)} className="mt-0.5" />
            <span>{t("Ignore alerts for this device")}</span>
          </label>
        </div>

        {problem && <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{t(problem)}</div>}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{t("Cancel")}</button>
          <button type="submit" disabled={save.isPending} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60">
            {save.isPending ? t("Saving") : t("Save changes")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
