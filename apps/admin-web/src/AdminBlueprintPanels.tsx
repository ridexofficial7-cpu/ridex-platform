import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessionDraft } from "./lib/draftStorage";
import { RIDEX_API, resourcePath, withQuery } from "./lib/apiContract";
import "./events-panel.css";
import { CheckCircle2, Clock3, Map, RefreshCw } from "lucide-react";

export type BlueprintApiResponse<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  [key: string]: unknown;
};

export type BlueprintApiRequest = <T = unknown>(
  path: string,
  options?: RequestInit,
) => Promise<BlueprintApiResponse<T>>;

type Notify = (type: "success" | "error" | "info", message: string) => void;

type EventStop = {
  id: string;
  state: string;
  city: string;
  name: string;
  address: string;
  pincode: string;
  latitude: string;
  longitude: string;
};

type EventDraft = {
  name: string;
  description: string;
  workingDate: string;
  sessionStart: string;
  sessionEnd: string;
  capacity: string;
  fare: string;
};

type EventLocationRecord = {
  id: string;
  state?: string | null;
  city?: string | null;
  cityId?: string | null;
  name?: string | null;
  address?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  active?: boolean;
  isActive?: boolean;
};

type EventsPanelProps = { apiRequest: BlueprintApiRequest; notify: Notify; draftNamespace?: string; mutationsEnabled?: boolean };

const makeEventStop = (index: number): EventStop => ({
  id: typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`,
  state: "",
  city: "",
  name: `Stop ${index + 1}`,
  address: "",
  pincode: "",
  latitude: "",
  longitude: "",
});

export function EventsPanel({ apiRequest, notify, draftNamespace = "current", mutationsEnabled = false }: EventsPanelProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [locations, setLocations] = useState<EventLocationRecord[]>([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [draft, setDraft] = useSessionDraft<EventDraft>(`ridex-admin-event-draft-${draftNamespace}`, {
    name: "", description: "", workingDate: "", sessionStart: "", sessionEnd: "", capacity: "20", fare: "0",
  });
  const [stops, setStops] = useSessionDraft<EventStop[]>(`ridex-admin-event-stops-${draftNamespace}`, Array.from({ length: 6 }, (_, index) => makeEventStop(index)));
  const [googlePlaceSuggestions, setGooglePlaceSuggestions] = useState<Record<string, any[]>>({});
  const [googlePlacesLoading, setGooglePlacesLoading] = useState<Record<string, boolean>>({});
  const [googlePlacesErrors, setGooglePlacesErrors] = useState<Record<string, string>>({});
  const [placeSearch, setPlaceSearch] = useState<{ stopId: string; query: string } | null>(null);
  const eventsRequestSequence = useRef(0);
  const locationsRequestSequence = useRef(0);

  const loadEvents = useCallback(async () => {
    const sequence = ++eventsRequestSequence.current;
    setLoading(true);
    setEventsError("");
    try {
      const response = await apiRequest<any[]>(RIDEX_API.admin.events);
      if (response.success === false) throw new Error(response.message ?? 'Unable to load events');
      if (sequence !== eventsRequestSequence.current) return;
      setEvents(Array.isArray(response.data) ? response.data : []);
      setEventsLoaded(true);
    } catch (error) {
      if (sequence !== eventsRequestSequence.current) return;
      setEventsError(error instanceof Error ? error.message : 'Unable to load events');
      notify('error', error instanceof Error ? error.message : 'Unable to load events');
    } finally {
      if (sequence === eventsRequestSequence.current) setLoading(false);
    }
  }, [apiRequest, notify]);

  const loadLocations = useCallback(async () => {
    const sequence = ++locationsRequestSequence.current;
    setLocationLoading(true);
    setLocationError("");
    try {
      const response = await apiRequest<any[]>(RIDEX_API.admin.locations);
      if (response.success === false) throw new Error(response.message ?? 'Unable to load Location Master');
      if (sequence !== locationsRequestSequence.current) return;
      setLocations(Array.isArray(response.data) ? response.data : []);
      setLocationsLoaded(true);
    } catch (primaryError) {
      try {
        const fallback = await apiRequest<any[]>(RIDEX_API.admin.quickLocations);
        if (fallback.success === false) throw new Error(fallback.message ?? "Unable to load quick locations");
        if (sequence !== locationsRequestSequence.current) return;
        setLocations(
          (Array.isArray(fallback.data) ? fallback.data : []).map((row: any) => ({
            id: String(row.id),
            state: row.state ?? '',
            city: row.city ?? '',
            cityId: row.cityId ?? null,
            name: row.name ?? row.address ?? '',
            address: row.address ?? '',
            pincode: row.pincode ?? null,
            latitude: row.latitude ?? null,
            longitude: row.longitude ?? null,
            active: row.active ?? row.isActive ?? true,
          })),
        );
        setLocationsLoaded(true);
        setLocationError("The full Location Master request failed; the displayed locations are from the quick-location fallback and may be incomplete.");
      } catch (fallbackError) {
        if (sequence !== locationsRequestSequence.current) return;
        setLocationError(fallbackError instanceof Error ? fallbackError.message : primaryError instanceof Error ? primaryError.message : "Unable to load Location Master or quick locations.");
      }
    } finally {
      if (sequence === locationsRequestSequence.current) setLocationLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    void loadEvents();
    void loadLocations();
    const refresh = () => {
      void loadEvents();
      void loadLocations();
    };
    window.addEventListener('ridex-admin-refresh', refresh);
    return () => {
      eventsRequestSequence.current += 1;
      locationsRequestSequence.current += 1;
      window.removeEventListener('ridex-admin-refresh', refresh);
    };
  }, [loadEvents, loadLocations]);

  useEffect(() => {
    let currentRequest = true;
    const query = placeSearch?.query.trim() ?? "";
    if (!placeSearch || query.length < 3) return () => { currentRequest = false; };
    const stop = stops.find((item) => item.id === placeSearch.stopId);
    if (!stop) return () => { currentRequest = false; };

    const timer = window.setTimeout(async () => {
      setGooglePlacesLoading((current) => ({ ...current, [stop.id]: true }));
      setGooglePlacesErrors((current) => ({ ...current, [stop.id]: "" }));
      try {
        const response = await apiRequest<any>(withQuery(RIDEX_API.admin.locationSuggestions, { q: query, city: stop.city.trim(), state: stop.state.trim() }));
        if (response.success === false) throw new Error(response.message ?? "Google Places search failed");
        const results = Array.isArray((response.data as any)?.suggestions) ? (response.data as any).suggestions : [];
        if (!currentRequest) return;
        setGooglePlaceSuggestions((current) => ({ ...current, [stop.id]: results }));
        if (!results.length) setGooglePlacesErrors((current) => ({ ...current, [stop.id]: "No Google Places matches. Check the spelling or choose a saved Location Master point." }));
      } catch (error) {
        if (!currentRequest) return;
        setGooglePlaceSuggestions((current) => ({ ...current, [stop.id]: [] }));
        setGooglePlacesErrors((current) => ({ ...current, [stop.id]: error instanceof Error ? error.message : "Google Places search is unavailable; use Location Master suggestions." }));
      } finally {
        if (currentRequest) setGooglePlacesLoading((current) => ({ ...current, [stop.id]: false }));
      }
    }, 450);
    return () => { currentRequest = false; window.clearTimeout(timer); };
  }, [placeSearch, stops, apiRequest]);

  const chooseGooglePlace = useCallback(async (stopId: string, suggestion: any) => {
    try {
      const response = await apiRequest<any>(withQuery(RIDEX_API.admin.locationPlaceDetails, { placeId: String(suggestion.placeId ?? "") }));
      if (response.success === false) throw new Error(response.message ?? "Unable to load selected place");
      const place = response.data as any;
      setStops((current) => current.map((stop) => stop.id === stopId ? {
        ...stop,
        name: String(place?.name || suggestion.mainText || suggestion.description || stop.name),
        address: String(place?.address || suggestion.description || stop.address),
        city: String(place?.city || stop.city),
        state: String(place?.state || stop.state),
        pincode: String(place?.pincode || stop.pincode),
        latitude: place?.latitude == null ? stop.latitude : String(place.latitude),
        longitude: place?.longitude == null ? stop.longitude : String(place.longitude),
      } : stop));
      setGooglePlaceSuggestions((current) => ({ ...current, [stopId]: [] }));
      setGooglePlacesErrors((current) => ({ ...current, [stopId]: "" }));
      setPlaceSearch(null);
      notify("success", "Google Places address and coordinates filled. Review the city/state before saving the event.");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Unable to load selected place");
    }
  }, [apiRequest, notify]);

  const activeLocations = useMemo(
    () => locations.filter((row) => row.active !== false && row.isActive !== false),
    [locations],
  );

  const stateSuggestions = useMemo(
    () => Array.from(new Set(activeLocations.map((row) => String(row.state ?? '').trim()).filter(Boolean))).sort(),
    [activeLocations],
  );

  const citySuggestions = useMemo(
    () => Array.from(new Set(activeLocations.map((row) => String(row.city ?? '').trim()).filter(Boolean))).sort(),
    [activeLocations],
  );

  const updateStop = useCallback((stopId: string, key: keyof EventStop, value: string) => {
    setStops((current) => current.map((stop) => stop.id === stopId ? { ...stop, [key]: value } : stop));
  }, []);

  const stopSuggestions = useCallback((stop: EventStop) => {
    const q = stop.name.trim().toLowerCase();
    const state = stop.state.trim().toLowerCase();
    const city = stop.city.trim().toLowerCase();
    if (!q && !state && !city) return [];
    return activeLocations.filter((row) => {
      const rowState = String(row.state ?? '').toLowerCase();
      const rowCity = String(row.city ?? '').toLowerCase();
      const haystack = `${row.name ?? ''} ${row.address ?? ''} ${row.city ?? ''} ${row.state ?? ''}`.toLowerCase();
      return (!state || rowState === state) && (!city || rowCity === city) && (!q || haystack.includes(q));
    }).slice(0, 6);
  }, [activeLocations]);

  const selectLocation = useCallback((stopId: string, location: EventLocationRecord) => {
    setStops((current) => current.map((stop) => stop.id === stopId ? {
      ...stop,
      state: String(location.state ?? ''),
      city: String(location.city ?? ''),
      name: String(location.name ?? location.address ?? ''),
      address: String(location.address ?? location.name ?? ''),
      pincode: String(location.pincode ?? ''),
      latitude: location.latitude == null ? '' : String(location.latitude),
      longitude: location.longitude == null ? '' : String(location.longitude),
    } : stop));
  }, []);

  const captureStopLocation = useCallback((stopId: string) => {
    if (!navigator.geolocation) {
      notify('error', 'Browser location is not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStops((current) => current.map((stop) => stop.id === stopId ? {
          ...stop,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        } : stop));
        notify('success', 'Current GPS captured for the selected stop.');
      },
      (error) => notify('error', error.message || 'Unable to capture GPS location.'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, [notify]);

  const validStops = useMemo(
    () => stops.filter((stop) => {
      const latitude = Number(stop.latitude);
      const longitude = Number(stop.longitude);
      return Boolean(stop.name.trim()) && Boolean(stop.address.trim()) && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    }),
    [stops],
  );

  const createEvent = async () => {
    if (!mutationsEnabled) return notify('info', 'Creating an event is disabled until the exact backend mutation contract is verified. Your draft remains local.');
    if (!draft.name.trim()) return notify('error', 'Event name is required.');
    if (!draft.workingDate) return notify('error', 'Working date is required.');
    if (!draft.sessionStart || !draft.sessionEnd) return notify('error', 'Session start and end are required.');
    if (validStops.length < 6 || validStops.length > 10) return notify('error', 'Event must contain 6–10 complete stops with coordinates.');

    const capacity = Number(draft.capacity);
    const fare = Number(draft.fare);
    if (!Number.isFinite(capacity) || capacity <= 0) return notify('error', 'Capacity must be greater than zero.');
    if (!Number.isFinite(fare) || fare < 0) return notify('error', 'Fare must be zero or greater.');

    const startsAt = `${draft.workingDate}T${draft.sessionStart}:00`;
    const endsAt = `${draft.workingDate}T${draft.sessionEnd}:00`;
    if (!Number.isFinite(new Date(startsAt).getTime()) || !Number.isFinite(new Date(endsAt).getTime())) {
      return notify('error', 'Invalid session date/time.');
    }

    try {
      const response = await apiRequest(RIDEX_API.admin.events, {
        method: 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim(),
          startsAt,
          endsAt,
          stops: validStops.map((stop) => ({
            name: stop.name.trim(),
            address: stop.address.trim(),
            latitude: Number(stop.latitude),
            longitude: Number(stop.longitude),
          })),
          sessions: [{
            startsAt,
            endsAt,
            capacity: Math.trunc(capacity),
            fare,
            startSequence: 1,
            endSequence: validStops.length,
          }],
        }),
      });
      if (response.success === false) throw new Error(response.message ?? 'Event creation was rejected by backend');
      notify('success', 'Event created in backend as DRAFT. Publish it when the route is ready.');
      setDraft({ name: "", description: "", workingDate: "", sessionStart: "", sessionEnd: "", capacity: "20", fare: "0" });
      setStops(Array.from({ length: 6 }, (_, index) => makeEventStop(index)));
      await loadEvents();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to create event');
    }
  };

  const changeEventStatus = useCallback(async (event: any, action: 'publish' | 'unpublish') => {
    if (!mutationsEnabled) { notify('info', 'Publishing events is disabled until the exact backend mutation contract is verified.'); return; }
    try {
      const response = await apiRequest(resourcePath(RIDEX_API.admin.events, String(event.id), action), { method: 'POST' });
      if (response.success === false) throw new Error(response.message ?? `Unable to ${action} event`);
      notify('success', action === 'publish' ? 'Event published.' : 'Event unpublished.');
      await loadEvents();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : `Unable to ${action} event`);
    }
  }, [apiRequest, loadEvents, notify, mutationsEnabled]);

  const deleteEvent = useCallback(async (event: any) => {
    if (!mutationsEnabled) { notify('info', 'Deleting events is disabled until the exact backend mutation contract is verified.'); return; }
    if (!window.confirm(`Delete event “${String(event.name ?? event.id)}”?`)) return;
    try {
      const response = await apiRequest(resourcePath(RIDEX_API.admin.events, String(event.id)), { method: 'DELETE' });
      if (response.success === false) throw new Error(response.message ?? 'Unable to delete event');
      notify('success', 'Event deleted.');
      await loadEvents();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to delete event');
    }
  }, [apiRequest, loadEvents, notify, mutationsEnabled]);

  const openMaps = (stop: EventStop) => {
    const lat = Number(stop.latitude);
    const lng = Number(stop.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <p className="eyebrow">EVENT / SESSIONAL RIDE</p>
          <h2>Event Management</h2>
          <p>Admin-defined fixed routes with 6–10 stops. Stops are selected from the Location Master so coordinates stay consistent with Customer/Driver routing.</p>
        </div>
        <div className="button-row">
          <span className="api-pill"><span className="online-dot" /> {locationLoading ? 'Loading locations…' : !locationsLoaded ? 'Locations unavailable' : `${activeLocations.length} saved locations`}</span>
          <button className="button secondary" type="button" onClick={() => { void loadEvents(); void loadLocations(); }} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {!mutationsEnabled ? <div className="info-box" role="status"><strong>Read-only contract gate</strong><p>Event create, publish, unpublish and delete are disabled until the exact backend mutation routes, request fields and authorization requirements are verified. Draft fields and stop ordering remain local in this browser.</p></div> : null}
      {eventsError && eventsLoaded ? <div className="info-box" role="status"><strong>Showing the last successful event list</strong><p>{eventsError}. The current event list may be stale.</p></div> : null}
      {!eventsLoaded && eventsError ? <div className="info-box" role="alert"><strong>Event catalogue unavailable</strong><p>{eventsError}. Retry to determine whether events exist.</p><button type="button" onClick={() => void loadEvents()}>Retry events</button></div> : null}
      {locationError ? <div className="info-box" role={locationsLoaded ? "status" : "alert"}><strong>{locationsLoaded ? "Location data warning" : "Location Master unavailable"}</strong><p>{locationError}</p>{!locationsLoaded ? <button type="button" onClick={() => void loadLocations()}>Retry locations</button> : null}</div> : null}

      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-icon"><Clock3 size={18}/></div><div className="metric-content"><span>Events</span><strong>{eventsLoaded ? events.length : "—"}</strong></div></div>
        <div className="metric-card metric-success"><div className="metric-icon metric-icon-success"><CheckCircle2 size={18}/></div><div className="metric-content"><span>Published</span><strong>{eventsLoaded ? events.filter((event) => Boolean(event.active) || String(event.status ?? '').toUpperCase() === 'PUBLISHED').length : "—"}</strong></div></div>
        <div className="metric-card"><div className="metric-icon"><Map size={18}/></div><div className="metric-content"><span>Location Master</span><strong>{locationsLoaded ? activeLocations.length : "—"}</strong></div></div>
      </div>

      <div className="content-grid two">
        <div className="panel">
          <div className="panel-header"><div><p className="eyebrow">EVENT DRAFT</p><h3>Create Event</h3><p>Use saved locations to auto-fill state, city, address and GPS. Manual GPS capture is also available.</p></div></div>
          <div className="detail-grid">
            <label><span className="field-label">Event Name</span><input className="text-input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Katihar Festival Shuttle" /></label>
            <label><span className="field-label">Working Date</span><input className="text-input" type="date" value={draft.workingDate} onChange={(e) => setDraft((d) => ({ ...d, workingDate: e.target.value }))} /></label>
            <label><span className="field-label">Session Start</span><input className="text-input" type="time" value={draft.sessionStart} onChange={(e) => setDraft((d) => ({ ...d, sessionStart: e.target.value }))} /></label>
            <label><span className="field-label">Session End</span><input className="text-input" type="time" value={draft.sessionEnd} onChange={(e) => setDraft((d) => ({ ...d, sessionEnd: e.target.value }))} /></label>
            <label><span className="field-label">Capacity</span><input className="text-input" type="number" min={1} value={draft.capacity} onChange={(e) => setDraft((d) => ({ ...d, capacity: e.target.value }))} /></label>
            <label><span className="field-label">Fare</span><input className="text-input" type="number" min={0} value={draft.fare} onChange={(e) => setDraft((d) => ({ ...d, fare: e.target.value }))} /></label>
            <label style={{ gridColumn: '1 / -1' }}><span className="field-label">Description</span><textarea className="text-input" rows={3} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Admin-managed event route" /></label>
          </div>

          <div className="panel-header" style={{ marginTop: 18 }}>
            <div><p className="eyebrow">FIXED ROUTE</p><h3>{stops.length} stops</h3></div>
            <div className="button-row"><span className={`status ${validStops.length >= 6 && validStops.length <= 10 ? 'success' : 'warning'}`}>{validStops.length}/6–10 ready</span><button className="button secondary small" type="button" onClick={() => { if (stops.length < 10) setStops((current) => [...current, makeEventStop(current.length)]); }} disabled={stops.length >= 10}>Add Stop</button></div>
          </div>

          <div className="event-stop-list">
            {stops.map((stop, index) => {
              const suggestions = stopSuggestions(stop);
              return (
                <div className="event-stop-card" key={stop.id}>
                  <div className="event-stop-card-header">
                    <div><span className="eyebrow">STOP {index + 1}</span><strong>{stop.name || `Stop ${index + 1}`}</strong></div>
                    <div className="button-row">
                      <span className={`status ${stop.latitude && stop.longitude && stop.address ? 'success' : 'warning'}`}>{stop.latitude && stop.longitude && stop.address ? 'READY' : 'LOCATION NEEDED'}</span>
                      <button className="button secondary small" type="button" onClick={() => captureStopLocation(stop.id)}>Use GPS</button>
                      {stops.length > 6 ? <button className="button danger-button small" type="button" onClick={() => setStops((current) => current.filter((row) => row.id !== stop.id))}>Remove</button> : null}
                    </div>
                  </div>
                  <div className="detail-grid compact-grid">
                    <label><span className="field-label">State</span><input className="text-input" list="ridex-event-states" value={stop.state} onChange={(e) => updateStop(stop.id, 'state', e.target.value)} placeholder="Bihar" /></label>
                    <label><span className="field-label">City</span><input className="text-input" list="ridex-event-cities" value={stop.city} onChange={(e) => updateStop(stop.id, 'city', e.target.value)} placeholder="Katihar" /></label>
                    <label style={{ gridColumn: '1 / -1' }}><span className="field-label">Local Location / Stop Name</span><input className="text-input" value={stop.name} onChange={(e) => updateStop(stop.id, 'name', e.target.value)} placeholder="Mirchie Bari / Power House Road" autoComplete="off" />
                      {suggestions.length ? <div className="event-location-suggestions">{suggestions.map((location) => <button key={location.id} type="button" onClick={() => selectLocation(stop.id, location)}><strong>{location.name ?? location.address ?? 'Saved location'}</strong><span>{location.address ?? 'No address'} · {location.city ?? ''}{location.state ? `, ${location.state}` : ''}</span></button>)}</div> : null}
                    </label>
                    <label style={{ gridColumn: '1 / -1' }}><span className="field-label">Address</span><input className="text-input" value={stop.address} onChange={(e) => { const query = e.target.value; updateStop(stop.id, 'address', query); setGooglePlaceSuggestions((current) => ({ ...current, [stop.id]: [] })); setGooglePlacesErrors((current) => ({ ...current, [stop.id]: "" })); setPlaceSearch(query.trim().length >= 3 ? { stopId: stop.id, query } : null); }} placeholder="Type address / landmark for suggestions" autoComplete="off" />{googlePlacesLoading[stop.id] ? <small className="event-place-status">Searching Google Places…</small> : null}{googlePlacesErrors[stop.id] ? <small className="event-place-status error">{googlePlacesErrors[stop.id]}</small> : null}{(googlePlaceSuggestions[stop.id] ?? []).length ? <div className="event-location-suggestions" role="listbox" aria-label={`Google address suggestions for ${stop.name}`}>{(googlePlaceSuggestions[stop.id] ?? []).map((suggestion: any) => <button key={String(suggestion.placeId)} type="button" onClick={() => void chooseGooglePlace(stop.id, suggestion)}><strong>{String(suggestion.mainText ?? suggestion.description)}</strong><span>{String(suggestion.secondaryText ?? suggestion.description ?? "")}</span><small>Google Places</small></button>)}</div> : null}</label>
                    <label><span className="field-label">Pincode</span><input className="text-input" value={stop.pincode} onChange={(e) => updateStop(stop.id, 'pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="854105" /></label>
                    <label><span className="field-label">Latitude</span><input className="text-input" value={stop.latitude} onChange={(e) => updateStop(stop.id, 'latitude', e.target.value)} inputMode="decimal" placeholder="25.539200" /></label>
                    <label><span className="field-label">Longitude</span><input className="text-input" value={stop.longitude} onChange={(e) => updateStop(stop.id, 'longitude', e.target.value)} inputMode="decimal" placeholder="87.571700" /></label>
                  </div>
                  <div className="event-stop-footer">
                    <span>GPS {stop.latitude && stop.longitude ? `${stop.latitude}, ${stop.longitude}` : 'not selected'} · PIN {stop.pincode || '—'}</span>
                    {stop.latitude && stop.longitude ? <button className="button secondary small" type="button" onClick={() => openMaps(stop)}>Open Google Maps</button> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <datalist id="ridex-event-states">{stateSuggestions.map((state) => <option key={state} value={state}/>)}</datalist>
          <datalist id="ridex-event-cities">{citySuggestions.map((city) => <option key={city} value={city}/>)}</datalist>
          <div className="info-box" style={{ marginTop: 14 }}><strong>Location source</strong><p>Suggestions and automatic coordinates come from the Admin Location Master. Add “Mirchie Bari”, “Power House Road” or other local points there once; Event Stops can then reuse the exact saved coordinates across Customer, Driver and Admin flows.</p></div>
          <div className="button-row" style={{ marginTop: 14 }}><button className="button primary" type="button" onClick={() => void createEvent()} disabled={loading || !mutationsEnabled}>Create Event in Backend</button></div>
        </div>

        <div className="panel">
          <div className="panel-header"><div><p className="eyebrow">EVENT CATALOG</p><h3>{events.length} event(s)</h3><p>Publish only after the fixed route and session are checked.</p></div></div>
          {loading ? <div style={{ padding: 16 }}>Loading events…</div> : events.length ? <div className="event-catalog-list">{events.map((event) => {
            const published = Boolean(event.active) || String(event.status ?? '').toUpperCase() === 'PUBLISHED';
            return <div className="event-catalog-card" key={String(event.id)}>
              <div><strong>{String(event.name ?? event.id)}</strong><span>{published ? 'PUBLISHED' : 'DRAFT'} · {Array.isArray(event.stops) ? event.stops.length : 0} stop(s) · {Array.isArray(event.sessions) ? event.sessions.length : 0} session(s)</span></div>
              <div className="button-row">{published ? <button className="button secondary small" type="button" disabled={!mutationsEnabled} onClick={() => void changeEventStatus(event, 'unpublish')}>Unpublish</button> : <button className="button primary small" type="button" disabled={!mutationsEnabled} onClick={() => void changeEventStatus(event, 'publish')}>Publish</button>}<button className="button danger-button small" type="button" disabled={!mutationsEnabled} onClick={() => void deleteEvent(event)}>Delete</button></div>
            </div>;
          })}</div> : eventsError && !eventsLoaded ? <div className="info-box"><strong>Event list unavailable</strong><p>Retry the request to confirm whether events exist.</p></div> : <div className="info-box"><strong>No backend event records</strong><p>The last successful event response returned no records. New backend events are disabled until its mutation contract is verified.</p></div>}
        </div>
      </div>
    </div>
  );
}
