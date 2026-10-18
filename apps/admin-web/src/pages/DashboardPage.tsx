import { AlertTriangle, CarFront, CheckCircle2, MapPinned, ReceiptText, RefreshCw, ShieldCheck, Users, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import type { AdminContext, DashboardMetrics, Environment, Screen } from "../types";
import { Button, Card, Notice, PixelLoader, Skeleton, StatusPill } from "../components/ui";
import { formatCurrencyINR } from "../lib/locale";
import { GeoMap } from "../components/GeoMap";
import { useLanguage } from "../lib/i18n";
import { DEBUG_ENABLED } from "../lib/runtimeConfig";
import { safeDisplayJson } from "../lib/displayData";

type Props = {
  metrics: DashboardMetrics | null;
  context: AdminContext;
  navigate: (screen: Screen) => void;
  loading: boolean;
  onRefresh: () => void;
  error: string;
  lastUpdatedAt: string | null;
  realtime: "connecting" | "connected" | "offline";
  realtimeEvent: { type: string; at: string; replayGap: boolean };
  environment: Environment;
};

function formatMetric(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function DashboardPage({ metrics, context, navigate, loading, onRefresh, error, lastUpdatedAt, realtime, realtimeEvent, environment }: Props) {
  const { t } = useLanguage();
  const systemHealth = String(metrics?.systemHealth || "Unknown");
  const stats: { label: string; value: ReactNode; hint: string; icon: ReactNode; tone: string }[] = [
    { label: t("dashboard.activeRides"), value: formatMetric(metrics?.activeRides), hint: "LIVE", icon: <CarFront size={18}/>, tone: "red" },
    { label: t("dashboard.driversOnline"), value: formatMetric(metrics?.driversOnline), hint: "AVAILABILITY", icon: <Users size={18}/>, tone: "green" },
    { label: t("dashboard.customers"), value: formatMetric(metrics?.customers), hint: "BASE", icon: <Users size={18}/>, tone: "blue" },
    { label: t("dashboard.pendingKyc"), value: formatMetric(metrics?.pendingKyc), hint: "REVIEW", icon: <ShieldCheck size={18}/>, tone: "amber" },
    { label: t("dashboard.openSupport"), value: formatMetric(metrics?.openSupport), hint: "SERVICE", icon: <ReceiptText size={18}/>, tone: "blue" },
    { label: t("dashboard.todayRevenue"), value: metrics?.todayRevenue == null ? "—" : formatCurrencyINR(metrics.todayRevenue), hint: "FINANCE", icon: <WalletCards size={18}/>, tone: "green" },
    { label: t("dashboard.alerts"), value: formatMetric(metrics?.alerts), hint: "ATTENTION", icon: <AlertTriangle size={18}/>, tone: "amber" },
    { label: t("dashboard.systemHealth"), value: <StatusPill value={systemHealth}/>, hint: "STATUS", icon: <CheckCircle2 size={18}/>, tone: "green" },
  ];

  return <div className="rx-page">
    <div className="rx-page-head rx-dashboard-page-head"><div><div className="rx-eyebrow">{t("dashboard.eyebrow")}</div><h1>{t("dashboard.title")}</h1><p>{t("dashboard.description")}</p></div><div className="rx-dashboard-actions"><Button variant="secondary" onClick={onRefresh} loading={loading} disabled={loading} aria-label={t("dashboard.refreshButton", "Refresh dashboard") }>{!loading ? <RefreshCw size={15}/> : null}{t("dashboard.refreshButton", "Refresh data")}</Button><div className="rx-dashboard-mode"><span>{context.isSuperAdmin ? t("auth.superAdmin").toUpperCase() : context.role || "ADMIN"}</span><StatusPill value={systemHealth}/></div></div></div>
    <Notice>{context.isSuperAdmin ? t("dashboard.globalView") : t("dashboard.scopedView")}</Notice>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {!metrics && !loading && error ? <Notice tone="warning">No successful dashboard snapshot is available. Values are shown as unknown—not as zero. Retry after checking Admin API connectivity.</Notice> : null}
    {metrics && error ? <Notice tone="warning">Showing the last successful dashboard response, which may be stale. Last successful update: {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : "time unavailable"}. Refresh before taking an operational decision.</Notice> : null}
    {loading ? <PixelLoader variant="inline" label={t("dashboard.refreshing")}/> : null}
    {realtimeEvent.replayGap ? <Notice tone="warning">{t("dashboard.replayGap")}</Notice> : null}
    <div className="rx-live-meta" aria-live="polite"><span>{realtime === "connected" ? t("dashboard.live", "LIVE") : realtime === "connecting" ? t("dashboard.connecting", "CONNECTING") : t("dashboard.offline", "OFFLINE")}</span><span>{realtimeEvent.type ? t("dashboard.lastEvent").replace("{event}", realtimeEvent.type) : t("dashboard.waitingRealtime")}</span><span>{realtimeEvent.at ? new Date(realtimeEvent.at).toLocaleTimeString() : "—"}</span><span>{lastUpdatedAt ? `Snapshot ${new Date(lastUpdatedAt).toLocaleTimeString()}` : "No confirmed snapshot"}</span></div>
    <div className="rx-stats-grid rx-dashboard-metric-grid" aria-busy={loading}>
      {stats.map(({ label, value, hint, icon, tone }, index) => <div className={`rx-stat-card rx-dashboard-metric-card tone-${tone}`} key={label} style={{ "--metric-index": index } as React.CSSProperties}>
        <div className="rx-metric-card-top"><span>{label}</span><span className="rx-metric-icon" aria-hidden="true">{icon}</span></div>
        <strong>{loading && !metrics ? <Skeleton width={label === t("dashboard.systemHealth") ? 90 : 70} height={22}/> : value}</strong>
        <small><span className="rx-metric-dot" aria-hidden="true"/>{hint}</small>
      </div>)}
    </div>
    <GeoMap data={metrics?.raw} title={t("dashboard.liveMap", "Live operational map")} height={390}/>
    <div className="rx-dashboard-grid">
      <Card title={t("dashboard.priorityActions")} eyebrow={t("nav.operations")}><div className="rx-action-list"><button onClick={()=>navigate("kyc")}><ShieldCheck size={17}/><span><strong>{t("dashboard.reviewKyc")}</strong><small>{t("dashboard.openKyc")}</small></span></button><button onClick={()=>navigate("safety")}><AlertTriangle size={17}/><span><strong>{t("dashboard.reviewSafety")}</strong><small>{t("dashboard.inspectSos")}</small></span></button><button onClick={()=>navigate("drivers")}><CarFront size={17}/><span><strong>{t("dashboard.checkAvailability")}</strong><small>{t("dashboard.openDrivers")}</small></span></button></div></Card>
      <Card title={t("nav.monitoring", "System status")} eyebrow="HEALTH"><div className="rx-health-list"><div><CheckCircle2 size={17}/><span>{t("dashboard.apiBackend")}</span><StatusPill value={loading ? "Loading" : error && !metrics ? "Unavailable" : systemHealth}/></div><div><CheckCircle2 size={17}/><span>{t("dashboard.dashboardData")}</span><StatusPill value={error ? metrics ? "Stale" : "Unavailable" : metrics ? "Received" : "Unknown"}/></div><div><CheckCircle2 size={17}/><span>{t("dashboard.realtime")}</span><StatusPill value={realtime === "connected" ? t("dashboard.connected", "Connected") : realtime === "connecting" ? t("dashboard.connecting", "Connecting") : t("dashboard.offline", "Offline")}/></div></div></Card>
    </div>
    <Card title={t("dashboard.quickNavigation")} eyebrow="FOCUS"><div className="rx-quick-grid"><button onClick={()=>navigate("rides")}><ReceiptText size={18}/><span>{t("nav.rides")}</span></button><button onClick={()=>navigate("customers")}><Users size={18}/><span>{t("nav.customers")}</span></button><button onClick={()=>navigate("finance")}><WalletCards size={18}/><span>{t("nav.finance")}</span></button><button onClick={()=>navigate("locations")}><MapPinned size={18}/><span>{t("nav.locations")}</span></button></div></Card>
    <Card title={t("dashboard.needHelp")} eyebrow="SUPPORT"><div className="rx-help-card"><div><strong>{t("dashboard.needHelp")}</strong><p>{t("dashboard.supportDescription")}</p></div><button className="rx-btn secondary" onClick={()=>navigate("support")}>{t("dashboard.openSupport")}</button></div></Card>
    {environment === "TEST" && DEBUG_ENABLED && context.isSuperAdmin && metrics?.raw ? <details className="rx-raw"><summary>{t("dashboard.rawResponse")}</summary><pre className="rx-json">{safeDisplayJson(metrics.raw)}</pre><p className="rx-muted">TEST-only diagnostic view. Sensitive fields are redacted; diagnostics are not available in LIVE.</p></details> : null}
  </div>;
}
