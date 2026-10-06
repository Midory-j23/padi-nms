import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useIsFetching, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, Cable, FileText, Gauge, Languages, LayoutDashboard, Map, Moon, RefreshCw,
  Menu, Server, Settings, Sun, Wrench, X,
} from "lucide-react";
import { api } from "../api/client";
import { useTheme } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { REFRESH_OPTIONS, useIntervalLabel, useRefresh, type Interval } from "../lib/refresh";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/devices", label: "Devices", icon: Server },
  { to: "/ports", label: "Ports", icon: Cable },
  { to: "/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/availability", label: "Availability", icon: Activity },
  { to: "/services", label: "Services", icon: Wrench },
  { to: "/logs", label: "Logs", icon: FileText },
  { to: "/map", label: "Network map", icon: Map },
  { to: "/performance", label: "Performance", icon: Gauge },
  { to: "/settings", label: "Settings", icon: Settings },
];

function StatusPill() {
  const { t } = useI18n();
  const { ms } = useRefresh();
  const q = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: ms });
  let label = t("Checking connection");
  let tone = "bg-dim";
  if (q.isError) {
    label = t("Backend offline");
    tone = "bg-down";
  } else if (q.data) {
    if (q.data.source === "mock") {
      label = t("Sample data");
      tone = "bg-warn";
    } else if (q.data.status === "ok") {
      label = q.data.version ? t("LibreNMS {version}", { version: q.data.version }) : t("LibreNMS connected");
      tone = "bg-up";
    } else {
      label = t("LibreNMS unreachable");
      tone = "bg-down";
    }
  }
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs" role="status">
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  );
}

function NavList() {
  const { t } = useI18n();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label={t("Main navigation")}>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors md:py-2 ${
              isActive ? "bg-accent/10 font-semibold text-accent" : "text-dim hover:bg-sunken hover:text-ink"
            }`
          }
        >
          <Icon size={16} aria-hidden />
          {t(label)}
        </NavLink>
      ))}
    </nav>
  );
}

function RefreshSelect() {
  const { t } = useI18n();
  const intervalLabel = useIntervalLabel();
  const { seconds, setSeconds } = useRefresh();
  return (
    <label className="flex items-center gap-2 text-xs text-dim">
      {t("Refresh")}
      <select
        className="rounded-md border border-line bg-panel px-2 py-1.5 text-xs text-ink"
        value={seconds}
        onChange={(e) => setSeconds(Number(e.target.value) as Interval)}
      >
        {REFRESH_OPTIONS.map((o) => (
          <option key={o} value={o}>
            {intervalLabel(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Copy each column header into its cells so tables can show "label: value" rows on phones. */
function useTableLabels(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const label = () => {
      el.querySelectorAll<HTMLTableElement>("table.rt").forEach((table) => {
        const heads = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
        table.querySelectorAll("tbody tr").forEach((tr) => {
          Array.from(tr.children).forEach((td, i) => {
            if (heads[i]) { if (td.getAttribute("data-label") !== heads[i]) td.setAttribute("data-label", heads[i]); }
            else td.removeAttribute("data-label");
          });
        });
      });
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(label); };
    label();
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [root]);
}

export default function Layout() {
  const { theme, toggle } = useTheme();
  const { lang, toggleLang, t } = useI18n();
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef);
  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);
  const fetching = useIsFetching() > 0;

  return (
    <div className="flex h-full">
      <aside className="hidden w-56 shrink-0 flex-col border-e border-line bg-panel md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-line px-5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-bg">P</div>
          <span className="text-[15px] font-semibold tracking-tight">Padi NMS</span>
        </div>
        <NavList />
      </aside>

      {menu && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenu(false)} aria-hidden />
          <aside id="mobile-menu" className="absolute inset-y-0 start-0 flex w-64 max-w-[80vw] flex-col border-e border-line bg-panel shadow-xl" aria-label={t("Main navigation")}>
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-bg">P</div>
                <span className="text-[15px] font-semibold tracking-tight">Padi NMS</span>
              </div>
              <button onClick={() => setMenu(false)} aria-label={t("Close menu")} className="grid h-8 w-8 place-items-center rounded-md border border-line hover:bg-sunken">
                <X size={15} />
              </button>
            </div>
            <NavList />
            <div className="border-t border-line p-4 sm:hidden"><RefreshSelect /></div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line bg-panel px-3 sm:gap-3 sm:px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMenu(true)}
              aria-label={t("Open menu")}
              aria-expanded={menu}
              aria-controls="mobile-menu"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line hover:bg-sunken md:hidden"
            >
              <Menu size={16} />
            </button>
            <StatusPill />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden sm:block"><RefreshSelect /></div>
            <button
              onClick={() => qc.invalidateQueries()}
              aria-label={t("Refresh now")}
              className="flex h-8 items-center gap-2 rounded-md border border-line px-2.5 text-xs hover:bg-sunken sm:px-3"
            >
              <RefreshCw size={14} className={fetching ? "animate-spin" : ""} aria-hidden />
              <span className="hidden sm:inline">{t("Refresh now")}</span>
            </button>
            <button
              onClick={toggle}
              aria-label={theme === "dark" ? t("Switch to light theme") : t("Switch to dark theme")}
              className="grid h-8 w-8 place-items-center rounded-md border border-line hover:bg-sunken"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              onClick={toggleLang}
              aria-label={t("Switch language")}
              title={t("Switch language")}
              className="flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs hover:bg-sunken"
            >
              <Languages size={14} aria-hidden />
              {/* Each language is always written in its own script. */}
              {lang === "fa" ? "English" : "فارسی"}
            </button>
          </div>
        </header>
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
