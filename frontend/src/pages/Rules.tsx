import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { AlertRule } from "../api/types";
import ConfirmDialog from "../components/ConfirmDialog";
import RuleDialog from "../components/RuleDialog";
import { Empty, ErrorNote, Panel } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useFormat } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useRefresh } from "../lib/refresh";
import { summarize, TEMPLATES, type RuleTemplate } from "../lib/rules";

const TONE: Record<string, string> = { critical: "text-down", warning: "text-warn", ok: "text-up" };

export default function Rules() {
  const { t } = useI18n();
  const f = useFormat();
  const { isAdmin } = useAuth();
  const { ms } = useRefresh();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["rules"], queryFn: api.rules, refetchInterval: ms });
  const rules = q.data?.data ?? [];

  const [dialog, setDialog] = useState<{ rule: AlertRule | null; template: RuleTemplate | null } | null>(null);
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteRule(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rules"] }); qc.invalidateQueries({ queryKey: ["alerts"] }); },
  });

  const sorted = useMemo(() => [...rules].sort((a, b) => a.name.localeCompare(b.name)), [rules]);
  const label = (s: string) => (s === "critical" ? t("Critical") : s === "warning" ? t("Warning") : t("Ok"));
  const sum = (r: AlertRule) => summarize(r.builder, t, t("AND"), t("OR"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("Alert rules")}</h1>
          <p className="mt-1 max-w-prose text-sm text-dim">
            {q.isLoading ? t("Loading") : `${t("Rules that raise alerts when a device matches their conditions.")} · ${t("{n} rules", { n: f.num(rules.length) })}`}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setDialog({ rule: null, template: null })} className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg">
            <Plus size={14} aria-hidden /> {t("Add rule")}
          </button>
        )}
      </div>

      <ErrorNote error={q.error} />

      {isAdmin && (
        <Panel title={t("Start from a template")}>
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((tp) => (
              <li key={tp.key} className="flex flex-col justify-between gap-3 rounded-md border border-line p-3">
                <div>
                  <div className="font-medium" dir="auto">{t(tp.name)}</div>
                  <p className="mt-1 text-xs text-dim" dir="auto">{t(tp.description)}</p>
                </div>
                <button onClick={() => setDialog({ rule: null, template: tp })} className="self-start rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{t("Use this template")}</button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={t("Rules")}>
        {q.isLoading ? (
          <Empty>{t("Loading")}</Empty>
        ) : sorted.length === 0 ? (
          <Empty>{isAdmin ? t("No alert rules yet. Pick a template above or click Add rule.") : t("No alert rules yet. Ask an administrator to add alert rules.")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="rt w-full min-w-[760px] text-sm">
              <thead className="border-b border-line bg-sunken text-xs text-dim">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Rule")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Severity")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Conditions")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">{t("Status")}</th>
                  {isAdmin && <th scope="col" className="px-4 py-2.5"><span className="sr-only">{t("Actions")}</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((r) => (
                  <tr key={r.id} className={r.disabled ? "text-dim" : ""}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium" dir="auto">{r.name}</div>
                      {r.notes && <div className="text-xs text-dim" dir="auto">{r.notes}</div>}
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-semibold ${TONE[r.severity] ?? ""}`}>{label(r.severity)}</td>
                    <td className="max-w-md px-4 py-2.5 text-xs" dir="auto"><bdi>{sum(r)}</bdi></td>
                    <td className="px-4 py-2.5 text-xs">{r.disabled ? t("Disabled") : r.mute ? t("Muted") : t("Enabled")}</td>
                    {isAdmin && (
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setDialog({ rule: r, template: null })} disabled={!r.builder}
                            title={r.builder ? undefined : t("This rule uses an older format and can only be edited in LibreNMS.")}
                            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs hover:bg-sunken disabled:opacity-50"
                          >
                            <Pencil size={12} aria-hidden /> {t("Edit")}
                          </button>
                          <button onClick={() => setDeleting(r)} className="inline-flex items-center gap-1.5 rounded-md border border-down/50 px-2.5 py-1 text-xs text-down hover:bg-down/10">
                            <Trash2 size={12} aria-hidden /> {t("Delete")}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <RuleDialog open={!!dialog} onClose={() => setDialog(null)} rule={dialog?.rule ?? null} template={dialog?.template ?? null} />
      <ConfirmDialog
        open={!!deleting} onClose={() => setDeleting(null)}
        title={t("Delete this rule?")} body={t("Alerts from this rule will stop. This cannot be undone.")} confirmLabel={t("Delete")}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </div>
  );
}
