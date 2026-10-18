import { useEffect, useMemo, useState } from "react";
import { Activity, Globe, MapPinned, ShieldCheck } from "lucide-react";
import { Button, Card, Notice, StatusPill } from "./ui";
import type { AdminContext, Environment } from "../types";

type RecordLike = Record<string, unknown>;
type RealtimeState = "connecting" | "connected" | "offline";
type RealtimeSnapshot = { type: string; at: string; replayGap: boolean };

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordLike : null;
}
function asRows(value: unknown): RecordLike[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as RecordLike[];
  const root = asRecord(value);
  if (!root) return [];
  for (const key of ["items", "records", "rows", "results", "admins", "notifications", "events", "data"]) {
    if (Array.isArray(root[key])) return (root[key] as unknown[]).filter((item) => item && typeof item === "object" && !Array.isArray(item)) as RecordLike[];
  }
  return [];
}
function firstDefined(row: RecordLike | null, keys: string[]): unknown {
  if (!row) return undefined;
  for (const key of keys) {
    const value = key.split(".").reduce<unknown>((current, part) => asRecord(current)?.[part], row);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}
function show(value: unknown): string {
  return value === undefined || value === null || value === "" ? "Not returned" : typeof value === "object" ? "Details available" : String(value);
}
function scopeValidity(level: string, stateId: unknown, cityId: unknown): { label: string; valid: boolean | null } {
  if (level === "GLOBAL") return { label: "GLOBAL scope", valid: true };
  if (level === "STATE") return stateId ? { label: "STATE assignment includes a state ID", valid: true } : { label: "STATE assignment is missing its state ID", valid: false };
  if (level === "CITY") return stateId && cityId ? { label: "CITY assignment includes state and city IDs", valid: true } : { label: "CITY assignment is missing a state or city ID", valid: false };
  return { label: "Scope level was not returned or is not recognized", valid: null };
}

export function ScopeAssignmentPanel({ context, data, selected }: { context: AdminContext; data: unknown; selected: RecordLike | null }) {
  const records = useMemo(() => asRows(data), [data]);
  const selectedAdmin = selected ?? records.find((row) => String(firstDefined(row, ["adminId", "id", "userId"]) ?? "") === context.adminId) ?? null;
  const level = String(firstDefined(selectedAdmin, ["adminLevel", "scope.level", "scopeLevel", "scopeType", "assignedScope"]) ?? (selectedAdmin ? "" : context.adminLevel)).toUpperCase();
  const stateId = firstDefined(selectedAdmin, ["stateId", "scope.stateId", "assignedStateId"]) ?? (selectedAdmin ? undefined : context.stateId);
  const cityId = firstDefined(selectedAdmin, ["cityId", "scope.cityId", "assignedCityId"]) ?? (selectedAdmin ? undefined : context.cityId);
  const validity = scopeValidity(level, stateId, cityId);
  const [draftLevel, setDraftLevel] = useState("STATE");
  const [draftState, setDraftState] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [reason, setReason] = useState("");
  const validDraft = draftLevel === "GLOBAL" || (draftLevel === "STATE" && Boolean(draftState.trim())) || (draftLevel === "CITY" && Boolean(draftState.trim() && draftCity.trim()));
  useEffect(() => {
    setDraftLevel(level === "GLOBAL" || level === "STATE" || level === "CITY" ? level : "STATE");
    setDraftState(stateId === undefined || stateId === null ? "" : String(stateId));
    setDraftCity(cityId === undefined || cityId === null ? "" : String(cityId));
    setReason("");
  }, [level, stateId, cityId, selectedAdmin]);

  return <div className="rx-coverage-panels">
    <Card title="Current assignment review" eyebrow="BACKEND-RETURNED SCOPE">
      <div className="rx-coverage-grid">
        <div className="rx-coverage-item"><span>Admin record</span><strong>{show(firstDefined(selectedAdmin, ["name", "fullName", "adminName", "adminId", "id"]) ?? (selectedAdmin ? undefined : context.name))}</strong></div>
        <div className="rx-coverage-item"><span>Scope level</span><strong>{show(level || undefined)}</strong></div>
        <div className="rx-coverage-item"><span>State assignment</span><strong>{show(stateId)}</strong></div>
        <div className="rx-coverage-item"><span>City assignment</span><strong>{show(cityId)}</strong></div>
        <div className="rx-coverage-item"><span>Record status</span><strong>{show(firstDefined(selectedAdmin, ["status", "approvalStatus", "active"]) ?? (selectedAdmin ? undefined : context.approvalStatus))}</strong></div>
        <div className="rx-coverage-item"><span>Assignment check</span><strong><StatusPill value={validity.valid === true ? "Structurally complete" : validity.valid === false ? "Missing assignment data" : "Unknown"}/></strong></div>
      </div>
      {validity.valid === false ? <Notice tone="warning">{validity.label}. This is a frontend shape check, not authorization proof; the backend must reject inconsistent assignments.</Notice> : validity.valid === null ? <Notice tone="info">{validity.label}. Select an Admin record with scope metadata or verify the returned response contract.</Notice> : <p className="rx-muted">{validity.label}. Actual effective access and geographic filtering remain backend-authoritative.</p>}
    </Card>
    <Card title="Scope-change draft" eyebrow="NOT SUBMITTED">
      <Notice tone="warning">Draft only. Saving is disabled until the actual API request schema and authorization rules are verified against backend source. Revoking or changing an Admin assignment remains unavailable.</Notice>
      <Notice tone="info">Backend source review found no dedicated endpoint to update an existing Admin's adminLevel/stateId/cityId. The Admin creation route does not persist those assignment fields, and the application-details route updates only application/profile information. These inputs cannot change effective access.</Notice>
      <div className="rx-coverage-form">
        <label>Scope level<select value={draftLevel} onChange={(event) => { const next = event.target.value; setDraftLevel(next); if (next === "GLOBAL") { setDraftState(""); setDraftCity(""); } else if (next === "STATE") { setDraftCity(""); } }}><option value="GLOBAL">GLOBAL</option><option value="STATE">STATE</option><option value="CITY">CITY</option></select></label>
        {draftLevel !== "GLOBAL" ? <label>State ID<input value={draftState} onChange={(event) => { setDraftState(event.target.value); setDraftCity(""); }} maxLength={120} placeholder="Enter assigned state ID"/></label> : null}
        {draftLevel === "CITY" ? <label>City ID<input value={draftCity} onChange={(event) => setDraftCity(event.target.value)} maxLength={120} placeholder="Enter assigned city ID"/></label> : null}
        <label>Change reason<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Required for an authorized change"/></label>
      </div>
      {!validDraft ? <p className="rx-field-error">{draftLevel === "STATE" ? "A State ID is required for STATE scope." : "Both State ID and City ID are required for CITY scope."}</p> : null}
      <div className="rx-coverage-actions"><Button disabled title="Backend API route and authorization contract are not verified">Save assignment unavailable</Button><span className="rx-muted">{reason.trim() ? "Reason entered; draft remains local to this view." : "Change reason required."}</span></div>
    </Card>
    <Card title="Effective-access guardrails" eyebrow="REVIEW CHECKLIST">
      <div className="rx-coverage-guardrails"><p><ShieldCheck size={16}/> GLOBAL / STATE / CITY access must be enforced by the server for list, detail, search, export, bulk action and direct API requests.</p><p><ShieldCheck size={16}/> A CITY assignment requires valid state and city linkage; an invalid assignment must fail closed.</p><p><ShieldCheck size={16}/> This panel never grants permissions and does not treat the selected scope as proof that access tests passed.</p></div>
    </Card>
  </div>;
}

function getLinkValue(row: RecordLike | null, keys: string[]): string {
  const value = firstDefined(row, keys);
  return typeof value === "string" ? value : "";
}
function validPublicUrl(value: string, environment: Environment): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    const allowedProtocols = environment === "TEST" ? ["https:", "http:"] : ["https:"];
    return allowedProtocols.includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
export function PublicLinksPanel({ data, environment }: { data: unknown; environment: Environment }) {
  const root = asRecord(data);
  const firstRow = asRows(data)[0] ?? root;
  const initialCustomer = getLinkValue(firstRow, ["customerUrl", "customerDownloadUrl", "customerLink"]);
  const initialDriver = getLinkValue(firstRow, ["driverUrl", "driverDownloadUrl", "driverLink"]);
  const [customerUrl, setCustomerUrl] = useState(initialCustomer);
  const [driverUrl, setDriverUrl] = useState(initialDriver);
  const customerValid = validPublicUrl(customerUrl, environment);
  const driverValid = validPublicUrl(driverUrl, environment);
  useEffect(() => { setCustomerUrl(initialCustomer); setDriverUrl(initialDriver); }, [initialCustomer, initialDriver]);
  const updatedAt = firstDefined(firstRow, ["updatedAt", "lastUpdatedAt"]);
  const enabledValue = firstRow?.enabled;
  const enabled = typeof enabledValue === "boolean" ? enabledValue : null;
  const showDate = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return "Not returned";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unrecognized timestamp";
  };
  const previewAvailable = enabled === true;
  return <div className="rx-coverage-panels">
    <Card title="Public download URLs" eyebrow="BACKEND-CONFIGURED LINKS">
      <Notice tone="info">Only values returned by the public backend endpoint are prefilled. This screen is preview-only: saving is blocked until the Super Admin configuration audit persists a change reason.</Notice>
      <div className="rx-coverage-form">
        <label>Customer App URL<input type="url" value={customerUrl} onChange={(event) => setCustomerUrl(event.target.value)} maxLength={2048} placeholder="No Customer App URL returned" aria-invalid={!customerValid}/></label>
        {!customerValid ? <p className="rx-field-error">Use HTTPS in LIVE; HTTP is accepted only in TEST. Embedded credentials are not allowed.</p> : null}
        <label>Driver App URL<input type="url" value={driverUrl} onChange={(event) => setDriverUrl(event.target.value)} maxLength={2048} placeholder="No Driver App URL returned" aria-invalid={!driverValid}/></label>
        {!driverValid ? <p className="rx-field-error">Use HTTPS in LIVE; HTTP is accepted only in TEST. Embedded credentials are not allowed.</p> : null}
      </div>
      <div className="rx-coverage-grid">
        <div className="rx-coverage-item"><span>Last backend update</span><strong>{showDate(updatedAt)}</strong></div>
        <div className="rx-coverage-item"><span>Download links</span><strong>{enabled === null ? "Enabled state not returned" : enabled ? "Enabled" : "Disabled"}</strong></div>
        <div className="rx-coverage-item"><span>Environment</span><strong>{environment}</strong></div>
        <div className="rx-coverage-item"><span>URL validation</span><strong><StatusPill value={customerValid && driverValid ? "Valid draft values" : "Correction required"}/></strong></div>
      </div>
      <div className="rx-coverage-actions">
        <Button disabled title="Saving remains disabled until changeReason is persisted by the backend audit contract">Save unavailable</Button>
        <span className="rx-muted">Preview only · values remain in this page state and are not sent.</span>
      </div>
      <div className="rx-link-previews">
        {previewAvailable && customerUrl && customerValid ? <a href={customerUrl} target="_blank" rel="noopener noreferrer">Preview Customer App link ↗</a> : <span>{enabled === false ? "Downloads are disabled" : "Customer App link not available for preview"}</span>}
        {previewAvailable && driverUrl && driverValid ? <a href={driverUrl} target="_blank" rel="noopener noreferrer">Preview Driver App link ↗</a> : <span>{enabled === false ? "Downloads are disabled" : "Driver App link not available for preview"}</span>}
      </div>
    </Card>
    <Card title="Save and history requirements" eyebrow="BACKEND CAPABILITY CHECK">
      <div className="rx-coverage-guardrails"><p><Globe size={16}/> Saving must return the backend-confirmed state and record the operator's reason with the configuration audit.</p><p><Globe size={16}/> The backend exposes the current public configuration and an audited Super Admin PUT route; no dedicated version-history or rollback endpoint was found in the reviewed source.</p><p><Globe size={16}/> Public previews open a new tab only when the backend says downloads are enabled; they do not publish or modify the website configuration.</p></div>
    </Card>
  </div>;
}

function returnedScalar(root: RecordLike | null, keys: string[]): unknown {
  return firstDefined(root, keys);
}
export function DeliveryHealthPanel({ data, lastLoadedAt, realtime, realtimeEvent }: { data: unknown; lastLoadedAt: string; realtime: RealtimeState; realtimeEvent: RealtimeSnapshot }) {
  const root = asRecord(data);
  const devices = useMemo(() => asRows(root?.devices), [root?.devices]);
  const attempts = useMemo(() => asRows(root?.recentAttempts), [root?.recentAttempts]);
  const connectionLabel = realtime === "connected" ? "Stream connected" : realtime === "connecting" ? "Connecting" : "Stream offline";
  const lastEventAt = realtimeEvent.at ? new Date(realtimeEvent.at).toLocaleString() : "No event observed in this session";
  const activeDevices = devices.filter((device) => device.active === true).length;
  const inactiveDevices = devices.filter((device) => device.active === false).length;
  const latestAttempt = attempts.find((attempt) => typeof attempt.createdAt === "string" && attempt.createdAt.trim());
  const showDate = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return "Not returned";
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : "Unrecognized timestamp";
  };
  const safeShort = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).slice(0, 100) : "Not returned";
  return <div className="rx-coverage-panels rx-delivery-health">
    <Card title="Realtime and account device signals" eyebrow="OBSERVED STATUS">
      <div className="rx-coverage-grid">
        <div className="rx-coverage-item"><span>Realtime transport</span><strong><StatusPill value={connectionLabel}/></strong></div>
        <div className="rx-coverage-item"><span>Last realtime event</span><strong>{lastEventAt}</strong></div>
        <div className="rx-coverage-item"><span>Last event type</span><strong>{show(realtimeEvent.type || undefined)}</strong></div>
        <div className="rx-coverage-item"><span>Device records returned</span><strong>{root && Array.isArray(root.devices) ? devices.length : "Not returned"}</strong></div>
        <div className="rx-coverage-item"><span>Active devices returned</span><strong>{Array.isArray(root?.devices) ? activeDevices : "Not returned"}</strong></div>
        <div className="rx-coverage-item"><span>Inactive devices returned</span><strong>{Array.isArray(root?.devices) ? inactiveDevices : "Not returned"}</strong></div>
        <div className="rx-coverage-item"><span>Recent delivery attempts returned</span><strong>{root && Array.isArray(root.recentAttempts) ? attempts.length : "Not returned"}</strong></div>
        <div className="rx-coverage-item"><span>Latest returned delivery attempt</span><strong>{showDate(latestAttempt?.createdAt)}</strong></div>
      </div>
      {realtimeEvent.replayGap ? <Notice tone="warning">A realtime replay gap was observed. Reconcile current records from the backend before taking an operational action.</Notice> : null}
      <p className="rx-muted">Last successful device-health read: {lastLoadedAt || "Not available"}. The backend scopes this endpoint to the signed-in account's devices; it does not prove global push/SMS delivery or provider health.</p>
    </Card>
    <Card title="Recent delivery attempts" eyebrow="BACKEND-RETURNED RECORDS">
      {attempts.length ? <div className="rx-delivery-attempt-list">{attempts.map((attempt, index) => <article className="rx-delivery-attempt" key={`${safeShort(attempt.deviceId)}-${safeShort(attempt.attemptNumber)}-${safeShort(attempt.createdAt)}-${index}`}><div className="rx-delivery-attempt-head"><strong>Attempt {safeShort(attempt.attemptNumber)}</strong><StatusPill value={safeShort(attempt.status)}/></div><div className="rx-delivery-attempt-meta"><span>Provider: {safeShort(attempt.provider)}</span><span>Created: {showDate(attempt.createdAt)}</span>{attempt.errorCode ? <span>Error code: {safeShort(attempt.errorCode)}</span> : null}</div></article>)}</div> : <p className="rx-muted">{Array.isArray(root?.recentAttempts) ? "No recent delivery attempts were returned for the devices associated with this signed-in account." : "Recent delivery attempts were not returned by the backend response."}</p>}
    </Card>
    <Card title="Account devices" eyebrow="LATEST BACKEND SNAPSHOT">
      {devices.length ? <div className="rx-delivery-device-list">{devices.map((device, index) => <article className="rx-delivery-device" key={`${safeShort(device.id)}-${index}`}><div className="rx-delivery-attempt-head"><strong>{safeShort(device.platform)} · {safeShort(device.appVersion)}</strong><StatusPill value={device.active === true ? "ACTIVE" : device.active === false ? "INACTIVE" : "UNKNOWN"}/></div><div className="rx-delivery-attempt-meta"><span>Last seen: {showDate(device.lastSeenAt)}</span><span>Registered: {showDate(device.createdAt)}</span></div></article>)}</div> : <p className="rx-muted">{Array.isArray(root?.devices) ? "No device records were returned for this signed-in account." : "Device records were not returned by the backend response."}</p>}
    </Card>
    <Card title="Delivery diagnostics" eyebrow="EVIDENCE GAPS">
      <div className="rx-coverage-guardrails"><p><Activity size={16}/> The stream label reflects the frontend realtime connection signal only.</p><p><Activity size={16}/> Device health and recent notification delivery attempts belong to the current signed-in account; they do not represent the global Gateway or Broadcaster fleet.</p><p><Activity size={16}/> Queue depth, provider health, SMS delivery receipts, retry queue and dead-letter metrics are not supplied by this endpoint and stay unavailable.</p><p><Activity size={16}/> Retry/replay/resolve controls are omitted until the exact job state machine, idempotency contract and authorized operations are verified.</p></div>
    <p><Activity size={16}/> A connected realtime stream does not prove push or SMS delivery to a recipient.</p></Card>
  </div>;
}