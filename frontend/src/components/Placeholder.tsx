import { useI18n } from "../lib/i18n";

export default function Placeholder({ title, note }: { title: string; note: string }) {
  const { t } = useI18n();
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{t(title)}</h1>
      <p className="mt-2 max-w-prose text-dim">{t(note)}</p>
    </div>
  );
}
