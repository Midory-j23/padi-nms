import { Component, type ErrorInfo, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";

function Fallback({ error }: { error: Error }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-lg space-y-3 rounded-lg border border-down/40 bg-down/10 p-5 text-sm" role="alert">
      <h2 className="text-base font-semibold">{t("Something went wrong on this page.")}</h2>
      <p className="text-dim">{t("The rest of the app still works. Try again, or go back.")}</p>
      <pre dir="ltr" className="max-h-40 overflow-auto rounded bg-sunken p-3 text-xs">{error.message}</pre>
      <button onClick={() => window.location.reload()} className="rounded-md bg-accent px-3 py-1.5 font-semibold text-bg">{t("Reload page")}</button>
    </div>
  );
}

/** Keeps one broken page from blanking the whole app. Pass a changing `resetKey` (the route) to recover on navigation. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Page crashed:", error, info.componentStack); }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() { return this.state.error ? <Fallback error={this.state.error} /> : this.props.children; }
}
