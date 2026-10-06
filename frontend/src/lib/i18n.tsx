import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fa } from "./fa";

export type Lang = "en" | "fa";
type Vars = Record<string, string | number>;

interface I18n {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: string, vars?: Vars) => string;
}

const Ctx = createContext<I18n>({ lang: "en", dir: "ltr", setLang: () => {}, toggleLang: () => {}, t: (k) => k });

function apply(lang: Lang) {
  const el = document.documentElement;
  el.setAttribute("lang", lang);
  el.setAttribute("dir", lang === "fa" ? "rtl" : "ltr");
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (document.documentElement.getAttribute("lang") === "fa" ? "fa" : "en"));

  useEffect(() => {
    apply(lang);
    try {
      localStorage.setItem("padi-lang", lang);
    } catch {
      /* storage unavailable */
    }
  }, [lang]);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      // English text is the key. Anything missing from the Persian table falls back to English.
      let s = lang === "fa" ? fa[key] ?? key : key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo<I18n>(
    () => ({
      lang,
      dir: lang === "fa" ? "rtl" : "ltr",
      setLang: setLangState,
      toggleLang: () => setLangState((l) => (l === "fa" ? "en" : "fa")),
      t,
    }),
    [lang, t],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

/** Wrap a name (hostname, rule) so it keeps its own direction inside a sentence of the other direction. */
export const isolate = (s: string | number) => `\u2068${s}\u2069`;
