import { useState } from "react";
import { MapPinned, Search } from "lucide-react";
import { RIDEX_API, withQuery } from "../lib/apiContract";
import { ApiError, request } from "../lib/api";
import { Button, Card, EmptyState, Notice } from "../components/ui";
import { useSessionDraft } from "../lib/draftStorage";

type AvailabilityOption = Record<string, unknown> & { id?: string; vehicleCatalogCode?: string; name?: string; vehicleName?: string; categoryName?: string; vehicleType?: string; capacity?: string | number; availableDrivers?: number };

function parseOptions(data: unknown): AvailabilityOption[] {
  if (Array.isArray(data)) return data.filter(Boolean) as AvailabilityOption[];
  if (data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    for (const key of ["items", "options", "vehicles", "results"]) if (Array.isArray(value[key])) return (value[key] as unknown[]).filter(Boolean) as AvailabilityOption[];
  }
  return [];
}

export function AvailabilityPage() {
  const [lat, setLat] = useSessionDraft("ridex-admin-availability-lat", "");
  const [lng, setLng] = useSessionDraft("ridex-admin-availability-lng", "");
  const [service, setService] = useSessionDraft("ridex-admin-availability-service", "PASSENGER");
  const [rideType, setRideType] = useSessionDraft("ridex-admin-availability-ride-type", "CITY_RIDE");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<AvailabilityOption[] | null>(null);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const check = async () => {
    setValidation("");
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      setValidation("Enter a valid latitude (-90 to 90) and longitude (-180 to 180). No request was sent.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const path = withQuery(RIDEX_API.admin.availability, { pickupLat: latitude, pickupLng: longitude, serviceType: service, rideType });
      const data = await request<unknown>(path);
      setOptions(parseOptions(data));
      setLastCheckedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message}${e.status ? ` · HTTP ${e.status}` : ""}` : e instanceof Error ? e.message : "Availability endpoint unavailable");
    } finally {
      setLoading(false);
    }
  };

  const rideMapping = rideType === "CITY_RIDE" ? "Full Ride → City Ride" : rideType === "INTERCITY_RIDE" ? "Connection Ride → InterCity Ride" : rideType === "SHARING_RIDE" ? "Share Ride → Sharing Ride" : "Event ride";
  return <div className="rx-page">
    <div className="rx-page-head"><div><div className="rx-eyebrow">LOCATIONS & OPERATIONS</div><h1>Location Availability</h1><p>Preview backend-reported eligibility for the selected pickup, service and ride type.</p></div></div>
    <Notice>The backend remains authoritative: this page does not infer available drivers from the vehicle catalog alone.</Notice>
    <Card title="Check location" eyebrow="ELIGIBILITY">
      <div className="rx-form-grid">
        <label>Latitude<input value={lat} onChange={e => setLat(e.target.value)} inputMode="decimal" placeholder="Latitude (-90 to 90)" /></label>
        <label>Longitude<input value={lng} onChange={e => setLng(e.target.value)} inputMode="decimal" placeholder="Longitude (-180 to 180)" /></label>
        <label>Service<select value={service} onChange={e => setService(e.target.value)}><option value="PASSENGER">Passenger</option><option value="PARCEL">Parcel</option><option value="GOODS">Goods</option><option value="EVENT">Event</option></select></label>
        <label>Ride Type<select value={rideType} onChange={e => setRideType(e.target.value)}><option value="CITY_RIDE">Full / City Ride</option><option value="SHARING_RIDE">Share / Sharing Ride</option><option value="INTERCITY_RIDE">Connection / InterCity Ride</option><option value="EVENT_RIDE">Event Ride</option></select></label>
      </div>
      <p className="rx-muted">Ride mapping: {rideMapping}</p>
      {validation ? <Notice tone="danger">{validation}</Notice> : null}
      <Button loading={loading} disabled={loading} onClick={() => void check()}><Search size={15}/>Check Availability</Button>
    </Card>
    <Card title="Visible options" eyebrow="BACKEND RESULT">
      {error ? <Notice tone={options ? "warning" : "danger"}>{error}{options ? " The last successful result is retained and may be stale." : " No availability result has been received."}</Notice> : null}
      {lastCheckedAt ? <p className="rx-muted" aria-live="polite">Last successful check: {new Date(lastCheckedAt).toLocaleString()}</p> : null}
      {loading ? <div role="status" aria-live="polite">Checking backend availability…</div> : options === null ? <EmptyState title={error ? "Availability unavailable" : "No check yet"} description={error ? "Retry after confirming the configured Admin API is reachable." : "Enter a valid pickup point and run a check to receive backend eligibility results."}/> : options.length ? options.map((r, i) => <div key={String(r.id || r.vehicleCatalogCode || i)} className="rx-row"><MapPinned size={16}/><div><strong>{String(r.name || r.vehicleName || r.vehicleCatalogCode || "Vehicle option")}</strong><span>{[r.categoryName, r.vehicleType, r.capacity, r.availableDrivers != null ? `${r.availableDrivers} driver(s)` : null].filter(Boolean).map(String).join(" • ") || "Backend option"}</span></div></div>) : <EmptyState title="No eligible options returned" description="The backend returned a successful empty availability result for this selection."/>}
    </Card>
  </div>;
}
