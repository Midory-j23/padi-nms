import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AuthUser } from "../api/types";
import { clearToken, getToken, setToken, UNAUTHORIZED_EVENT } from "./session";

type Phase = "loading" | "offline" | "setup" | "anon" | "authed";

interface AuthValue {
  phase: Phase;
  user: AuthUser | null;
  isAdmin: boolean;
  /** Set when the server could not be reached while checking the session. */
  offlineError: string | null;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  setup: (username: string, password: string, fullName: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reset = useCallback((next: Phase) => {
    clearToken();
    setUser(null);
    qc.clear(); // the next person must never see the previous person's cached data
    setPhase(next);
  }, [qc]);

  // Decide what to show on start: first-run setup, login, or straight in with a saved session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase("loading");
      try {
        const st = await api.authStatus();
        if (cancelled) return;
        if (st.data.needs_setup) { reset("setup"); return; }
        if (!getToken()) { setPhase("anon"); return; }
        try {
          const me = await api.me();
          if (cancelled) return;
          setUser(me.data);
          setPhase("authed");
        } catch {
          if (!cancelled) reset("anon");
        }
      } catch (e) {
        if (cancelled) return;
        setOfflineError(e instanceof Error ? e.message : "The backend is not reachable. Check the backend address in Settings.");
        setPhase("offline");
      }
    })();
    return () => { cancelled = true; };
  }, [attempt, reset]);

  // The server rejected our token (expired, signed out elsewhere, account disabled).
  useEffect(() => {
    const onExpired = () => reset("anon");
    window.addEventListener(UNAUTHORIZED_EVENT, onExpired);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onExpired);
  }, [reset]);

  const enter = (s: { token: string; user: AuthUser }, remember: boolean) => {
    qc.clear();
    setToken(s.token, remember);
    setUser(s.user);
    setPhase("authed");
  };

  const value = useMemo<AuthValue>(() => ({
    phase,
    user,
    isAdmin: user?.role === "admin",
    offlineError,
    login: async (username, password, remember) => { enter((await api.login(username, password, remember)).data, remember); },
    setup: async (username, password, fullName, remember) => { enter((await api.setupAdmin(username, password, fullName, remember)).data, remember); },
    logout: async () => {
      try { await api.logout(); } catch { /* signing out locally is enough if the server is unreachable */ }
      reset("anon");
    },
    retry: () => setAttempt((n) => n + 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [phase, user, offlineError, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
