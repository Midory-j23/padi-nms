import { createContext, useContext, useState, type ReactNode } from "react";
import { useI18n } from "./i18n";
import { useFormat } from "./format";

const OPTIONS = [0, 15, 30, 60, 300] as const;
export type Interval = (typeof OPTIONS)[number];

const Ctx = createContext<{ seconds: Interval; setSeconds: (s: Interval) => void; ms: number | false }>({
  seconds: 30,
  setSeconds: () => {},
  ms: 30000,
});

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [seconds, setSeconds] = useState<Interval>(30);
  return <Ctx.Provider value={{ seconds, setSeconds, ms: seconds ? seconds * 1000 : false }}>{children}</Ctx.Provider>;
}
export const useRefresh = () => useContext(Ctx);
export const REFRESH_OPTIONS = OPTIONS;

/** Label for an interval option, e.g. "30 s" or "5 min", in the current language. */
export function useIntervalLabel() {
  const { t } = useI18n();
  const f = useFormat();
  return (s: number) => (s === 0 ? t("Off") : s < 60 ? t("{s} s", { s: f.num(s) }) : t("{m} min", { m: f.num(s / 60) }));
}
