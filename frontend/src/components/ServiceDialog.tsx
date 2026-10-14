import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Service } from "../api/types";
import { useI18n } from "../lib/i18n";
import { ErrorNote } from "./ui";

const input = "mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm";
const OTHER = "__other__";
// Check types LibreNMS ships plugins for, with a typical parameter as a hint.
const TYPES: { value: string; hint?: string }[] = [
  { value: "icmp" }, { value: "http", hint: "-H example.com -p 80" }, { value: "ssh", hint: "-p 22" }, { value: "tcp", hint: "-p 3389" },
  { value: "dns", hint: "-H example.com" }, { value: "smtp", hint: "-p 25" }, { value: "ftp" }, { value: "imap" }, { value: "pop" },
  { value: "ldap" }, { value: "mysql" }, { value: "ntp_time" },
];

interface Form { device: string; type: string; custom: string; ip: string; desc: string; param: string; ignore: boolean; disabled: boolean }
const flag = (v: unknown) => v === 1 || v === "1" || v === true;

/** Adds a service check to a device, or edits an existing one (the device cannot be changed). */
export default function ServiceDialog({ open, onClose, service }: { open: boolean; onClose: () => void; service: Service | null }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices, enabled: open });
  const list = devices.data?.data ?? [];
  const [form, setForm] = useState<Form>({ device: "", type: "icmp", custom: "", ip: "", desc: "", param: "", ignore: false, disabled: false });
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (b: Parameters<typeof api.addService>[0]) => (service?.service_id !== undefined ? api.updateService(service.service_id, b) : api.addService(b)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["services"] }); onClose(); },
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const known = TYPES.some((x) => x.value === service?.service_type);
      setForm(service ? {
        device: String(service.device_id ?? ""), type: known ? service.service_type! : OTHER, custom: known ? "" : service.service_type ?? "",
        ip: service.service_ip ?? "", desc: service.service_desc ?? "", param: service.service_param ?? "",
        ignore: flag(service.service_ignore), disabled: flag(service.service_disabled),
      } : { device: "", type: "icmp", custom: "", ip: "", desc: "", param: "", ignore: false, disabled: false });
      setProblem(null);
      save.reset();
      d.showModal();
    }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const type = form.type === OTHER ? form.custom.trim() : form.type;
  const hint = TYPES.find((x) => x.value === form.type)?.hint;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!service && !form.device) { setProblem("Choose the device the check runs on."); return; }
    if (!/^[A-Za-z0-9_.-]{1,40}$/.test(type)) { setProblem("The check type must be a single word such as http, ssh or tcp."); return; }
    setProblem(null);
    save.mutate({ device: form.device, type, name: "", ip: form.ip.trim(), desc: form.desc.trim(), param: form.param.trim(), ignore: form.ignore, disabled: form.disabled });
  };

  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-lg rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/50">
      <form onSubmit={submit} className="max-h-[88vh] space-y-4 overflow-y-auto p-5">
        <h2 className="text-base font-semibold">{service ? t("Edit service") : t("Add service")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            {t("Device")}
            <select value={form.device} onChange={(e) => set("device", e.target.value)} disabled={!!service} aria-label={t("Device")} className={input}>
              <option value="">{t("Choose a device")}</option>
              {list.map((d) => <option key={d.device_id} value={String(d.device_id)}>{d.display || d.sysName || d.hostname}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            {t("Check type")}
            <select value={form.type} onChange={(e) => set("type", e.target.value)} aria-label={t("Check type")} className={input}>
              {TYPES.map((x) => <option key={x.value} value={x.value}>{x.value === "icmp" ? `icmp (${t("ping")})` : x.value}</option>)}
              <option value={OTHER}>{t("Other…")}</option>
            </select>
            {form.type === OTHER && <input value={form.custom} onChange={(e) => set("custom", e.target.value)} dir="ltr" placeholder="snmp" aria-label={t("Check type")} className={input} />}
          </label>
          <label className="block text-sm">
            {t("Address (optional)")}
            <input value={form.ip} onChange={(e) => set("ip", e.target.value)} dir="ltr" placeholder={t("The device address")} className={input} />
          </label>
          <label className="block text-sm sm:col-span-2">
            {t("Description")}
            <input value={form.desc} onChange={(e) => set("desc", e.target.value)} dir="auto" maxLength={255} className={input} />
          </label>
          <label className="block text-sm sm:col-span-2">
            {t("Parameters (optional)")}
            <input value={form.param} onChange={(e) => set("param", e.target.value)} dir="ltr" maxLength={255} placeholder={hint} className={input} />
            {hint && <span className="mt-1 block text-xs text-dim">{t("Example: {x}", { x: hint })}</span>}
          </label>
        </div>
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" checked={form.disabled} onChange={(e) => set("disabled", e.target.checked)} className="mt-0.5" /><span>{t("Stop checking this service (disabled)")}</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={form.ignore} onChange={(e) => set("ignore", e.target.checked)} className="mt-0.5" /><span>{t("Ignore failures (do not alert)")}</span></label>
        </div>
        {problem && <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{t(problem)}</div>}
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
