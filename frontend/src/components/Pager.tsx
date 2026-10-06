import { useI18n } from "../lib/i18n";
import { useFormat } from "../lib/format";

export default function Pager({ page, pages, total, size, onPage }: { page: number; pages: number; total: number; size: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  const f = useFormat();
  if (total <= size) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-dim">
      <span>
        {t("{from} to {to} of {total}", { from: f.num(page * size + 1), to: f.num(Math.min((page + 1) * size, total)), total: f.num(total) })}
      </span>
      <div className="flex gap-2">
        <button disabled={page === 0} onClick={() => onPage(page - 1)} className="rounded-md border border-line px-3 py-1.5 enabled:hover:bg-sunken disabled:opacity-40">{t("Previous")}</button>
        <button disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className="rounded-md border border-line px-3 py-1.5 enabled:hover:bg-sunken disabled:opacity-40">{t("Next")}</button>
      </div>
    </div>
  );
}
