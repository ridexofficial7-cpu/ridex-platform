import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, ShieldCheck } from "lucide-react";
import type { Environment } from "../types";
import { request } from "../lib/api";
import { RIDEX_API } from "../lib/apiContract";
import { Button, Card, Notice, PixelLoader, StatusPill } from "../components/ui";
import type { WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;
type ServiceControlKey = "passengerEnabled" | "parcelEnabled" | "goodsEnabled" | "eventEnabled" | "sharedEnabled";
type MatchingConfiguration = Partial<Record<ServiceControlKey, boolean>> & {
  environment?: string;
  version?: number;
  updatedAt?: string;
};
const CONTROL_KEYS: ServiceControlKey[] = ["passengerEnabled", "parcelEnabled", "goodsEnabled", "eventEnabled", "sharedEnabled"];
const MAIN_SERVICES: { key: ServiceControlKey; title: string; description: string }[] = [
  { key: "passengerEnabled", title: "Passenger", description: "City / Full Ride and the passenger service family." },
  { key: "parcelEnabled", title: "Parcel", description: "City Logistic Parcel and Quick Logistic Parcel." },
  { key: "goodsEnabled", title: "Goods", description: "Small, Medium and Large goods transport." },
  { key: "eventEnabled", title: "Event", description: "Event ride discovery and new event bookings." },
];

function readFlags(config: MatchingConfiguration): Record<ServiceControlKey, boolean> {
  const invalid = CONTROL_KEYS.filter((key) => typeof config[key] !== "boolean");
  if (invalid.length) throw new Error(`Backend response is missing valid service flags: ${invalid.join(", ")}. Service controls remain unavailable.`);
  return Object.fromEntries(CONTROL_KEYS.map((key) => [key, config[key] as boolean])) as Record<ServiceControlKey, boolean>;
}

function expectedBackendEnvironment(environment: Environment): string {
  return environment === "LIVE" ? "PRODUCTION" : "TEST";
}

export function ServiceConfigurationPage({ context, environment }: Props) {
  const [configuration, setConfiguration] = useState<MatchingConfiguration | null>(null);
  const [draft, setDraft] = useState<Record<ServiceControlKey, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [environmentMismatch, setEnvironmentMismatch] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFresh(false);
    setError("");
    setMessage("");
    try {
      const response = await request<MatchingConfiguration>(RIDEX_API.admin.matchingConfiguration);
      const flags = readFlags(response);
      const actualEnvironment = String(response.environment ?? "").trim().toUpperCase();
      const expectedEnvironment = expectedBackendEnvironment(environment);
      setConfiguration(response);
      setDraft(flags);
      setEnvironmentMismatch(actualEnvironment !== expectedEnvironment);
      setFresh(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load authoritative service settings.");
    } finally {
      setLoading(false);
    }
  }, [environment]);

  useEffect(() => { void load(); }, [load]);

  const changedKeys = useMemo(() => CONTROL_KEYS.filter((key) => draft && configuration && draft[key] !== configuration[key]), [draft, configuration]);
  const canChange = context.isSuperAdmin && fresh && !environmentMismatch && !loading && !saving;
  const statusLabel = (key: ServiceControlKey) => {
    const pending = Boolean(draft && configuration && draft[key] !== configuration[key]);
    if (pending) return draft?.[key] ? "Pending enable" : "Pending disable";
    return draft?.[key] ? "Enabled" : "Disabled";
  };
  const serviceSummary = (key: ServiceControlKey) => {
    const pending = Boolean(draft && configuration && draft[key] !== configuration[key]);
    if (pending) return draft?.[key] ? "Pending save: new requests will be allowed after backend confirmation" : "Pending save: new requests will be blocked after backend confirmation";
    return draft?.[key] ? "Enabled for new eligible requests" : "New eligible requests are blocked";
  };

  const save = async () => {
    if (!canChange || !draft || !changedKeys.length) return;
    if (!changeReason.trim()) {
      setError("Enter a reason for this service-availability change.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, boolean | string> = { changeReason: changeReason.trim() };
      for (const key of changedKeys) payload[key] = draft[key];
      const response = await request<MatchingConfiguration>(RIDEX_API.admin.matchingConfiguration, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const flags = readFlags(response);
      setConfiguration(response);
      setDraft(flags);
      setChangeReason("");
      setFresh(true);
      setMessage(`Service configuration saved. Current configuration version: ${response.version ?? "reported by backend"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Service configuration was not saved.");
      // Refresh to re-read authoritative state after a rejected or uncertain write.
      setFresh(false);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: ServiceControlKey) => {
    if (!canChange || !draft) return;
    setDraft((current) => current ? { ...current, [key]: !current[key] } : current);
    setError("");
    setMessage("");
  };

  return <div className="rx-page rx-service-config-page">
    <div className="rx-page-head">
      <div><div className="rx-eyebrow">PLATFORM CONFIGURATION</div><h1>Service Availability</h1><p>Review the backend-authoritative availability controls for Passenger, Parcel, Goods and Event services.</p></div>
      <Button variant="secondary" loading={loading} onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15}/>Refresh</Button>
    </div>
    <Notice>Disabling a service blocks new eligible quotes, availability, bookings and matching through backend enforcement. Existing active trips are not automatically cancelled by this UI. The backend remains authoritative.</Notice>
    {!context.isSuperAdmin ? <Notice tone="warning"><ShieldCheck size={15}/> Read-only access. Only an authenticated Super Admin may change service availability. Backend authorization enforces this independently of the UI.</Notice> : null}
    {environmentMismatch ? <Notice tone="danger">Environment mismatch: the Admin Web is configured for {environment}, but the backend configuration belongs to {configuration?.environment || "an unknown environment"}. Changes are blocked until the environment is corrected.</Notice> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {message ? <Notice tone="success">{message}</Notice> : null}
    {loading && !configuration ? <PixelLoader variant="center" label="Loading backend service configuration…"/> : null}
    {!loading && !configuration && !error ? <Notice tone="warning">No verified service configuration has been loaded. No default state is assumed.</Notice> : null}
    {configuration && draft ? <>
      <div className="rx-live-meta" aria-live="polite"><span>BACKEND CONFIGURATION</span><span>Environment: {configuration.environment || "Unknown"}</span><span>Version: {configuration.version ?? "Unknown"}</span><span>Last updated: {configuration.updatedAt ? new Date(configuration.updatedAt).toLocaleString() : "Not reported"}</span><span>{fresh ? "Fresh snapshot" : "Stale / refresh required"}</span></div>
      {!fresh ? <Notice tone="warning">The last displayed values may be stale. Refresh successfully before making changes.</Notice> : null}
      <div className="rx-service-grid">
        {MAIN_SERVICES.map((service) => <Card key={service.key}>
          <div className="rx-service-card-head"><div><h3>{service.title}</h3><p>{service.description}</p></div><StatusPill value={statusLabel(service.key)}/></div>
          <label className="rx-service-toggle"><span>{serviceSummary(service.key)}</span><input type="checkbox" checked={draft[service.key]} disabled={!canChange} onChange={() => toggle(service.key)} aria-label={`${service.title} service enabled`}/></label>
        </Card>)}
      </div>
      <Card title="Passenger ride option" eyebrow="SUB-SERVICE CONTROL">
        <div className="rx-service-card-head"><div><h3>Shared Ride</h3><p>Availability for the Sharing Ride flow within the passenger service family. This is a separate backend capability, not a fifth top-level service type.</p></div><StatusPill value={statusLabel("sharedEnabled")}/></div>
        <label className="rx-service-toggle"><span>{serviceSummary("sharedEnabled")}</span><input type="checkbox" checked={draft.sharedEnabled} disabled={!canChange} onChange={() => toggle("sharedEnabled")} aria-label="Shared Ride enabled"/></label>
      </Card>
      {context.isSuperAdmin ? <Card title="Save service changes" eyebrow="AUDITED CONFIGURATION CHANGE">
        <Notice tone="warning">A successful save is versioned and audited by the backend. Failed or unauthorized changes must not become active.</Notice>
        <label className="rx-service-reason">Change reason<textarea value={changeReason} onChange={(event) => setChangeReason(event.target.value.slice(0, 500))} maxLength={500} rows={3} placeholder="Explain why service availability is changing" disabled={!canChange}/><small>{changeReason.length}/500 characters</small></label>
        <div className="rx-service-save-row"><span>{changedKeys.length ? `${changedKeys.length} pending change${changedKeys.length === 1 ? "" : "s"}` : "No unsaved service changes"}</span><Button onClick={() => void save()} loading={saving} disabled={!canChange || changedKeys.length === 0 || !changeReason.trim()}><Save size={15}/>Save service changes</Button></div>
      </Card> : null}
    </> : null}
  </div>;
}
