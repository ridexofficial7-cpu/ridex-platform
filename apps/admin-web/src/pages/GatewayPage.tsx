import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RadioTower, RefreshCw, ShieldCheck, Wifi, ServerCog } from "lucide-react";
import { RIDEX_API } from "../lib/apiContract";
import { request } from "../lib/api";
import { Button, Card, EmptyState, Notice, StatusPill } from "../components/ui";

type Gateway = {
  id?: string;
  gatewayId?: string;
  deviceId?: string;
  installationId?: string;
  deviceName?: string;
  assignedMobileNumber?: string;
  environment?: string;
  status?: string;
  controlState?: string;
  approvalState?: string;
  securityState?: string;
  providerState?: string;
  lastHeartbeatAt?: string;
  lastDeliveryAt?: string;
  appVersion?: string;
  queuePending?: number;
  simReady?: boolean;
  networkAvailable?: boolean;
  selectedSubscriptionId?: string;
  network?: string;
  stateId?: string;
  cityId?: string;
};

function state(value: unknown): string {
  return String(value ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
}

function tone(value: unknown): "success" | "warning" | "danger" | "neutral" {
  const v = state(value);
  if (["ONLINE", "CONNECTED", "VERIFIED", "APPROVED", "NORMAL", "READY", "COMPLETED", "AVAILABLE"].includes(v)) return "success";
  if (["PENDING", "UNKNOWN", "AUTH_REQUIRED", "MAINTENANCE", "RETRY_WAIT", "OFFLINE", "NOT_READY"].includes(v)) return "warning";
  if (["ERROR", "BLOCKED", "SECURITY_DRIFT", "REJECTED", "SUSPENDED", "NETWORK_UNAVAILABLE", "HTTP_ERROR"].includes(v)) return "danger";
  return "neutral";
}

export function GatewayPage() {
  const [rows, setRows] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d: any = await request<any>(RIDEX_API.admin.gateways);
      const list = Array.isArray(d)
        ? d
        : Array.isArray(d?.items)
          ? d.items
          : Array.isArray(d?.records)
            ? d.records
            : [];
      setRows(list as Gateway[]);
      setLastRefreshAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gateway management endpoint unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  const summary = useMemo(() => {
    const total = rows.length;
    const online = rows.filter((g) => state(g.status) === "ONLINE").length;
    const providerConnected = rows.filter((g) => state(g.providerState) === "CONNECTED").length;
    const drift = rows.filter((g) => ["SECURITY_DRIFT", "BLOCKED"].includes(state(g.securityState))).length;
    const pending = rows.reduce((sum, g) => sum + Number(g.queuePending ?? 0), 0);
    return { total, online, providerConnected, drift, pending };
  }, [rows]);

  return (
    <div className="rx-page">
      <div className="rx-page-head">
        <div>
          <div className="rx-eyebrow">PLATFORM / BROADCASTER</div>
          <h1>Gateway Management</h1>
          <p>Backend-authoritative Gateway identity, Provider state, heartbeat and delivery health.</p>
        </div>
        <Button variant="secondary" loading={loading} onClick={() => void load()}>
          <RefreshCw size={15} />Refresh
        </Button>
      </div>

      <Notice>
        Browser traffic stays on the canonical RideX Admin API. The Web Admin never carries Provider/Gateway secrets; provider connectivity is represented through the backend Gateway registry and its reported runtime state.
      </Notice>

      {error ? <Notice tone={lastRefreshAt ? "warning" : "danger"}>{error}. {lastRefreshAt ? "The last successful Gateway list is shown and may be stale." : "No successful Gateway response has been loaded; counts are unknown."}</Notice> : null}

      <div className="rx-card-grid">
        <Card>
          <div className="rx-meta-grid">
            <div><strong>Gateways</strong><span>{lastRefreshAt === null ? "—" : summary.total}</span></div>
            <div><strong>Online</strong><span>{lastRefreshAt === null ? "—" : summary.online}</span></div>
            <div><strong>Provider Connected</strong><span>{lastRefreshAt === null ? "—" : summary.providerConnected}</span></div>
            <div><strong>Security Drift / Blocked</strong><span>{lastRefreshAt === null ? "—" : summary.drift}</span></div>
            <div><strong>Queued Delivery</strong><span>{lastRefreshAt === null ? "—" : summary.pending}</span></div>
            <div><strong>Auto Refresh</strong><span>15s</span></div>
          </div>
          {lastRefreshAt ? <div className="rx-guide-grid" style={{ marginTop: 12 }}><div><Activity size={16}/><span>Last refresh: {new Date(lastRefreshAt).toLocaleString()}</span></div></div> : null}
        </Card>
      </div>

      {!loading && !rows.length && !error && lastRefreshAt !== null ? (
        <EmptyState title="No gateways returned" description="The Gateway API loaded successfully and returned no records visible in the authorized scope." />
      ) : null}
      {!loading && !rows.length && error && lastRefreshAt === null ? (
        <EmptyState title="Gateway list unavailable" description="The request failed. Retry after checking the Admin API; this is not evidence that there are zero gateways." />
      ) : null}

      <div className="rx-card-grid">
        {rows.map((g, i) => {
          const gatewayId = g.gatewayId || g.id || `gateway-${i + 1}`;
          return (
            <Card key={String(gatewayId)}>
              <div className="rx-detail-head">
                <div>
                  <h3>{gatewayId}</h3>
                  <p>{g.deviceName || g.assignedMobileNumber || "Unassigned"}</p>
                </div>
                <StatusPill value={state(g.status)} />
              </div>

              <div className="rx-meta-grid">
                <div><strong>Device</strong><span>{g.deviceId || "—"}</span></div>
                <div><strong>Installation</strong><span>{g.installationId || "—"}</span></div>
                <div><strong>Assigned Mobile</strong><span>{g.assignedMobileNumber || "—"}</span></div>
                <div><strong>Environment</strong><span>{state(g.environment)}</span></div>
                <div><strong>App Version</strong><span>{g.appVersion || "—"}</span></div>
                <div><strong>Subscription / SIM</strong><span>{g.selectedSubscriptionId || "—"} · {g.simReady ? "READY" : "NOT READY"}</span></div>
                <div><strong>Network</strong><span>{g.networkAvailable === undefined ? "—" : g.networkAvailable ? "AVAILABLE" : "UNAVAILABLE"}{g.network ? ` · ${g.network}` : ""}</span></div>
                <div><strong>Heartbeat</strong><span>{g.lastHeartbeatAt ? new Date(g.lastHeartbeatAt).toLocaleString() : "—"}</span></div>
                <div><strong>Last Delivery</strong><span>{g.lastDeliveryAt ? new Date(g.lastDeliveryAt).toLocaleString() : "—"}</span></div>
                <div><strong>Queue</strong><span>{g.queuePending ?? 0} pending</span></div>
                <div><strong>State Scope</strong><span>{g.stateId || "GLOBAL"}</span></div>
                <div><strong>City Scope</strong><span>{g.cityId || "GLOBAL"}</span></div>
              </div>

              <div className="rx-guide-grid">
                <div><ServerCog size={16}/><span>Control: <strong>{state(g.controlState)}</strong> · Approval: <strong>{state(g.approvalState)}</strong></span></div>
                <div><ShieldCheck size={16}/><span>Security: <strong>{state(g.securityState)}</strong></span></div>
                <div><RadioTower size={16}/><span>Provider: <strong>{state(g.providerState)}</strong></span></div>
                <div><Wifi size={16}/><span>Heartbeat remains the operational freshness signal reported to the Backend.</span></div>
              </div>

              {tone(g.providerState) === "danger" || tone(g.securityState) === "danger" ? (
                <Notice tone="warning">Gateway requires operational review. Web Admin does not override Provider/Gateway state locally.</Notice>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
