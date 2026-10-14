import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useI18n } from "../lib/i18n";
import { ErrorNote } from "./ui";

/** A small "are you sure?" dialog for destructive actions. */
export default function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose }: {
  open: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => Promise<unknown>; onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const run = useMutation({ mutationFn: onConfirm, onSuccess: onClose });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { run.reset(); d.showModal(); }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-md rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/50">
      <div className="space-y-4 p-5">
        <h2 className="text-base font-semibold" dir="auto">{title}</h2>
        <p className="text-sm text-dim" dir="auto">{body}</p>
        <ErrorNote error={run.error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{t("Cancel")}</button>
          <button type="button" onClick={() => run.mutate()} disabled={run.isPending} className="rounded-md bg-down px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60">
            {run.isPending ? t("Please wait") : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
