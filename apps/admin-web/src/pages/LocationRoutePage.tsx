import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, MapPinned, RefreshCw, Route, Save, Search, SlidersHorizontal } from "lucide-react";
import { ApiError, request } from "../lib/api";
import { API_CONTRACT_STATUS, RIDEX_API, resourcePath, withQuery } from "../lib/apiContract";
import type { AdminContext, Screen } from "../types";
import { Button, Card, EmptyState, Notice, PixelLoader, StatusPill } from "../components/ui";
import { GeoMap, extractGeoPoints } from "../components/GeoMap";
import { useSessionDraft } from "../lib/draftStorage";
import { isSensitiveDisplayField, redactForDisplay, safeDisplayJson } from "../lib/displayData";

type Row = Record<string, any>;
type LocationDraft = { name: string; city: string; state: string; cityId: string; category: string; type: string; address: string; latitude: string; longitude: string; pincode: string; pickupAllowed: boolean; dropAllowed: boolean; pickupRadiusMeters: string; dropRadiusMeters: string; active: boolean };
const EMPTY_LOCATION_DRAFT: LocationDraft = { name: "", city: "", state: "", cityId: "", category: "LANDMARK", type: "LANDMARK", address: "", latitude: "", longitude: "", pincode: "", pickupAllowed: true, dropAllowed: true, pickupRadiusMeters: "300", dropRadiusMeters: "500", active: true };

function stableRowIdentity(row: Row | null | undefined): string { if (!row) return ""; for (const key of ["id", "locationId", "routeId", "cityId", "stateId"]) { const value = row[key]; if (value !== null && value !== undefined && String(value).trim()) return `${key}:${String(value)}`; } return ""; }
type Mode = "list" | "map";
const LOCATION_MUTATIONS_ENABLED = String(API_CONTRACT_STATUS) === "VERIFIED_AGAINST_BACKEND_SOURCE";

const CONFIG: Record<string, { title: string; eyebrow: string; description: string; endpoint: string; map: boolean; hint: string }> = {
  states: { title: "State Master", eyebrow: "LOCATIONS / MASTER DATA", description: "Manage the authoritative state geography used by administrative scope and city relationships.", endpoint: RIDEX_API.admin.states, map: false, hint: "State identity and activation are backend-authoritative." },
  cities: { title: "City Master", eyebrow: "LOCATIONS / MASTER DATA", description: "Review cities, service availability and geographic center data linked to state scope.", endpoint: RIDEX_API.admin.cities, map: true, hint: "City service availability and coordinates come from the backend." },
  locations: { title: "Location Master", eyebrow: "LOCATIONS / MASTER DATA", description: "Review validated pickup/drop locations, address metadata and coordinate readiness.", endpoint: RIDEX_API.admin.locations, map: true, hint: "Only validated location records should become operational points." },
  quickLocations: { title: "Quick Locations", eyebrow: "LOCATIONS / OPERATIONS", description: "Fast operational location shortcuts for frequently used pickup and drop points.", endpoint: RIDEX_API.admin.quickLocations, map: true, hint: "Quick locations remain subordinate to the authoritative location model." },
  cityZones: { title: "City Zones", eyebrow: "LOCATIONS / SERVICE ZONES", description: "Review city service zones and their geographic operating boundaries.", endpoint: RIDEX_API.admin.cityZones, map: true, hint: "Zone behavior is determined by backend service-zone rules." },
  routesOps: { title: "Route Operations", eyebrow: "ROUTES / OPERATIONS", description: "Monitor active and inactive operational routes, topology and service metadata.", endpoint: RIDEX_API.admin.routes, map: true, hint: "Route topology and operational state remain backend-authoritative." },
  workingRoutes: { title: "Working Routes", eyebrow: "ROUTES / DRIVER OPERATIONS", description: "Review driver-approved working routes and their geographic context.", endpoint: RIDEX_API.admin.drivers, map: true, hint: "Working routes are attached to a driver; the driver API is the entry surface." },
  sharingRoutes: { title: "Sharing Ride Routes", eyebrow: "ROUTES / SHARING", description: "Review shared-route definitions, points, selection mode and active status.", endpoint: RIDEX_API.admin.sharedRoutes, map: true, hint: "Shared routes use the dedicated shared-route contract." },
  routeRules: { title: "Route Rules", eyebrow: "ROUTES / CONFIGURATION", description: "Inspect route records and operational attributes without inventing a separate rule model.", endpoint: RIDEX_API.admin.routes, map: true, hint: "No synthetic route-rule schema is created in the UI." },
};

function rows(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter(Boolean) as Row[];
  if (value && typeof value === "object") {
    const root = value as Row;
    for (const key of ["items", "records", "rows", "results", "data", "locations", "routes", "cities", "states", "zones"]) {
      if (Array.isArray(root[key])) return root[key].filter(Boolean);
    }
    if (root.data && typeof root.data === "object") return rows(root.data);
  }
  return [];
}

function titleFor(row: Row, index: number) {
  return String(row.name ?? row.title ?? row.label ?? row.code ?? row.routeName ?? row.locationName ?? row.id ?? `Record ${index + 1}`);
}

function scalar(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  try { return JSON.stringify(value); } catch { return "[object]"; }
}

function statusOf(row: Row) {
  const explicit = row.status ?? row.state ?? row.approvalStatus;
  if (explicit !== undefined && explicit !== null && explicit !== "") return String(explicit).toUpperCase();
  if (row.serviceAvailable === false || row.active === false || row.isActive === false) return "INACTIVE";
  if (row.serviceAvailable === true || row.active === true || row.isActive === true) return "ACTIVE";
  return "UNKNOWN";
}

function endpointFor(screen: Screen) {
  return CONFIG[screen]?.endpoint ?? "";
}

export function LocationRoutePage({ screen, context }: { screen: Screen; context: AdminContext }) {
  const cfg = CONFIG[screen];
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [mode, setMode] = useState<Mode>(cfg.map ? "map" : "list");
  const [showRaw, setShowRaw] = useState(false);
  const locationDraftNamespace = context.adminId || "current";
  const [locationDraft, setLocationDraft] = useSessionDraft<LocationDraft>(`ridex-admin-location-create-${locationDraftNamespace}`, EMPTY_LOCATION_DRAFT);
  const [editingLocationId, setEditingLocationId] = useSessionDraft<string>(`ridex-admin-location-edit-id-${locationDraftNamespace}`, "");
  const [placeSearch, setPlaceSearch] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<any[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [locationSaveError, setLocationSaveError] = useState("");
  const [locationSaveMessage, setLocationSaveMessage] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const requestSequence = useRef(0);

  useEffect(() => {
    let currentRequest = true;
    const query = placeSearch.trim();
    if (screen !== "locations" || query.length < 3) {
      setPlaceSuggestions([]); setPlacesError(""); setPlacesLoading(false);
      return () => { currentRequest = false; };
    }
    const timer = window.setTimeout(async () => {
      setPlacesLoading(true); setPlacesError("");
      try {
        const result = await request<any>(withQuery(RIDEX_API.admin.locationSuggestions, { q: query, city: locationDraft.city.trim(), state: locationDraft.state.trim() }));
        const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
        if (!currentRequest) return;
        setPlaceSuggestions(suggestions);
        if (!suggestions.length) setPlacesError("No Google Places matches. Try a nearby landmark or select a saved location below.");
      } catch (e) {
        if (!currentRequest) return;
        setPlaceSuggestions([]);
        setPlacesError(e instanceof ApiError ? `${e.message}${e.status ? ` · HTTP ${e.status}` : ""}` : e instanceof Error ? e.message : "Google Places is unavailable; you can enter the verified address manually.");
      } finally { if (currentRequest) setPlacesLoading(false); }
    }, 450);
    return () => { currentRequest = false; window.clearTimeout(timer); };
  }, [screen, placeSearch, locationDraft.city, locationDraft.state]);

  const chooseGooglePlace = async (suggestion: any) => {
    setPlacesError("");
    try {
      const place = await request<any>(withQuery(RIDEX_API.admin.locationPlaceDetails, { placeId: String(suggestion.placeId ?? "") }));
      setLocationDraft((current) => ({
        ...current,
        name: String(place.name || suggestion.mainText || current.name),
        address: String(place.address || suggestion.description || current.address),
        city: String(place.city || current.city),
        state: String(place.state || current.state),
        pincode: String(place.pincode || current.pincode),
        latitude: place.latitude == null ? current.latitude : String(place.latitude),
        longitude: place.longitude == null ? current.longitude : String(place.longitude),
      }));
      setPlaceSearch(""); setPlaceSuggestions([]);
      setLocationSaveMessage("Address and coordinates filled from Google Places. Verify State + City against active City Master before saving.");
    } catch (e) {
      setPlacesError(e instanceof ApiError ? `${e.message}${e.status ? ` · HTTP ${e.status}` : ""}` : e instanceof Error ? e.message : "Unable to resolve this place.");
    }
  };

  const beginEditLocation = (row: Row) => {
    const id = String(row.id ?? row.locationId ?? "").trim();
    if (!id) {
      setLocationSaveError("This record has no backend location ID and cannot be updated safely.");
      return;
    }
    setSelected(row);
    setEditingLocationId(id);
    setLocationDraft({
      name: String(row.name ?? row.locationName ?? ""),
      city: String(row.city ?? row.cityName ?? ""),
      state: String(row.state ?? row.stateName ?? ""),
      cityId: String(row.cityId ?? ""),
      category: String(row.category ?? "LANDMARK").toUpperCase(),
      type: String(row.type ?? row.category ?? "LANDMARK").toUpperCase(),
      address: String(row.address ?? ""),
      latitude: String(row.latitude ?? row.lat ?? ""),
      longitude: String(row.longitude ?? row.lng ?? ""),
      pincode: String(row.pincode ?? ""),
      pickupAllowed: row.pickupAllowed !== false,
      dropAllowed: row.dropAllowed !== false,
      pickupRadiusMeters: String(row.pickupRadiusMeters ?? 300),
      dropRadiusMeters: String(row.dropRadiusMeters ?? 500),
      active: row.active !== false && row.isActive !== false,
    });
    setPlaceSearch(""); setPlaceSuggestions([]); setPlacesError("");
    setLocationSaveError("");
    setLocationSaveMessage(`Editing Location Master record ${id}. Save will update the backend record.`);
  };

  const createLocation = async () => {
    setLocationSaveError(""); setLocationSaveMessage("");
    if (!LOCATION_MUTATIONS_ENABLED) {
      setLocationSaveError("Location create/update is disabled until the exact backend contract is verified. Draft values remain in this form and no mutation request will be sent.");
      return;
    }
    if (!locationDraft.name.trim() || !locationDraft.city.trim() || !locationDraft.state.trim() || !locationDraft.address.trim()) { setLocationSaveError("Name, State, City and Address are required."); return; }
    const latitude = Number(locationDraft.latitude); const longitude = Number(locationDraft.longitude);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) { setLocationSaveError("Select a Google Places result or enter valid latitude/longitude coordinates."); return; }
    setSavingLocation(true);
    try {
      const body = { name: locationDraft.name.trim(), city: locationDraft.city.trim(), cityId: locationDraft.cityId.trim() || undefined, category: locationDraft.category, type: locationDraft.type, address: locationDraft.address.trim(), latitude, longitude, pincode: locationDraft.pincode.trim() || undefined, pickupAllowed: locationDraft.pickupAllowed, dropAllowed: locationDraft.dropAllowed, pickupRadiusMeters: Number(locationDraft.pickupRadiusMeters || 300), dropRadiusMeters: Number(locationDraft.dropRadiusMeters || 500), active: locationDraft.active };
      if (editingLocationId) {
        await request<any>(resourcePath(RIDEX_API.admin.locations, editingLocationId), { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await request<any>(RIDEX_API.admin.locations, { method: "POST", body: JSON.stringify({ ...body, state: locationDraft.state.trim() }) });
      }
      setLocationDraft(EMPTY_LOCATION_DRAFT); setEditingLocationId(""); setPlaceSearch(""); setPlaceSuggestions([]);
      setLocationSaveMessage(editingLocationId ? "Location Master record updated successfully." : "Location created successfully in the backend Location Master.");
      await load(false);
    } catch (e) {
      setLocationSaveError(e instanceof ApiError ? `${e.message}${e.status ? ` · HTTP ${e.status}` : ""}` : e instanceof Error ? e.message : "Unable to create the location.");
    } finally { setSavingLocation(false); }
  };

  const load = async (initial = false) => {
    const sequence = ++requestSequence.current;
    initial ? setLoading(true) : setRefreshing(true);
    setError("");
    try {
      const result = await request<any>(cfg.endpoint);
      if (sequence !== requestSequence.current) return;
      setData(result);
      setSelected((previous) => { if (!previous) return null; const key = stableRowIdentity(previous); const nextRows = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : Array.isArray(result?.locations) ? result.locations : Array.isArray(result?.routes) ? result.routes : []; return key ? nextRows.find((row: Row) => stableRowIdentity(row) === key) ?? null : previous; });
    } catch (e) {
      if (sequence !== requestSequence.current) return;
      setError(e instanceof ApiError ? `${e.message}${e.status ? ` · HTTP ${e.status}` : ""}` : e instanceof Error ? e.message : "Unable to load this workspace.");
    } finally {
      if (sequence === requestSequence.current) { setLoading(false); setRefreshing(false); }
    }
  };

  useEffect(() => { void load(true); return () => { requestSequence.current += 1; }; }, [cfg.endpoint]);
  useEffect(() => {
    const onRealtime = () => void load(false);
    window.addEventListener("ridex-admin-realtime-resync", onRealtime);
    return () => window.removeEventListener("ridex-admin-realtime-resync", onRealtime);
  }, [cfg.endpoint]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows(data).filter(row => !q || JSON.stringify(row).toLowerCase().includes(q));
  }, [data, search]);

  const stats = useMemo(() => {
    const all = rows(data);
    return {
      total: all.length,
      active: all.filter(r => /ACTIVE|ONLINE|AVAILABLE/.test(statusOf(r))).length,
      inactive: all.filter(r => /INACTIVE|DISABLED|SUSPENDED/.test(statusOf(r))).length,
      geo: extractGeoPoints(data).length,
    };
  }, [data]);

  if (!cfg) return null;

  return (
    <div className="rx-page rx-location-route-page">
      <div className="rx-page-head">
        <div>
          <div className="rx-eyebrow">{cfg.eyebrow}</div>
          <h1>{cfg.title}</h1>
          <p>{cfg.description}</p>
        </div>
        <div className="rx-toolbar-actions">
          {cfg.map ? (
            <div className="rx-segmented" role="tablist" aria-label="Workspace view">
              <button type="button" className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}>Map</button>
              <button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>List</button>
            </div>
          ) : null}
          <Button variant="secondary" loading={loading || refreshing} onClick={() => void load(false)}><RefreshCw size={15}/>Refresh</Button>
        </div>
      </div>

      <Notice>{context.isSuperAdmin ? "Super Admin · global authorized workspace." : `Scope: ${context.adminLevel}${context.stateName ? ` · ${context.stateName}` : ""}${context.cityName ? ` · ${context.cityName}` : ""}. Backend scope remains authoritative.`}</Notice>
      <Notice>{cfg.hint}</Notice>
      {error ? <Notice tone="danger">{error} <button type="button" className="rx-inline-link" onClick={() => void load(false)}>Retry</button></Notice> : null}
      {error && data !== null ? <Notice tone="warning">Showing the last successful response; it may be stale. Last successful fetch remains the reference until a new response succeeds.</Notice> : null}

      {screen === "locations" ? <Card title={editingLocationId ? "Edit Location Master record" : "Create Location Master record"} eyebrow="VALIDATED PICKUP / DROP POINTS">
        <Notice>Backend requires an active City Master matching the entered State + City. Address suggestions use Google Places through the authenticated backend; no API key is sent to the browser.</Notice>
        {!LOCATION_MUTATIONS_ENABLED ? <Notice tone="warning">Read-only mode: create/update is disabled until the exact backend mutation contract has been verified against source. You can still draft and inspect values; no write request will be sent.</Notice> : null}
        {locationSaveError ? <Notice tone="danger">{locationSaveError}</Notice> : null}
        {locationSaveMessage ? <Notice tone="success">{locationSaveMessage}</Notice> : null}
        <div className="rx-form-grid">
          <label>Location name<input value={locationDraft.name} onChange={e=>setLocationDraft(v=>({...v,name:e.target.value}))} placeholder="e.g. Railway Station Gate" required/></label>
          <label>State<input value={locationDraft.state} onChange={e=>setLocationDraft(v=>({...v,state:e.target.value}))} placeholder="Bihar" required disabled={Boolean(editingLocationId)}/>{editingLocationId ? <small>State is derived from the linked City Master on updates; change the City Master relationship deliberately.</small> : null}</label>
          <label>City<input value={locationDraft.city} onChange={e=>setLocationDraft(v=>({...v,city:e.target.value}))} placeholder="Bhagalpur" required/></label>
          <label>City Master ID (optional)<input value={locationDraft.cityId} onChange={e=>setLocationDraft(v=>({...v,cityId:e.target.value}))} placeholder="Leave blank to resolve active State + City"/></label>
          <label>Category<select value={locationDraft.category} onChange={e=>setLocationDraft(v=>({...v,category:e.target.value}))}>{["LANDMARK","PICKUP_POINT","DROP_POINT","CONNECTION_POINT","EVENT_POINT","STATION","AREA","OTHER"].map(v=><option key={v}>{v}</option>)}</select></label>
          <label>Type<select value={locationDraft.type} onChange={e=>setLocationDraft(v=>({...v,type:e.target.value}))}>{["LANDMARK","PICKUP_POINT","DROP_POINT","CONNECTION_POINT","EVENT_POINT","STATION","AREA","OTHER"].map(v=><option key={v}>{v}</option>)}</select></label>
          <label style={{gridColumn:"1 / -1"}}>Address / nearby place<input value={locationDraft.address} onChange={e=>{setLocationDraft(v=>({...v,address:e.target.value}));setPlaceSearch(e.target.value);}} placeholder="Type a street, landmark, station or nearby place" autoComplete="off" required/>
            {placesLoading ? <small className="event-place-status">Searching Google Places…</small> : null}
            {placesError ? <small className="event-place-status error">{placesError}</small> : null}
            {placeSuggestions.length ? <div className="event-location-suggestions" role="listbox" aria-label="Google address suggestions">{placeSuggestions.map((suggestion:any)=><button key={String(suggestion.placeId)} type="button" onClick={()=>void chooseGooglePlace(suggestion)}><strong>{String(suggestion.mainText??suggestion.description)}</strong><span>{String(suggestion.secondaryText??suggestion.description??"")}</span><small>Google Places · select to fill address and coordinates</small></button>)}</div> : null}
          </label>
          <label>Pincode<input value={locationDraft.pincode} onChange={e=>setLocationDraft(v=>({...v,pincode:e.target.value.replace(/\D/g,"").slice(0,6)}))} inputMode="numeric" placeholder="6 digits"/></label>
          <label>Latitude<input value={locationDraft.latitude} onChange={e=>setLocationDraft(v=>({...v,latitude:e.target.value}))} inputMode="decimal" placeholder="25.539200" required/></label>
          <label>Longitude<input value={locationDraft.longitude} onChange={e=>setLocationDraft(v=>({...v,longitude:e.target.value}))} inputMode="decimal" placeholder="87.571700" required/></label>
          <label>Pickup radius (m)<input type="number" min="10" max="5000" value={locationDraft.pickupRadiusMeters} onChange={e=>setLocationDraft(v=>({...v,pickupRadiusMeters:e.target.value}))}/></label>
          <label>Drop radius (m)<input type="number" min="10" max="5000" value={locationDraft.dropRadiusMeters} onChange={e=>setLocationDraft(v=>({...v,dropRadiusMeters:e.target.value}))}/></label>
          <label className="rx-check-field"><input type="checkbox" checked={locationDraft.pickupAllowed} onChange={e=>setLocationDraft(v=>({...v,pickupAllowed:e.target.checked}))}/>Pickup allowed</label>
          <label className="rx-check-field"><input type="checkbox" checked={locationDraft.dropAllowed} onChange={e=>setLocationDraft(v=>({...v,dropAllowed:e.target.checked}))}/>Drop allowed</label>
          <label className="rx-check-field"><input type="checkbox" checked={locationDraft.active} onChange={e=>setLocationDraft(v=>({...v,active:e.target.checked}))}/>Active after save</label>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}><Button loading={savingLocation} disabled={savingLocation || !LOCATION_MUTATIONS_ENABLED} onClick={()=>void createLocation()}><Save size={15}/>{editingLocationId ? "Update Location" : "Save Location"}</Button><Button variant="secondary" disabled={savingLocation} onClick={()=>{setLocationDraft(EMPTY_LOCATION_DRAFT);setEditingLocationId("");setPlaceSearch("");setPlaceSuggestions([]);setPlacesError("");setLocationSaveError("");setLocationSaveMessage("");}}>Clear Draft</Button></div>
      </Card> : null}

      <div className="rx-stat-grid rx-location-stat-grid">
        <Card title="Records" eyebrow="TOTAL"><strong className="rx-kpi-number">{loading || data === null ? "—" : stats.total}</strong><span>Returned by the backend</span></Card>
        <Card title="Active" eyebrow="OPERATING"><strong className="rx-kpi-number">{loading || data === null ? "—" : stats.active}</strong><span>Active / available records</span></Card>
        <Card title="Inactive" eyebrow="LIFECYCLE"><strong className="rx-kpi-number">{loading || data === null ? "—" : stats.inactive}</strong><span>Inactive or disabled records</span></Card>
        {cfg.map ? <Card title="Geographic points" eyebrow="MAP"><strong className="rx-kpi-number">{loading || data === null ? "—" : stats.geo}</strong><span>Records with usable coordinates</span></Card> : null}
      </div>

      {cfg.map && mode === "map" ? (
        <Card title={`${cfg.title} map`} eyebrow="GEOGRAPHY" action={<span className="rx-endpoint">GET {endpointFor(screen)}</span>}>
          <GeoMap data={data} title={`${cfg.title} map`} height={460}/>
        </Card>
      ) : null}

      <div className={`rx-location-route-layout ${cfg.map && mode === "map" ? "map-mode" : "list-mode"}`}>
        <Card title={`${cfg.title} records`} eyebrow="BACKEND DATA">
          <div className="rx-toolbar">
            <label className="rx-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, city, code or ID" /></label>
            <span className="rx-count">{loading ? "Loading…" : `${list.length} shown`}</span>
          </div>
          {loading ? <PixelLoader variant="center" label={`Loading ${cfg.title}…`} /> : list.length ? (
            <div className="rx-location-list">
              {list.map((row, index) => (
                <button key={String(row.id ?? index)} type="button" className={`rx-location-row ${selected === row ? "selected" : ""}`} onClick={() => setSelected(row)}>
                  <div className="rx-location-row-icon">{cfg.title.toLowerCase().includes("route") ? <Route size={17}/> : <MapPinned size={17}/>}</div>
                  <div className="rx-location-row-main"><strong>{titleFor(row, index)}</strong><span>{[row.cityName ?? row.city, row.stateName ?? row.state, row.code, row.type ?? row.category].filter(Boolean).map(String).slice(0, 3).join(" • ") || "Backend record"}</span></div>
                  <div className="rx-location-row-side"><StatusPill value={statusOf(row)}/><ChevronRight size={16}/></div>
                </button>
              ))}
            </div>
          ) : data === null && error ? <EmptyState title={`${cfg.title} unavailable`} description="The request failed before a dataset was returned. Retry to load records; an error is not the same as an empty result." /> : <EmptyState title={`No ${cfg.title.toLowerCase()} records`} description="No backend records match the current search or the authorized scope." />}
        </Card>

        <Card title={selected ? "Selected details" : "Select a record"} eyebrow="DETAIL">
          {selected ? (
            <>
              <div className="rx-location-detail-head"><div><strong>{titleFor(selected, 0)}</strong><span>{String(selected.id ?? selected.code ?? "Backend record")}</span></div><StatusPill value={statusOf(selected)}/></div>
              <div className="rx-detail-grid">{Object.entries(selected).filter(([key]) => !isSensitiveDisplayField(key)).slice(0, 22).map(([key, value]) => <div key={key} className="rx-detail-item"><span>{key}</span><strong>{scalar(redactForDisplay(value, 0, false, key))}</strong></div>)}</div>
              {extractGeoPoints(selected).length ? <div className="rx-inline-ok"><CheckCircle2 size={15}/>Coordinate-ready record</div> : null}
              {screen === "locations" ? <div style={{ marginTop: 12 }}><Button variant="secondary" onClick={() => beginEditLocation(selected)}><Save size={15}/>Edit selected location</Button></div> : null}
            </>
          ) : <div className="rx-detail-empty"><SlidersHorizontal size={20}/><p>Select a record to review its backend-authoritative fields.</p></div>}
        </Card>
      </div>

      <Card title="Operator view" eyebrow="GUIDANCE">
        <div className="rx-guide-grid">
          <div><strong>Search</strong><span>Find a location, city, state or route by backend-returned identifiers.</span></div>
          <div><strong>Inspect</strong><span>Use the selected-detail panel for the current authoritative record.</span></div>
          <div><strong>Map</strong><span>For geographic workspaces, switch between map and list without changing backend data.</span></div>
        </div>
        <button type="button" className="rx-text-button" onClick={() => setShowRaw(v => !v)}>{showRaw ? "Hide raw response" : "Show raw response"}</button>
        {showRaw ? <pre className="rx-raw-response">{safeDisplayJson(data)}</pre> : null}
      </Card>
    </div>
  );
}
