import { useEffect, useMemo, useState } from "react";
import { CarFront, RefreshCw, Users, PackageOpen, Route, MapPinned } from "lucide-react";
import { request } from "../lib/api";
import { RIDEX_API } from "../lib/apiContract";
import { Button, Card, EmptyState, Notice, StatusPill } from "../components/ui";

type Vehicle = {
  code: string; categoryCode: string; categoryName: string; name: string;
  operationalVehicleType?: string; typeDescription?: string; speed?: string;
  seating?: string | null; payload?: string | null; range?: string | null;
  useCases?: string[]; goodsEligible?: boolean; defaultCapacity?: number;
  eligibleRideTypes?: string[]; sortOrder?: number;
};
const rideLabels: Record<string,string> = { CITY_RIDE:"Full Ride / City", SHARING_RIDE:"Share Ride / Sharing", INTERCITY_RIDE:"Connection Ride / InterCity" };
const serviceLabels: Record<string,string> = { LOGISTIC_PARCEL:"Logistic Parcel", LOGISTIC_GOODS:"Logistic Goods" };

export function VehicleCatalogPage(){
  const [vehicles,setVehicles]=useState<Vehicle[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [category,setCategory]=useState("ALL"); const [search,setSearch]=useState("");
  const load=async()=>{setLoading(true);setError("");try{const data:any=await request<any>(RIDEX_API.meta.vehicleCatalog);const rows=Array.isArray(data?.data)?data.data:Array.isArray(data?.categories)?data.categories.flatMap((g:any)=>g?.vehicles||[]):[];setVehicles(rows as Vehicle[]);}catch(e){setError(e instanceof Error?e.message:"Unable to load vehicle catalog");}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const categories=useMemo(()=>["ALL",...Array.from(new Set(vehicles.map(v=>v.categoryCode).filter(Boolean)))],[vehicles]);
  const filtered=useMemo(()=>vehicles.filter(v=>(category==="ALL"||v.categoryCode===category)&&(!search.trim()||JSON.stringify(v).toLowerCase().includes(search.trim().toLowerCase()))).sort((a,b)=>Number(a.sortOrder??0)-Number(b.sortOrder??0)),[vehicles,category,search]);
  return <div className="rx-page">
    <div className="rx-page-head"><div><div className="rx-eyebrow">DRIVERS & VEHICLES</div><h1>Vehicle Catalog</h1><p>Authoritative vehicle classes, specifications, capacity and ride/service eligibility used by RideX.</p></div><Button variant="secondary" loading={loading} onClick={()=>void load()}><RefreshCw size={15}/>Refresh</Button></div>
    <Notice>Vehicle catalog is read from RideX metadata. Driver availability is a separate location/runtime decision; this page does not mark a model available unless the backend reports it.</Notice>
    {error?<Notice tone={vehicles.length ? "warning" : "danger"}>{error}{vehicles.length ? " Showing the last successful catalog response; it may be stale." : " No successful catalog response has been loaded."}</Notice>:null}
    <div className="rx-stat-grid"><Card><div className="rx-stat"><CarFront size={18}/><span>{vehicles.length}</span><small>Models</small></div></Card><Card><div className="rx-stat"><Users size={18}/><span>{vehicles.filter(v=>v.categoryCode?.startsWith("PASSENGER")).length}</span><small>Passenger models</small></div></Card><Card><div className="rx-stat"><PackageOpen size={18}/><span>{vehicles.filter(v=>v.categoryCode==="CARGO_DELIVERY").length}</span><small>Category 3 cargo</small></div></Card><Card><div className="rx-stat"><Route size={18}/><span>{vehicles.filter(v=>v.eligibleRideTypes?.includes("INTERCITY_RIDE")).length}</span><small>InterCity eligible</small></div></Card></div>
    <Card title="Catalog filters" eyebrow="MASTER DATA"><div className="rx-toolbar"><label className="rx-search"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search model, code or specification"/></label><div className="rx-filter-row"><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></div></div></Card>
    {!loading && !error && !filtered.length ? <EmptyState title="No vehicle models match" description="The catalog loaded successfully, but no models match the current filters."/> : null}
    {!loading && error && !vehicles.length ? <EmptyState title="Vehicle catalog unavailable" description="The API request failed, so the page cannot conclude that the catalog is empty. Retry after checking connectivity."/> : null}
    <div className="rx-card-grid">{filtered.map(v=><Card key={v.code}><div className="rx-detail-head"><div><h3>{v.name}</h3><p>{v.categoryName}</p></div><StatusPill value={v.categoryCode} /></div><div className="rx-meta-grid"><div><strong>Code</strong><span>{v.code}</span></div><div><strong>Type</strong><span>{v.typeDescription||v.operationalVehicleType||"—"}</span></div><div><strong>Speed</strong><span>{v.speed||"—"}</span></div><div><strong>Capacity</strong><span>{v.defaultCapacity??"—"}{v.seating?` · ${v.seating}`:""}</span></div><div><strong>Range</strong><span>{v.range||"—"}</span></div><div><strong>Payload</strong><span>{v.payload||"—"}</span></div></div><div className="rx-chip-list">{(v.eligibleRideTypes||[]).map(t=><span className="rx-chip" key={t}>{rideLabels[t]||serviceLabels[t]||t}</span>)}{v.goodsEligible?<span className="rx-chip">Goods eligible</span>:null}</div></Card>)}</div>
  </div>
}
