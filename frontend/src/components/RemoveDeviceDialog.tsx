import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { isolate, useI18n } from "../lib/i18n";
import { ErrorNote } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  id: string;
  hostname: string;
  label: string;
}

// Removing a device deletes its history in LibreNMS and cannot be undone,
// so the person must type the host name before the button works.
export default function RemoveDeviceDialog({ open, onClose, id, hostname, label }: Props) {
  const { t } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");

  const remove = useMutation({
    mutationFn: () => api.removeDevice(id),
    onSuccess: () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] === "device" && String(q.queryKey[1]) === String(id) });
      for (const key of ["devices", "alerts", "ports", "services", "topology", "events"]) qc.invalidateQueries({ queryKey: [key] });
      onClose();
      nav("/devices", { replace: true });
    },
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTyped("");
      remove.reset();
      d.showModal();
    }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matches = typed.trim().toLowerCase() === hostname.trim().toLowerCase() && hostname.trim() !== "";

  return (
    <dialog ref={ref} onClose={onClose} className="w-full max-w-md rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/50">
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches && !remove.isPending) remove.mutate();
        }}
      >
        <div>
          <h2 className="text-base font-semibold">{t("Remove device")}</h2>
          <p className="mt-2 text-sm">
            {t("This removes {name} from LibreNMS together with its history, graphs and alerts. It cannot be undone.", { name: isolate(label) })}
          </p>
        </div>
        <label className="block text-sm">
          {t("Type {host} to confirm.", { host: isolate(hostname) })}
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
          />
        </label>
        {remove.error && <ErrorNote error={remove.error} />}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{t("Cancel")}</button>
          <button type="submit" disabled={!matches || remove.isPending} className="rounded-md bg-down px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {remove.isPending ? t("Removing") : t("Remove device")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
