import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { api } from "../api/client";
import type { AlertRule, RuleBuilder, RuleSeverity } from "../api/types";
import { useI18n } from "../lib/i18n";
import {
  CUSTOM_FIELD, FIELD_PATTERN, FIELDS, NO_VALUE_OPERATORS, OPERATORS, fieldDef, isFlat, summarize, toBuilder, toConditions,
  type Condition, type RuleTemplate,
} from "../lib/rules";
import { ErrorNote } from "./ui";

const input = "mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm";
const MAX_CONDITIONS = 10;

interface Form {
  name: string; severity: RuleSeverity; scope: "all" | "devices"; deviceIds: number[];
  condition: "AND" | "OR"; conds: Condition[]; original: RuleBuilder | null;
  delayMin: string; intervalMin: string; count: string; mute: boolean; enabled: boolean; notes: string;
}

const blank = (): Form => ({
  name: "", severity: "warning", scope: "all", deviceIds: [], condition: "AND",
  conds: [{ field: "devices.status", operator: "equal", value: "0" }], original: null,
  delayMin: "5", intervalMin: "5", count: "", mute: false, enabled: true, notes: "",
});

function fromTemplate(tp: RuleTemplate, t: (k: string) => string): Form {
  return { ...blank(), name: t(tp.name), severity: tp.severity, condition: tp.condition, conds: tp.conditions.map((c) => ({ ...c })),
    delayMin: String(tp.delay / 60), intervalMin: String(tp.interval / 60) };
}

function fromRule(r: AlertRule): Form {
  const flat = isFlat(r.builder);
  return { ...blank(), name: r.name, severity: r.severity, condition: r.builder?.condition ?? "AND",
    conds: flat ? toConditions(r.builder!) : [], original: flat ? null : r.builder,
    delayMin: String(Math.round(r.delay / 60)), intervalMin: String(Math.round(r.interval / 60)),
    count: r.count >= 0 ? String(r.count) : "", mute: r.mute, enabled: !r.disabled, notes: r.notes,
    scope: "all", deviceIds: r.devices ?? [] };
}

/** Adds a rule (blank or from a template) or edits an existing one. */
export default function RuleDialog({ open, onClose, rule, template }: { open: boolean; onClose: () => void; rule: AlertRule | null; template: RuleTemplate | null }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Form>(blank);
  const [problem, setProblem] = useState<string | null>(null);
  const devices = useQuery({ queryKey: ["devices"], queryFn: api.devices, enabled: open });
  const deviceList = devices.data?.data ?? [];

  const save = useMutation({
    mutationFn: (b: Parameters<typeof api.addRule>[0]) => (rule ? api.updateRule(rule.id, b) : api.addRule(b)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      onClose();
    },
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setForm(rule ? fromRule(rule) : template ? fromTemplate(template, t) : blank());
      setProblem(null);
      save.reset();
      d.showModal();
    }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setCond = (i: number, patch: Partial<Condition>) => setForm((f) => ({ ...f, conds: f.conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const pickField = (i: number, value: string) => {
    const def = fieldDef(value);
    if (def?.fixed) setCond(i, { field: value, operator: def.fixed.operator, value: def.fixed.value });
    else setCond(i, { field: value === CUSTOM_FIELD ? "" : value, ...(fieldDef(form.conds[i].field)?.fixed ? { operator: "equal", value: "" } : {}) });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setProblem("Enter a name for the rule."); return; }
    let builder: RuleBuilder;
    if (form.original) builder = form.original;
    else {
      if (form.conds.length === 0) { setProblem("Add at least one condition."); return; }
      if (form.conds.some((c) => !FIELD_PATTERN.test(c.field) || (!NO_VALUE_OPERATORS.has(c.operator) && !c.value.trim()))) {
        setProblem("Every condition needs a field and a value."); return;
      }
      builder = toBuilder(form.condition, form.conds);
    }
    const delay = Number(form.delayMin), interval = Number(form.intervalMin), count = form.count.trim() === "" ? -1 : Number(form.count);
    if (![delay, interval, count].every((n) => Number.isInteger(n) && n >= -1) || delay < 0 || interval < 0) {
      setProblem("Enter whole numbers for the times and the maximum."); return;
    }
    if (form.scope === "devices" && form.deviceIds.length === 0) { setProblem("Choose at least one device."); return; }
    setProblem(null);
    save.mutate({
      name: form.name.trim(), severity: form.severity, builder, scope: form.scope, devices: form.deviceIds, disabled: !form.enabled,
      mute: form.mute, count, delay: delay * 60, interval: interval * 60, notes: form.notes.trim(),
    });
  };

  const customField = (f: string) => !fieldDef(f);

  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-2xl rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/50">
      <form onSubmit={submit} className="max-h-[88vh] space-y-5 overflow-y-auto p-5">
        <h2 className="text-base font-semibold">{rule ? t("Edit rule") : t("Add rule")}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            {t("Rule name")}
            <input value={form.name} onChange={(e) => set("name", e.target.value)} dir="auto" maxLength={255} required className={input} autoFocus />
          </label>
          <label className="block text-sm">
            {t("Severity")}
            <select value={form.severity} onChange={(e) => set("severity", e.target.value as RuleSeverity)} className={input}>
              <option value="ok">{t("Ok")}</option>
              <option value="warning">{t("Warning")}</option>
              <option value="critical">{t("Critical")}</option>
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            {t("Rule is enabled")}
          </label>
        </div>

        <fieldset className="space-y-3 rounded-md border border-line p-4">
          <legend className="px-1 text-xs text-dim">{t("Conditions")}</legend>
          {form.original ? (
            <div className="space-y-2 text-sm">
              <p className="text-dim">{t("These conditions use groups that can only be edited in LibreNMS. The other settings can still be changed here.")}</p>
              <p dir="ltr" className="rounded bg-sunken p-2 text-xs">{summarize(form.original, t)}</p>
            </div>
          ) : (
            <>
              {form.conds.length > 1 && (
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  {t("Match")}
                  <select value={form.condition} onChange={(e) => set("condition", e.target.value as "AND" | "OR")} aria-label={t("Match")} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm">
                    <option value="AND">{t("All of the conditions")}</option>
                    <option value="OR">{t("Any of the conditions")}</option>
                  </select>
                </label>
              )}
              {form.conds.map((c, i) => {
                const def = fieldDef(c.field);
                const custom = customField(c.field);
                return (
                  <div key={i} className="grid gap-2 rounded-md bg-sunken/50 p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end">
                    <label className="block text-xs text-dim">
                      {t("Field")}
                      <select value={custom ? CUSTOM_FIELD : c.field} onChange={(e) => pickField(i, e.target.value)} aria-label={t("Field")} className={`${input} text-ink`}>
                        {FIELDS.map((f) => <option key={f.field} value={f.field}>{t(f.label)}</option>)}
                        <option value={CUSTOM_FIELD}>{t("Custom field…")}</option>
                      </select>
                      {custom && (
                        <input value={c.field} onChange={(e) => setCond(i, { field: e.target.value.trim() })} dir="ltr" placeholder="table.column" aria-label={t("Custom field (table.column)")} className={`${input} text-ink`} />
                      )}
                    </label>
                    {def?.fixed ? (
                      <p className="text-xs text-dim sm:col-span-2 sm:pb-2">{t("Checked automatically")}</p>
                    ) : (
                      <>
                        <label className="block text-xs text-dim">
                          {t("Operator")}
                          <select value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value })} aria-label={t("Operator")} className={`${input} text-ink`}>
                            {!OPERATORS.some((o) => o.value === c.operator) && <option value={c.operator}>{c.operator}</option>}
                            {OPERATORS.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs text-dim">
                          {t("Value")}
                          <input value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} aria-label={t("Value")} dir="ltr" placeholder={def?.hint} disabled={NO_VALUE_OPERATORS.has(c.operator)} className={`${input} text-ink`} />
                        </label>
                      </>
                    )}
                    <button type="button" onClick={() => set("conds", form.conds.filter((_, j) => j !== i))} aria-label={t("Remove condition")} className="grid h-9 w-9 place-items-center justify-self-end rounded-md border border-line hover:bg-sunken">
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
              {form.conds.length < MAX_CONDITIONS && (
                <button type="button" onClick={() => set("conds", [...form.conds, { field: "devices.status", operator: "equal", value: "0" }])} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">
                  <Plus size={14} aria-hidden /> {t("Add condition")}
                </button>
              )}
            </>
          )}
        </fieldset>

        <fieldset className="space-y-3 rounded-md border border-line p-4">
          <legend className="px-1 text-xs text-dim">{t("Applies to")}</legend>
          {rule && <p className="text-xs text-dim">{t("LibreNMS does not report which devices a rule applies to. Saving replaces its scope with the choice below.")}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={form.scope === "all"} onChange={() => set("scope", "all")} />{t("All devices")}</label>
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={form.scope === "devices"} onChange={() => set("scope", "devices")} />{t("Selected devices")}</label>
          </div>
          {form.scope === "devices" && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line p-2">
              {deviceList.length === 0 && <p className="p-1 text-xs text-dim">{t("Loading")}</p>}
              {deviceList.map((d) => (
                <label key={d.device_id} className="flex items-center gap-2 px-1 text-sm">
                  <input type="checkbox" checked={form.deviceIds.includes(d.device_id)} onChange={(e) => set("deviceIds", e.target.checked ? [...form.deviceIds, d.device_id] : form.deviceIds.filter((x) => x !== d.device_id))} />
                  <bdi dir="auto">{d.display || d.sysName || d.hostname}</bdi>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <label className="block text-sm">
            {t("Wait before alerting (minutes)")}
            <input value={form.delayMin} onChange={(e) => set("delayMin", e.target.value)} inputMode="numeric" dir="ltr" className={input} />
          </label>
          <label className="block text-sm">
            {t("Repeat every (minutes, 0 = once)")}
            <input value={form.intervalMin} onChange={(e) => set("intervalMin", e.target.value)} inputMode="numeric" dir="ltr" className={input} />
          </label>
          <label className="block text-sm">
            {t("Maximum alerts (empty = no limit)")}
            <input value={form.count} onChange={(e) => set("count", e.target.value)} inputMode="numeric" dir="ltr" className={input} />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.mute} onChange={(e) => set("mute", e.target.checked)} className="mt-0.5" />
          <span>{t("Mute: show in the app but do not send notifications")}</span>
        </label>
        <label className="block text-sm">
          {t("Notes")}
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} dir="auto" rows={2} maxLength={1000} className={input} />
        </label>

        {problem && <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">{t(problem)}</div>}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{t("Cancel")}</button>
          <button type="submit" disabled={save.isPending} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60">
            {save.isPending ? t("Saving") : t("Save rule")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
