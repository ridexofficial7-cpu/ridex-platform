import React, { Component, type ErrorInfo, type ReactNode } from "react";

type ApiSignal = { state: "unknown" | "reachable" | "degraded"; observedAt?: string; statusCode?: number };

export class AdminErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    // Avoid emitting raw exception messages/stacks that could contain user data or secrets.
    console.error("RIDEX_ADMIN_UI_ERROR", { name: error?.name || "Error" });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="rx-boot"><div className="rx-system-error"><strong>RideX Admin needs to recover</strong><span>An unexpected interface error occurred. Sensitive details were not displayed.</span><button className="rx-btn primary" onClick={() => window.location.reload()}>Reload Admin</button></div></div>;
  }
}

export function BackendRequestStatus() {
  const [signal, setSignal] = React.useState<ApiSignal>({ state: "unknown" });
  React.useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<ApiSignal>).detail;
      if (!detail || !["reachable", "degraded"].includes(detail.state)) return;
      setSignal(detail);
    };
    window.addEventListener("ridex-admin-api-signal", handle);
    return () => window.removeEventListener("ridex-admin-api-signal", handle);
  }, []);
  if (signal.state !== "degraded") return null;
  const when = signal.observedAt ? new Date(signal.observedAt).toLocaleString() : "time unavailable";
  return <div className="rx-api-degraded-banner" role="status"><strong>API request issue detected.</strong> The latest network/server signal was at {when}{signal.statusCode ? ` (HTTP ${signal.statusCode})` : ""}. This is not a full platform-health check. Refresh or check the monitoring/runbook before taking another action.</div>;
}

export function OfflineBanner() {
  const [offline, setOffline] = React.useState(() => typeof navigator !== "undefined" ? !navigator.onLine : false);
  React.useEffect(() => { const online = () => setOffline(false); const offline = () => setOffline(true); window.addEventListener("online", online); window.addEventListener("offline", offline); return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); }; }, []);
  if (!offline) return null;
  return <div className="rx-offline-banner" role="status">Network offline. Previously loaded records, if present, may be stale. Reconnect and refresh before relying on them. Mutating actions are not automatically replayed.</div>;
}
