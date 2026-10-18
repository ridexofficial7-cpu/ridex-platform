import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminContext, DashboardMetrics, Environment, Screen } from "./types";
import { isScreenVisible } from "./config/navigation";
import { AdminLayout } from "./layouts/AdminLayout";
import { PixelLoader } from "./components/ui";
import { loadAdminContext, loadDashboard, logout, request } from "./lib/api";
import { RealtimeClient, type RealtimeEvent } from "./lib/realtime";
import { RIDEX_API } from "./lib/apiContract";
import { storage } from "./lib/storage";
import { RUNTIME_CONFIG_WARNING } from "./lib/runtimeConfig";
import { getEnvironmentConfigWarning, getSelectedEnvironment } from "./lib/environmentSelection";
import { useLanguage } from "./lib/i18n";
import "./styles.css";

const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const AdminModulePage = lazy(() => import("./pages/AdminModulePage").then((m) => ({ default: m.AdminModulePage })));

function envFromValue(value: unknown): Environment | null {
  const raw = String(value ?? "").toUpperCase();
  return raw === "LIVE" || raw === "PRODUCTION" ? "LIVE" : raw === "TEST" ? "TEST" : null;
}

export default function App() {
  const { t } = useLanguage();
  const [context, setContext] = useState<AdminContext | null>(null);
  const [screen, setScreen] = useState<Screen>(storage.screen);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardLastUpdatedAt, setDashboardLastUpdatedAt] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<Environment>(getSelectedEnvironment());
  const [realtime, setRealtime] = useState<"connecting" | "connected" | "offline">("offline");
  const [realtimeEvent, setRealtimeEvent] = useState<{ type: string; at: string; replayGap: boolean }>({ type: "", at: "", replayGap: false });
  const [ready, setReady] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const dashboardRefreshTimer = useRef<number | null>(null);
  const dashboardRequestSequence = useRef(0);
  const clearTransientAuthMessage = useCallback(() => {
    setAuthMessage((current) => current.startsWith("Environment mismatch:") ? current : "");
  }, []);

  const refreshDashboard = useCallback(async () => {
    const sequence = ++dashboardRequestSequence.current;
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const dash = await loadDashboard();
      if (sequence !== dashboardRequestSequence.current) return;
      setMetrics(dash);
      setDashboardLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      if (sequence !== dashboardRequestSequence.current) return;
      setDashboardError(error instanceof Error ? error.message : "Dashboard API unavailable");
    } finally {
      if (sequence === dashboardRequestSequence.current) setDashboardLoading(false);
    }
  }, []);

  const hydrate = useCallback(async (token?: string) => {
    const hadExistingSession = Boolean(token || storage.token);
    if (token) { storage.token = token; setAuthMessage(""); }
    if (!storage.token) {
      setContext(null);
      setReady(true);
      return;
    }
    try {
      // If the backend identifies its environment, fail closed on a TEST/LIVE mismatch.
      // Health endpoints may omit the mode; in that case the deployment config remains the client label.
      let backendEnv: Environment | null = null;
      try {
        const health = await request<any>(RIDEX_API.health);
        backendEnv = envFromValue(health.mode ?? health.environment ?? health.data?.mode ?? health.data?.environment);
      } catch {
        // The health endpoint may be unavailable. Auth still relies on the backend session and access checks.
      }
      if (backendEnv && backendEnv !== getSelectedEnvironment()) {
        throw new Error(`Environment mismatch: this Admin Web is configured for ${getSelectedEnvironment()}, but the backend reports ${backendEnv}. Access is blocked to prevent TEST/LIVE cross-environment use.`);
      }
      setEnvironment(getSelectedEnvironment());
      const ctx = await loadAdminContext();
      setContext(ctx);
      void refreshDashboard();
    } catch (error) {
      storage.token = "";
      setContext(null);
      setRealtime("offline");
      if (hadExistingSession && !token) {
        setAuthMessage("Your RideX Admin session expired or is no longer valid. Please sign in again; non-sensitive unsent drafts saved in this tab may remain available.");
      } else if (token) {
        setAuthMessage(error instanceof Error && error.message.startsWith("Environment mismatch:")
          ? error.message
          : "The sign-in response was accepted, but the Admin profile could not be loaded. Check backend access/permissions and try again.");
      }
    } finally {
      setReady(true);
    }
  }, [refreshDashboard]);

  useEffect(() => { void hydrate(); }, [hydrate]);

  useEffect(() => {
    if (!context) return;
    storage.screen = screen;
  }, [context, screen]);

  useEffect(() => {
    const handleAuthExpired = () => {
      dashboardRequestSequence.current += 1;
      setDashboardLoading(false);
      setDashboardError("");
      storage.token = "";
      setContext(null);
      setRealtime("offline");
      setMetrics(null);
      setDashboardLastUpdatedAt(null);
      setScreen("dashboard");
      setAuthMessage("Your RideX Admin session expired or was revoked. Please sign in again.");
      setReady(true);
    };
    window.addEventListener("ridex-admin-auth-expired", handleAuthExpired);
    return () => window.removeEventListener("ridex-admin-auth-expired", handleAuthExpired);
  }, []);

  useEffect(() => {
    if (!context) return;
    if (!isScreenVisible(context, screen)) {
      setScreen("dashboard");
      storage.screen = "dashboard";
    }
  }, [context, screen]);

  useEffect(() => {
    if (!context) {
      setRealtime("offline");
      return;
    }
    const queueDashboardRefresh = () => {
      if (dashboardRefreshTimer.current !== null) return;
      dashboardRefreshTimer.current = window.setTimeout(() => {
        dashboardRefreshTimer.current = null;
        void refreshDashboard();
      }, 350);
    };
    const client = new RealtimeClient(
      "ADMIN",
      context.adminId,
      (status) => setRealtime(status),
      (event: RealtimeEvent) => {
        const replayGap = event.type === "REPLAY_GAP";
        const eventType = String(event.type || "message");
        const at = new Date().toISOString();
        setRealtimeEvent({ type: eventType, at, replayGap });
        window.dispatchEvent(new CustomEvent("ridex-admin-realtime", { detail: event }));
        if (replayGap) window.dispatchEvent(new CustomEvent("ridex-admin-realtime-resync", { detail: event }));
        queueDashboardRefresh();
      },
    );
    client.start();
    const timer = window.setInterval(() => { void refreshDashboard(); }, 30000);
    return () => { client.stop(); window.clearInterval(timer); if (dashboardRefreshTimer.current !== null) { window.clearTimeout(dashboardRefreshTimer.current); dashboardRefreshTimer.current = null; } };
  }, [context, refreshDashboard]);

  const navigate = useCallback((next: Screen) => {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const signOut = useCallback(async () => {
    let message = "";
    try {
      await logout();
    } catch {
      message = t("auth.signOutLocalOnly", "You were signed out locally, but the server could not confirm session revocation. Contact an administrator if this repeats.");
    } finally {
      dashboardRequestSequence.current += 1;
      setDashboardLoading(false);
      setDashboardError("");
      try { storage.token = ""; } catch { /* restricted storage */ }
      setContext(null);
      setRealtime("offline");
      setMetrics(null);
      setDashboardLastUpdatedAt(null);
      setScreen("dashboard");
      setAuthMessage(message);
      setReady(true);
    }
  }, [t]);

  const page = useMemo(() => {
    if (screen === "dashboard") {
      return <DashboardPage metrics={metrics} context={context!} navigate={navigate} loading={dashboardLoading} onRefresh={refreshDashboard} error={dashboardError} lastUpdatedAt={dashboardLastUpdatedAt} realtime={realtime} realtimeEvent={realtimeEvent} environment={environment} />;
    }
    return <AdminModulePage screen={screen} context={context!} environment={environment} realtime={realtime} realtimeEvent={realtimeEvent} />;
  }, [screen, metrics, context, navigate, dashboardLoading, dashboardError, dashboardLastUpdatedAt, realtime, realtimeEvent, environment]);

  if (!ready) return <div className="rx-boot"><div className="rx-boot-card"><div className="rx-logo large">R<span>X</span></div><PixelLoader variant="center" label={t("common.loading")} steps={[{label:"Authenticating"},{label:"Loading permissions"},{label:"Preparing workspace"}]}/></div></div>;
  if (!context) return <Suspense fallback={<div className="rx-boot"><PixelLoader variant="center" label={t("common.loading")}/></div>}><LoginPage authMessage={authMessage} configWarning={getEnvironmentConfigWarning(environment) || RUNTIME_CONFIG_WARNING} environment={environment} onLoginAttempt={clearTransientAuthMessage} onAuthenticated={hydrate} /></Suspense>;
  return <><a className="rx-skip-link" href="#ridex-main">Skip to main content</a><Suspense fallback={<div className="rx-boot"><PixelLoader variant="center" label={t("common.loading")}/></div>}><AdminLayout context={context} environment={environment} currentScreen={screen} onNavigate={navigate} onLogout={signOut} realtime={realtime} onToggleMobile={() => document.getElementById("ridex-admin-sidebar")?.classList.toggle("mobile-open")}>{page}</AdminLayout></Suspense></>;
}
