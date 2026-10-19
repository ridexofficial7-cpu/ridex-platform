import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import type { AdminContext } from "../types";
import { ApiError, request } from "../lib/api";
import { RIDEX_API, resourcePath } from "../lib/apiContract";
import { Button, Card, EmptyState, Notice, PixelLoader, StatusPill } from "../components/ui";

type OtpConfig = {
  purposeCategory?: string;
  deliveryMethod?: "PROVIDER_OTP" | "PUSH" | string;
  expirySeconds?: number;
  wrongAttemptLimit?: number;
  resendIntervalSeconds?: number;
  maxResendLimit?: number;
  cooldownSeconds?: number;
  notificationRetryCount?: number;
  notificationRetryIntervalSeconds?: number;
};
type OtpPurpose = {
  purposeCode: string;
  configured?: boolean;
  active?: boolean;
  defaultPurpose?: boolean;
  configuration?: OtpConfig | null;
  fieldVersions?: Record<string, number> | null;
  historyVersions?: number;
};
type OtpHistory = {
  globalVersion: number;
  createdAt: string;
  changeType: string;
  sourceVersion?: number | null;
  targetVersion?: number | null;
  purposeCategory?: string;
  deliveryMethod?: string;
  expirySeconds?: number;
  wrongAttemptLimit?: number;
  resendIntervalSeconds?: number;
  maximumResends?: number | null;
  cooldownSeconds?: number;
  notificationRetryCount?: number;
  notificationRetryIntervalSeconds?: number;
};


function safeText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "—";
}
function formatDate(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const date = new Date(raw);
  return raw && Number.isFinite(date.getTime()) ? date.toLocaleString() : safeText(value);
}
function configRows(config: OtpConfig | null | undefined): Array<[string, unknown]> {
  if (!config) return [];
  return [
    ["Purpose category", config.purposeCategory],
    ["Delivery method", config.deliveryMethod],
    ["Expiry (seconds)", config.expirySeconds],
    ["Wrong-attempt limit", config.wrongAttemptLimit],
    ["Resend interval (seconds)", config.resendIntervalSeconds],
    ["Maximum resends", config.maxResendLimit],
    ["Cooldown (seconds)", config.cooldownSeconds],
    ["Push retry count", config.notificationRetryCount],
    ["Push retry interval (seconds)", config.notificationRetryIntervalSeconds],
  ];
}

export function OtpConfigurationWorkspace({
  context,
  data,
  loading,
  error,
  lastLoadedAt,
  onRefresh,
}: {
  context: AdminContext;
  data: unknown;
  loading: boolean;
  error: string;
  lastLoadedAt: string;
  onRefresh: () => void | Promise<void>;
}) {
  const root = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const purposes = useMemo(() => Array.isArray(root.purposes) ? root.purposes.filter((row): row is OtpPurpose => Boolean(row && typeof row === "object" && typeof (row as OtpPurpose).purposeCode === "string")) : [], [root.purposes]);
  const globalVersion = Number.isFinite(Number(root.globalVersion)) ? Number(root.globalVersion) : null;
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [purposeHistory, setPurposeHistory] = useState<OtpHistory[]>([]);
  const [purposeHistoryLoading, setPurposeHistoryLoading] = useState(false);
  const [purposeHistoryError, setPurposeHistoryError] = useState("");


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purposes.filter((row) => !q || row.purposeCode.toLowerCase().includes(q) || String(row.configuration?.purposeCategory ?? "").toLowerCase().includes(q) || String(row.configuration?.deliveryMethod ?? "").toLowerCase().includes(q));
  }, [purposes, search]);
  const selected = purposes.find((row) => row.purposeCode === selectedCode) ?? null;



  const loadPurposeHistory = useCallback(async (purposeCode: string) => {
    if (!purposeCode) {
      setPurposeHistory([]);
      setPurposeHistoryError("");
      return;
    }
    setPurposeHistoryLoading(true);
    setPurposeHistoryError("");
    try {
      const result = await request<any>(resourcePath(RIDEX_API.admin.otpConfigurations, purposeCode, "history"));
      setPurposeHistory(Array.isArray(result?.history) ? result.history.filter((row: unknown) => row && typeof row === "object") as OtpHistory[] : []);
    } catch (e) {
      setPurposeHistoryError(e instanceof ApiError ? `${e.message}${e.status ? ` · HTTP ${e.status}` : ""}` : e instanceof Error ? e.message : "Unable to load purpose history.");
      setPurposeHistory([]);
    } finally {
      setPurposeHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!purposes.length) {
      setSelectedCode("");
      setPurposeHistory([]);
      return;
    }
    if (!selectedCode || !purposes.some((row) => row.purposeCode === selectedCode)) {
      setSelectedCode(purposes[0].purposeCode);
    }
  }, [purposes, selectedCode]);
  useEffect(() => { void loadPurposeHistory(selectedCode); }, [selectedCode, loadPurposeHistory]);

  const refreshAll = useCallback(async () => {
    await Promise.resolve(onRefresh());
  }, [onRefresh]);

  return <div className="rx-page rx-workspace-page rx-otp-configuration">
    <div className="rx-page-head">
      <div><div className="rx-eyebrow">SYSTEM CONFIGURATION · SECURITY</div><h1>OTP Purpose Configuration</h1><p>Review authoritative purpose settings, global configuration versions, and per-purpose history.</p></div>
      <Button variant="secondary" loading={loading} onClick={() => void refreshAll()} disabled={loading}><RefreshCw size={15}/>Refresh configuration</Button>
    </div>
    <Notice>Current actor: {context.isSuperAdmin ? "Super Admin" : `${context.adminType} · ${context.adminLevel} scope`}. Backend authorization remains authoritative for all OTP reads.</Notice>
    <Notice tone="warning">OTP configuration history is a separate view from security audit logs. Fifth-failure alert delivery, exact audit metadata and global/field version transitions must be verified with backend event evidence; the UI never displays OTP plaintext.</Notice>
    <Notice tone="warning">OTP edits, deletion and rollback are disabled in this UI for now. The backend source does not show the supplied change reason being persisted in the full OTP security audit. RideX requires the acting Admin, exact values before/after, reason, request/audit IDs, time, environment and security metadata to be auditable before configuration writes are enabled. No OTP plaintext is displayed here.</Notice>
    <div className="rx-otp-summary-grid">
      <div className="rx-stat-card"><span>Global configuration version</span><strong>{globalVersion === null ? "—" : globalVersion}</strong><small>Backend-reported current version</small></div>
      <div className="rx-stat-card"><span>Purpose codes returned</span><strong>{purposes.length}</strong><small>Current response only</small></div>
      <div className="rx-stat-card"><span>Configured purposes</span><strong>{purposes.filter((row) => row.configured).length}</strong><small>Explicit current configuration</small></div>
      <div className="rx-stat-card"><span>Active purposes</span><strong>{purposes.filter((row) => row.active).length}</strong><small>Effective backend state</small></div>
    </div>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {error && data !== null ? <Notice tone="warning">Last successful purpose data may be stale (last fetch: {lastLoadedAt || "unknown"}).</Notice> : null}
    <div className="rx-otp-layout">
      <Card title="OTP purposes" eyebrow={lastLoadedAt ? `LAST FETCH ${lastLoadedAt}` : "BACKEND DATA"}>
        <label className="rx-otp-search">Search purpose code / category / delivery method<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. ADMIN.AUTH.LOGIN" /></label>
        {loading ? <PixelLoader variant="center" label="Loading OTP purpose configuration…"/> : error && data === null ? <EmptyState title="OTP configuration unavailable" description="Retry after confirming backend availability and Admin permissions."/> : filtered.length ? <div className="rx-otp-purpose-list">{filtered.map((purpose) => <button key={purpose.purposeCode} type="button" className={`rx-otp-purpose-item ${purpose.purposeCode === selectedCode ? "selected" : ""}`} aria-pressed={purpose.purposeCode === selectedCode} onClick={() => setSelectedCode(purpose.purposeCode)}><span><strong>{purpose.purposeCode}</strong><small>{safeText(purpose.configuration?.purposeCategory)} · {safeText(purpose.configuration?.deliveryMethod)}</small></span><span className="rx-otp-purpose-status"><StatusPill value={purpose.active ? "ACTIVE" : "INACTIVE"}/><small>v{safeText(purpose.historyVersions ?? 0)}</small></span></button>)}</div> : <EmptyState title="No OTP purposes" description="The backend returned no purposes for the current Admin context."/>}
      </Card>
      <div className="rx-otp-detail-column">
        <Card title={selected?.purposeCode ?? "Select a purpose"} eyebrow="CURRENT EFFECTIVE CONFIGURATION">
          {selected ? <><div className="rx-otp-badges"><StatusPill value={selected.active ? "ACTIVE" : "INACTIVE"}/>{selected.defaultPurpose ? <span className="rx-otp-default-badge">DEFAULT PURPOSE</span> : null}{selected.configured ? <span className="rx-otp-default-badge">EXPLICITLY CONFIGURED</span> : <span className="rx-otp-default-badge">DEFAULT VALUES</span>}</div>{selected.configuration ? <div className="rx-otp-config-grid">{configRows(selected.configuration).map(([label, value]) => <div className="rx-otp-config-field" key={label}><span>{label}</span><strong>{safeText(value)}</strong></div>)}</div> : <EmptyState title="No effective configuration" description="The backend reports this purpose as inactive or not configured."/>}<p className="rx-otp-footnote">Field versions are supplied by the backend; individual values are never edited by this review panel.</p><div className="rx-otp-field-versions"><strong>Field version counters</strong>{selected.fieldVersions && Object.keys(selected.fieldVersions).length ? Object.entries(selected.fieldVersions).map(([name, value]) => <span key={name}>{name}: {safeText(value)}</span>) : <span>No field-version counters returned.</span>}</div></> : <EmptyState title="No purpose selected" description="Choose a purpose from the list to inspect its current configuration and saved history."/>}
        </Card>
        <Card title="Purpose history" eyebrow="VERSION HISTORY · NOT SECURITY AUDIT">
          {purposeHistoryError ? <Notice tone="danger">{purposeHistoryError}</Notice> : null}
          {purposeHistoryLoading ? <PixelLoader variant="inline" label="Loading purpose history…"/> : purposeHistory.length ? <div className="rx-otp-history-list">{purposeHistory.map((entry, index) => <article className="rx-otp-history-entry" key={`${entry.globalVersion}-${entry.createdAt}-${index}`}><div className="rx-otp-history-head"><strong>Version {entry.globalVersion}</strong><StatusPill value={entry.changeType}/></div><time>{formatDate(entry.createdAt)}</time><p>Saved configuration snapshot: {safeText(entry.purposeCategory)} · {safeText(entry.deliveryMethod)} · expiry {safeText(entry.expirySeconds)} seconds</p>{entry.changeType === "ROLLBACK" ? <small>Source version {safeText(entry.sourceVersion)} → target version {safeText(entry.targetVersion)}</small> : null}</article>)}</div> : !purposeHistoryError ? <EmptyState title="No purpose history" description="No saved versions were returned for the selected purpose."/> : null}
        </Card>
      </div>
    </div>
    <Notice tone="warning">Global OTP history and global rollback are not exposed by the inspected backend routes. This workspace only displays backend-supported per-purpose history; global history and rollback remain unavailable until the backend provides verified endpoints.</Notice>

    <div className="rx-source-note"><ShieldCheck size={15}/> Read-only until change-reason auditing is confirmed. Configuration history is not a substitute for the security audit record.</div>
  </div>;
}
