import type { ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { useFormat } from "../lib/format";

export function StatusBadge({ up }: { up: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${up ? "text-up" : "text-down"}`}>
      <span className={`h-2 w-2 rounded-full ${up ? "bg-up" : "bg-down"}`} aria-hidden />
      {up ? t("Up") : t("Down")}
    </span>
  );
}

export function Meter({ value, label }: { value?: number; label: string }) {
  const f = useFormat();
  if (value === undefined) return <span className="text-dim">—</span>;
  const v = Math.max(0, Math.min(100, value));
  const tone = v >= 90 ? "bg-down" : v >= 75 ? "bg-warn" : "bg-up";
  return (
    <div className="flex items-center gap-2" title={`${label} ${f.pct(v)}`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken" role="meter" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-11 text-end text-xs tabular-nums">{f.pct(v)}</span>
    </div>
  );
}

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Translate a backend message. If LibreNMS appended its own detail after the first sentence,
 *  translate the known first sentence and keep the detail as is. */
export function translateMessage(t: (k: string) => string, msg: string) {
  const full = t(msg);
  if (full !== msg) return full;
  const i = msg.indexOf(". ");
  if (i > 0) {
    const head = msg.slice(0, i + 1);
    if (t(head) !== head) return `${t(head)} ${msg.slice(i + 2)}`;
  }
  return msg;
}

export function ErrorNote({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <div className="rounded-md border border-down/40 bg-down/10 px-4 py-3 text-sm" role="alert">
      {translateMessage(t, (error as Error).message)}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-dim">{children}</div>;
}
