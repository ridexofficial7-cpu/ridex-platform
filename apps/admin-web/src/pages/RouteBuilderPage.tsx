import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, MapPinned, Plus, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { API_CONTRACT_STATUS, RIDEX_API } from "../lib/apiContract";
import { request, ApiError } from "../lib/api";
import type { AdminContext } from "../types";
import { Button, Card, EmptyState, Notice, StatusPill } from "../components/ui";
import { useSessionDraft } from "../lib/draftStorage";
import "../route-builder.css";

type LocationRecord = Record<string, any>;
type RouteRecord = Record<string, any>;
type Point = { id: string; name: string; lat: number; lng: number; city?: string; address?: string; raw: LocationRecord };

const DEFAULT_CENTER = { lat: 25.0961, lng: 85.3131 };
const MIN_ZOOM = 9;
const MAX_ZOOM = 16;
const DEFAULT_ZOOM = 12;
const TILE_SIZE = 256;
const MAP_WIDTH_FALLBACK = 900;
const ROUTE_MUTATIONS_ENABLED = String(API_CONTRACT_STATUS) === "VERIFIED_AGAINST_BACKEND_SOURCE";

function clamp(value:number,min:number,max:number){ return Math.max(min,Math.min(max,value)); }
function latToY(lat:number,zoom:number){ const sin=clamp(Math.sin((lat*Math.PI)/180),-0.9999,0.9999); return (0.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*2**zoom; }
function lonToX(lng:number,zoom:number){ return ((lng+180)/360)*2**zoom; }
function yToLat(y:number,zoom:number){ const n=Math.PI-(2*Math.PI*y)/2**zoom; return (180/Math.PI)*Math.atan(Math.sinh(n)); }
function xToLng(x:number,zoom:number){ return (x/2**zoom)*360-180; }

function extractRows(value:unknown): LocationRecord[] {
  if(Array.isArray(value)) return value.filter(Boolean) as LocationRecord[];
  if(value && typeof value === "object"){
    const root=value as Record<string,any>;
    for(const key of ["items","records","rows","results","locations","routes"]) if(Array.isArray(root[key])) return root[key].filter(Boolean);
  }
  return [];
}

function locationPoint(row:LocationRecord, index:number): Point|null {
  const lat=Number(row.latitude ?? row.lat ?? row.centerLat);
  const lng=Number(row.longitude ?? row.lng ?? row.centerLng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180) return null;
  return {
    id:String(row.id ?? row.locationId ?? `location-${index}`),
    name:String(row.name ?? row.label ?? row.address ?? `Location ${index+1}`),
    lat,lng,
    city: row.cityName ?? row.city ?? undefined,
    address: row.address ?? undefined,
    raw: row,
  };
}

function routePointIds(route:RouteRecord): string[] {
  if(Array.isArray(route.stopIds)) return route.stopIds.map(String);
  if(Array.isArray(route.stops)) return route.stops.map((s:any)=>String(s.locationId ?? s.id ?? "")).filter(Boolean);
  return [];
}

export function RouteBuilderPage({ context }: { context: AdminContext }) {
  const [locations,setLocations]=useState<Point[]>([]);
  const [routes,setRoutes]=useState<RouteRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [loadError,setLoadError]=useState(false);
  const [notice,setNotice]=useState("");
  const [hasLoaded,setHasLoaded]=useState(false);
  const draftPrefix = `ridex-admin-route-builder-${context.adminId || "current"}`;
  const [search,setSearch]=useSessionDraft(`${draftPrefix}-search`, "");
  const [selectedRouteId,setSelectedRouteId]=useSessionDraft(`${draftPrefix}-selected-route`, "");
  const [startId,setStartId]=useSessionDraft(`${draftPrefix}-start`, "");
  const [endId,setEndId]=useSessionDraft(`${draftPrefix}-end`, "");
  const [stopIds,setStopIds]=useSessionDraft<string[]>(`${draftPrefix}-stops`, []);
  const [routeName,setRouteName]=useSessionDraft(`${draftPrefix}-name`, "");
  const [city,setCity]=useSessionDraft(`${draftPrefix}-city`, "");
  const [cityId,setCityId]=useSessionDraft(`${draftPrefix}-city-id`, "");
  const [vehicleType,setVehicleType]=useSessionDraft(`${draftPrefix}-vehicle-type`, "");
  const [serviceType,setServiceType]=useSessionDraft(`${draftPrefix}-service-type`, "");
  const [matchingMode,setMatchingMode]=useSessionDraft(`${draftPrefix}-matching-mode`, "");
  const [selectionMode,setSelectionMode]=useSessionDraft(`${draftPrefix}-selection-mode`, "");
  const [active,setActive]=useSessionDraft(`${draftPrefix}-active`, false);
  const [zoom,setZoom]=useState(DEFAULT_ZOOM);
  const [center,setCenter]=useState(DEFAULT_CENTER);
  const mapContainerRef=useRef<HTMLDivElement|null>(null);
  const [mapWidth,setMapWidth]=useState(MAP_WIDTH_FALLBACK);
  const [drag,setDrag]=useState<{x:number;y:number;cx:number;cy:number}|null>(null);
  const [mapMode,setMapMode]=useState<"START"|"STOP"|"END">("STOP");

  useEffect(() => {
    const node = mapContainerRef.current;
    if (!node) return;
    const resize = () => setMapWidth(Math.max(320, Math.round(node.clientWidth)));
    resize();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(resize);
      observer.observe(node);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const reload = async () => {
    setLoading(true); setError(""); setLoadError(false);
    try {
      const [locationData, routeData] = await Promise.all([
        request<any>(RIDEX_API.admin.locations),
        request<any>(RIDEX_API.admin.routes),
      ]);
      const parsedLocations = extractRows(locationData).map(locationPoint).filter(Boolean) as Point[];
      setLocations(parsedLocations);
      setRoutes(extractRows(routeData));
      setHasLoaded(true);
      setLoadError(false);
      if(parsedLocations.length){
        const lat=parsedLocations.reduce((s,p)=>s+p.lat,0)/parsedLocations.length;
        const lng=parsedLocations.reduce((s,p)=>s+p.lng,0)/parsedLocations.length;
        setCenter({lat,lng});
      }
    } catch(error){
      setLoadError(true);
      setError(error instanceof ApiError ? `${error.message}${error.status?` · HTTP ${error.status}`:""}` : error instanceof Error ? error.message : "Unable to load route builder data.");
    } finally { setLoading(false); }
  };

  useEffect(()=>{ void reload(); },[]);

  const visibleLocations = useMemo(()=>{
    const q=search.trim().toLowerCase();
    return locations.filter(p=>!q || `${p.name} ${p.city??""} ${p.address??""} ${p.id}`.toLowerCase().includes(q));
  },[locations,search]);

  const selectedIds = new Set([startId,endId,...stopIds].filter(Boolean));
  const points = useMemo(()=>locations.filter(p=>selectedIds.has(p.id)),[locations,startId,endId,stopIds]);
  const fitCenter = useMemo(()=>{
    if(!points.length) return center;
    return {lat:points.reduce((s,p)=>s+p.lat,0)/points.length,lng:points.reduce((s,p)=>s+p.lng,0)/points.length};
  },[points,center]);
  const effectiveCenter = points.length ? (zoom===DEFAULT_ZOOM ? fitCenter : center) : center;
  const centerX=lonToX(effectiveCenter.lng,zoom); const centerY=latToY(effectiveCenter.lat,zoom);
  const project=(p:Point)=>({left:mapWidth/2+(lonToX(p.lng,zoom)-centerX)*TILE_SIZE,top:360/2+(latToY(p.lat,zoom)-centerY)*TILE_SIZE});

  const orderedPoints = useMemo(()=>[
    ...(startId?[locations.find(p=>p.id===startId)!]:[]),
    ...stopIds.map(id=>locations.find(p=>p.id===id)).filter(Boolean) as Point[],
    ...(endId?[locations.find(p=>p.id===endId)!]:[]),
  ].filter(Boolean) as Point[],[locations,startId,stopIds,endId]);

  const resetBuilder=()=>{
    setSelectedRouteId(""); setStartId(""); setEndId(""); setStopIds([]); setRouteName(""); setCity(""); setCityId(""); setVehicleType(""); setServiceType(""); setMatchingMode(""); setSelectionMode(""); setActive(false); setNotice(""); setError("");
  };

  const choosePoint=(id:string)=>{
    if(mapMode==="START"){ setStartId(id); if(id===endId) setEndId(""); setStopIds(v=>v.filter(x=>x!==id)); return; }
    if(mapMode==="END"){ setEndId(id); if(id===startId) setStartId(""); setStopIds(v=>v.filter(x=>x!==id)); return; }
    if(id===startId || id===endId) return;
    setStopIds(v=>v.includes(id)?v:v.concat(id));
  };

  const addStop=(id:string)=>choosePoint(id);
  const removeStop=(id:string)=>setStopIds(v=>v.filter(x=>x!==id));
  const moveStop=(index:number,direction:-1|1)=>{
    const nextIndex=index+direction; if(nextIndex<0||nextIndex>=stopIds.length) return;
    setStopIds(current=>{ const arr=[...current]; const temp=arr[index]; arr[index]=arr[nextIndex]; arr[nextIndex]=temp; return arr; });
  };

  const loadRoute=(route:RouteRecord)=>{
    setSelectedRouteId(String(route.id??route.routeId??""));
    setStartId(String(route.startLocationId??route.start?.id??""));
    setEndId(String(route.endLocationId??route.end?.id??""));
    setStopIds(routePointIds(route).filter(id=>id!==String(route.startLocationId??"")&&id!==String(route.endLocationId??"")));
    setRouteName(String(route.name??"")); setCity(String(route.city??"")); setCityId(String(route.cityId??"")); setVehicleType(String(route.vehicleType??"")); setServiceType(String(route.serviceType??"")); setMatchingMode(String(route.matchingMode??"")); setSelectionMode(String(route.selectionMode??"")); setActive(Boolean(route.active));
    setNotice(`Loaded route ${String(route.name??route.id??"")}`);
  };

  const validate=()=>{
    if(!routeName.trim()) return "Route name is required.";
    if(!startId) return "Select a start location.";
    if(!endId) return "Select an end location.";
    if(startId===endId) return "Start and end locations must be different.";
    if(stopIds.includes(startId)||stopIds.includes(endId)) return "Start/end cannot also be intermediate stops.";
    return "";
  };

  const saveRoute=async(nextActive:boolean)=>{
    if (!ROUTE_MUTATIONS_ENABLED) { setError("Saving routes is disabled until the exact backend mutation contract is verified. Your current route remains a local draft; no write request will be sent."); return; }
    const validation=validate(); if(validation){setError(validation);return;}
    setSaving(true); setError(""); setNotice("");
    try{
      const payload={startLocationId:startId,endLocationId:endId,stopIds,allowedDriverIds:[],zoneIds:[],name:routeName.trim(),city:city.trim(),cityId:cityId.trim()||undefined,vehicleType:vehicleType.trim()||undefined,serviceType:serviceType.trim()||undefined,matchingMode:matchingMode.trim()||undefined,selectionMode:selectionMode.trim()||undefined,active:nextActive,workingDays:[],workingStart:undefined,workingEnd:undefined,pickupRadiusMeters:undefined,dropRadiusMeters:undefined,maxDetourKm:undefined,maxPickupEtaMinutes:undefined,gpsFreshnessSeconds:undefined};
      if(selectedRouteId){
        await request(`${RIDEX_API.admin.routes}/${encodeURIComponent(selectedRouteId)}`,{method:"PATCH",body:JSON.stringify(payload)});
        setNotice(nextActive?"Route saved and activated.":"Route saved as inactive draft.");
      } else {
        const created=await request<any>(RIDEX_API.admin.routes,{method:"POST",body:JSON.stringify(payload)});
        const id=String(created?.id??created?.routeId??""); if(id) setSelectedRouteId(id);
        setNotice(nextActive?"Route created and activated.":"Route created as inactive draft.");
      }
      setActive(nextActive);
      await reload();
    }catch(error){ setError(error instanceof ApiError ? `${error.message}${error.status?` · HTTP ${error.status}`:""}` : error instanceof Error ? error.message : "Unable to save route."); }
    finally { setSaving(false); }
  };

  const routeStatus = (route:RouteRecord)=>String(route.status??(route.active?"ACTIVE":"INACTIVE")).toUpperCase();

  const onPointerDown=(e:ReactPointerEvent)=>{ if(!e.currentTarget) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDrag({x:e.clientX,y:e.clientY,cx:centerX,cy:centerY}); };
  const onPointerMove=(e:ReactPointerEvent)=>{ if(!drag) return; const dx=(e.clientX-drag.x)/TILE_SIZE; const dy=(e.clientY-drag.y)/TILE_SIZE; setCenter({lat:yToLat(drag.cy-dy,zoom),lng:xToLng(drag.cx-dx,zoom)}); };
  const onPointerUp=()=>setDrag(null);
  const recenter=()=>setCenter(fitCenter);

  return <div className="rx-page route-builder-page">
    <div className="rx-page-head">
      <div><div className="rx-eyebrow">LOCATIONS & ROUTES</div><h1>Visual Route Builder</h1><p>Build a backend-authoritative operational route from validated Location Master points.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Button variant="secondary" onClick={()=>void reload()} disabled={loading||saving}><RefreshCw size={15}/>Refresh</Button><Button variant="secondary" onClick={resetBuilder} disabled={saving}><RotateCcw size={15}/>New Route</Button></div>
    </div>
    <Notice>{context.isSuperAdmin?"Super Admin · global route workspace.":"Route authorization and geographic scope remain enforced by the backend."}</Notice>
    {error?<Notice tone="danger">{error}</Notice>:null}
    {loadError && hasLoaded ? <Notice tone="warning">Showing the last successful route/location snapshot; it may be stale.</Notice> : null}
    {!ROUTE_MUTATIONS_ENABLED ? <Notice tone="warning">Read-only contract gate: Save Draft and Save & Activate remain disabled until the route create/update API contract is verified against backend source. Map selections and form values remain local only.</Notice> : null}
    {notice?<Notice tone="success">{notice}</Notice>:null}

    <div className="route-builder-layout">
      <Card title="Route Canvas" eyebrow="VISUAL BUILDER">
        <div className="route-builder-toolbar">
          <div className="route-builder-mode"><span className="field-label">Click a map marker to set</span><div className="route-builder-mode-buttons"><button className={`rx-btn ${mapMode==="START"?"rx-btn-primary":"rx-btn-secondary"}`} onClick={()=>setMapMode("START")}>Start</button><button className={`rx-btn ${mapMode==="STOP"?"rx-btn-primary":"rx-btn-secondary"}`} onClick={()=>setMapMode("STOP")}>Stop</button><button className={`rx-btn ${mapMode==="END"?"rx-btn-primary":"rx-btn-secondary"}`} onClick={()=>setMapMode("END")}>End</button></div></div>
          <label className="rx-search route-builder-search"><MapPinned size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Location Master" /></label>
        </div>
        <div ref={mapContainerRef} className={`route-builder-map ${drag?'dragging':''}`} style={{height:360,touchAction:"none"}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="rx-map-inner rx-coordinate-grid" style={{width:mapWidth,height:360}}>
            {orderedPoints.length > 1 ? <svg className="route-builder-polyline" viewBox={`0 0 ${mapWidth} 360`} preserveAspectRatio="none" aria-label="Route preview"><polyline points={orderedPoints.map(p=>{const pos=project(p); return `${pos.left},${pos.top}`;}).join(" ")} fill="none" stroke="#dc2626" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
            {locations.map((p,i)=>{const pos=project(p); const orderIndex=orderedPoints.findIndex(v=>v?.id===p.id); return <button type="button" key={`${p.id}-${i}`} className={`rx-map-marker ${orderIndex>=0?'route-selected':''}`} style={{left:pos.left,top:pos.top}} title={p.name} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();choosePoint(p.id);}}><MapPinned size={15}/><span>{orderIndex>=0?`${orderIndex+1}. `:""}{p.name}</span></button>;})}
          </div>
          <div className="rx-map-controls"><button type="button" title="Zoom in" onClick={()=>setZoom(z=>clamp(z+1,MIN_ZOOM,MAX_ZOOM))}><Plus size={15}/></button><button type="button" title="Zoom out" onClick={()=>setZoom(z=>clamp(z-1,MIN_ZOOM,MAX_ZOOM))}>−</button><button type="button" title="Center route" onClick={recenter}>◎</button></div>
          <div className="rx-map-overlay"><span>Coordinate schematic • Click markers to build route</span><span>{effectiveCenter.lat.toFixed(5)}, {effectiveCenter.lng.toFixed(5)} • z{zoom}</span></div>
          {!locations.length&&!loading&&loadError&&!hasLoaded?<div className="rx-map-empty"><MapPinned size={24}/><strong>Location data unavailable</strong><span>Retry to load locations. A request error is not an empty Location Master.</span></div>:!locations.length&&!loading?<div className="rx-map-empty"><MapPinned size={24}/><strong>No validated locations</strong><span>Create/activate Location Master records first.</span></div>:null}
        </div>
        <div className="route-builder-sequence">
          <div><p className="eyebrow">ROUTE PREVIEW</p><h3>{orderedPoints.length ? `${orderedPoints.length} points` : "No route points yet"}</h3></div>
          <div className="route-sequence-line">{orderedPoints.length?orderedPoints.map((p,i)=><span key={`${p.id}-${i}`} className={i===0||i===orderedPoints.length-1?"route-node terminal":"route-node"}>{i+1}. {p.name}</span>):<span>Click Start → Stop → End markers to build the route.</span>}</div>
        </div>
      </Card>

      <Card title="Route Settings" eyebrow="BACKEND CONTRACT">
        <div className="detail-grid">
          <label><span className="field-label">Route Name</span><input className="text-input" value={routeName} onChange={e=>setRouteName(e.target.value)} placeholder="Example: Katihar City Route A" /></label>
          <label><span className="field-label">City</span><input className="text-input" value={city} onChange={e=>setCity(e.target.value)} /></label>
          <label><span className="field-label">City ID</span><input className="text-input" value={cityId} onChange={e=>setCityId(e.target.value)} /></label>
          <label><span className="field-label">Vehicle Type</span><input className="text-input" value={vehicleType} onChange={e=>setVehicleType(e.target.value)} placeholder="Optional" /></label>
          <label><span className="field-label">Service Type</span><input className="text-input" value={serviceType} onChange={e=>setServiceType(e.target.value)} placeholder="Optional" /></label>
          <label><span className="field-label">Matching Mode</span><input className="text-input" value={matchingMode} onChange={e=>setMatchingMode(e.target.value)} placeholder="Optional" /></label>
          <label><span className="field-label">Selection Mode</span><input className="text-input" value={selectionMode} onChange={e=>setSelectionMode(e.target.value)} placeholder="Optional" /></label>
          <label className="route-builder-active"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/><span>Activate after save</span></label>
        </div>
        <div className="route-builder-actions"><Button loading={saving} onClick={()=>void saveRoute(false)} disabled={loading||saving||!ROUTE_MUTATIONS_ENABLED}><Save size={15}/>Save Draft</Button><Button loading={saving} onClick={()=>void saveRoute(true)} disabled={loading||saving||!ROUTE_MUTATIONS_ENABLED}><Save size={15}/>Save & Activate</Button></div>
      </Card>
    </div>

    <div className="route-builder-lower-grid">
      <Card title="Ordered Stops" eyebrow="REORDER">
        {!stopIds.length?<EmptyState title="No intermediate stops" description="Choose Stop mode and click map markers to add intermediate points."/>:<div className="route-stop-list">{stopIds.map((id,index)=>{const p=locations.find(v=>v.id===id); if(!p) return null; return <div className="route-stop-row" key={id}><div><strong>{index+1}. {p.name}</strong><span>{p.city??""}{p.address?` · ${p.address}`:""}</span></div><div className="route-stop-actions"><button onClick={()=>moveStop(index,-1)} disabled={index===0}><ChevronUp size={15}/></button><button onClick={()=>moveStop(index,1)} disabled={index===stopIds.length-1}><ChevronDown size={15}/></button><button onClick={()=>removeStop(id)}><Trash2 size={15}/></button></div></div>;})}</div>}
      </Card>
      <Card title="Saved Routes" eyebrow="BACKEND ROUTES">
        {!routes.length&&loadError&&!hasLoaded?<EmptyState title="Saved routes unavailable" description="The first route request failed. Retry to load saved routes; no empty result was confirmed."/>:!routes.length?<EmptyState title="No saved routes" description="The last successful response contains no saved routes. Route creation remains disabled until its backend contract is verified."/>:<div className="route-saved-list">{routes.map((route:any)=><button className={`route-saved-row ${selectedRouteId===String(route.id??route.routeId)?"selected":""}`} key={String(route.id??route.routeId)} onClick={()=>loadRoute(route)}><div><strong>{String(route.name??route.id??"Route")}</strong><span>{String(route.city??route.cityName??"—")}</span></div><StatusPill value={routeStatus(route)}/></button>)}</div>}
      </Card>
    </div>

    <Card title="Location Master" eyebrow="MAP INPUTS">
      <div className="route-location-table"><div className="route-location-head"><span>Location</span><span>City</span><span>Coordinates</span><span>Action</span></div>{visibleLocations.slice(0,30).map(p=><div className="route-location-row" key={p.id}><div><strong>{p.name}</strong><small>{p.address??p.id}</small></div><span>{p.city??"—"}</span><span>{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</span><div style={{display:"flex",gap:6}}><button className="rx-btn rx-btn-secondary small" onClick={()=>{setMapMode("START");choosePoint(p.id);}}>Start</button><button className="rx-btn rx-btn-secondary small" onClick={()=>{setMapMode("STOP");addStop(p.id);}}>Stop</button><button className="rx-btn rx-btn-secondary small" onClick={()=>{setMapMode("END");choosePoint(p.id);}}>End</button></div></div>)}</div>
    </Card>
  </div>;
}
