import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRideXApiUrl, createRideXFetch } from "../../shared/api/client";
import { flattenVehicleCatalog, rideTypeLabel, type VehicleCatalogEntry } from "../../shared/vehicleCatalog";
import RideXPixelLoader from "../../shared/ui/RideXPixelLoader";

const API = getRideXApiUrl();
const ADMIN_TOKEN_KEY = "ridex_admin_auth_token_v1";
const adminFetch = createRideXFetch({ tokenKey: ADMIN_TOKEN_KEY, apiUrl: API });

type PanelName = "vehicleCatalog" | "gateway" | "availability";

type Props = { panel: PanelName; onMessage?: (message: string) => void };

function Card({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  return <View style={s.card}>{title ? <Text style={s.cardTitle}>{title}</Text> : null}{subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}{children}</View>;
}

function Chip({ children }: { children: React.ReactNode }) { return <View style={s.chip}><Text style={s.chipText}>{children}</Text></View>; }

async function json(url: string, init?: RequestInit) {
  const response = await adminFetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) throw new Error(String(data?.message || `Request failed (${response.status})`));
  return data;
}

export function OperationsCatalogPanel({ panel, onMessage }: Props) {
  if (panel === "vehicleCatalog") return <VehicleCatalogPanel onMessage={onMessage} />;
  if (panel === "gateway") return <GatewayPanel onMessage={onMessage} />;
  return <AvailabilityPanel onMessage={onMessage} />;
}

function VehicleCatalogPanel({ onMessage }: { onMessage?: (message: string) => void }) {
  const [rows, setRows] = useState<VehicleCatalogEntry[]>([]); const [loading,setLoading]=useState(false); const [category,setCategory]=useState("ALL");
  const load = useCallback(async()=>{setLoading(true);try{const data=await json('/meta/vehicle-catalog');setRows(flattenVehicleCatalog(data));}catch(e){onMessage?.(e instanceof Error?e.message:'Unable to load vehicle catalog');}finally{setLoading(false)}},[onMessage]);
  useEffect(()=>{void load()},[load]);
  const filtered=useMemo(()=>rows.filter(v=>category==='ALL'||v.categoryCode===category),[rows,category]);
  const categories=useMemo(()=>['ALL',...Array.from(new Set(rows.map(r=>r.categoryCode)))],[rows]);
  return <ScrollView contentContainerStyle={s.content}><Card title="Vehicle Catalog" subtitle="Canonical vehicle category, capacity and service eligibility."><View style={s.rowWrap}>{categories.map(c=><Pressable key={c} onPress={()=>setCategory(c)} style={[s.filter,c===category&&s.filterActive]}><Text style={[s.filterText,c===category&&s.filterTextActive]}>{c}</Text></Pressable>)}</View>{loading?<RideXPixelLoader label="Loading vehicle catalog…" subtitle="Syncing canonical catalog" variant="inline"/>:null}</Card>{filtered.map(v=><Card key={v.code}><Text style={s.title}>{v.name}</Text><Text style={s.muted}>{v.categoryName} • {v.operationalVehicleType}</Text><View style={s.grid}><Text style={s.item}>Capacity: {v.defaultCapacity}</Text><Text style={s.item}>Speed: {v.speed||'—'}</Text><Text style={s.item}>Seating: {v.seating||'—'}</Text><Text style={s.item}>Range: {v.range||'—'}</Text><Text style={s.item}>Payload: {v.payload||'—'}</Text><Text style={s.item}>Type: {v.typeDescription||'—'}</Text></View><View style={s.rowWrap}>{(v.eligibleRideTypes||[]).map((t)=><Chip key={t}>{rideTypeLabel(t as any) || t}</Chip>)}{v.goodsEligible?<Chip>Goods eligible</Chip>:null}</View></Card>)}</ScrollView>;
}

function GatewayPanel({ onMessage }: { onMessage?: (message: string) => void }) {
  const [rows,setRows]=useState<any[]>([]);
  const [selected,setSelected]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [assignment,setAssignment]=useState({assignedMobileNumber:'',deviceName:'',stateId:'',cityId:'',changeReason:''});
  const [controlState,setControlState]=useState('NORMAL');
  const [status,setStatus]=useState('UNKNOWN');
  const [approvalState,setApprovalState]=useState('PENDING');
  const [securityState,setSecurityState]=useState('UNKNOWN');
  const [providerState,setProviderState]=useState('UNKNOWN');
  const [changeReason,setChangeReason]=useState('');
  const load=useCallback(async()=>{setLoading(true);try{const d=await json('/admin/gateways');const list=Array.isArray(d?.data)?d.data:Array.isArray(d?.items)?d.items:Array.isArray(d?.records)?d.records:[];setRows(list);}catch(e){onMessage?.(e instanceof Error?e.message:'Gateway endpoint unavailable');setRows([]);}finally{setLoading(false)}},[onMessage]);
  useEffect(()=>{void load()},[load]);
  const pick=async(g:any)=>{setSelected(g);try{const id=encodeURIComponent(String(g?.gatewayId||g?.id||''));const d=await json(`/admin/gateways/${id}`);const detail=d?.data||d?.gateway||g;setSelected(detail);setAssignment({assignedMobileNumber:String(detail?.assignedMobileNumber||''),deviceName:String(detail?.deviceName||''),stateId:String(detail?.stateId||''),cityId:String(detail?.cityId||''),changeReason:''});setControlState(String(detail?.controlState||'NORMAL'));setStatus(String(detail?.status||'UNKNOWN'));setApprovalState(String(detail?.approvalState||'PENDING'));setSecurityState(String(detail?.securityState||'UNKNOWN'));setProviderState(String(detail?.providerState||'UNKNOWN'));}catch(e){onMessage?.(e instanceof Error?e.message:'Unable to load Gateway details');}};
  const saveAssignment=async()=>{if(!selected)return;setSaving(true);try{const id=encodeURIComponent(String(selected?.gatewayId||selected?.id||''));const d=await json(`/admin/gateways/${id}/assignment`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(assignment)});onMessage?.(String(d?.message||'Gateway assignment updated.'));await load();}catch(e){onMessage?.(e instanceof Error?e.message:'Unable to update Gateway assignment');}finally{setSaving(false)}};
  const saveControl=async()=>{if(!selected)return;setSaving(true);try{const id=encodeURIComponent(String(selected?.gatewayId||selected?.id||''));const d=await json(`/admin/gateways/${id}/control`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({controlState,changeReason})});onMessage?.(String(d?.message||'Gateway control updated.'));await load();}catch(e){onMessage?.(e instanceof Error?e.message:'Unable to update Gateway control');}finally{setSaving(false)}};
  const saveStatus=async()=>{if(!selected)return;setSaving(true);try{const id=encodeURIComponent(String(selected?.gatewayId||selected?.id||''));const d=await json(`/admin/gateways/${id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,approvalState,securityState,providerState,changeReason})});onMessage?.(String(d?.message||'Gateway status updated.'));await load();}catch(e){onMessage?.(e instanceof Error?e.message:'Unable to update Gateway status');}finally{setSaving(false)}};
  const options=(values:string[],value:string,setter:(v:string)=>void)=> <View style={s.rowWrap}>{values.map(v=><Pressable key={v} onPress={()=>setter(v)} style={[s.filter,v===value&&s.filterActive]}><Text style={[s.filterText,v===value&&s.filterTextActive]}>{v}</Text></Pressable>)}</View>;
  return <ScrollView contentContainerStyle={s.content}><Card title="Gateway Management" subtitle="Device identity, assignment, heartbeat and delivery health. All mutations remain backend-authorized and audited."><Pressable style={s.refresh} onPress={()=>void load()}><Text style={s.refreshText}>{loading?'Refreshing…':'Refresh'}</Text></Pressable></Card>{!rows.length&&!loading?<Card><Text style={s.muted}>No Gateway records are visible in the authorized scope.</Text><Text style={s.muted}>Source: /admin/gateways</Text></Card>:null}{rows.map((g:any,i:number)=><Pressable key={String(g.id||g.gatewayId||i)} onPress={()=>void pick(g)}><Card title={String(g.gatewayId||g.id||'Gateway')} subtitle={String(g.deviceName||g.assignedMobileNumber||'Unassigned')}><View style={s.grid}><Text style={s.item}>Device: {String(g.deviceId||'—')}</Text><Text style={s.item}>Installation: {String(g.installationId||'—')}</Text><Text style={s.item}>Assigned Mobile: {String(g.assignedMobileNumber||'—')}</Text><Text style={s.item}>Status: {String(g.status||'UNKNOWN')}</Text><Text style={s.item}>Control: {String(g.controlState||'NORMAL')}</Text><Text style={s.item}>Approval: {String(g.approvalState||'PENDING')}</Text><Text style={s.item}>Security: {String(g.securityState||'UNKNOWN')}</Text><Text style={s.item}>Provider: {String(g.providerState||'UNKNOWN')}</Text><Text style={s.item}>Heartbeat: {String(g.lastHeartbeatAt||'—')}</Text><Text style={s.item}>Queue: {String(g.queuePending??0)}</Text></View></Card></Pressable>)}{selected?<><Card title="Selected Gateway" subtitle={String(selected?.gatewayId||selected?.id||'Gateway')}><Text style={s.label}>Assignment</Text><TextInput value={assignment.assignedMobileNumber} onChangeText={v=>setAssignment(x=>({...x,assignedMobileNumber:v}))} placeholder="Assigned mobile" placeholderTextColor="#94A3B8" style={s.input}/><TextInput value={assignment.deviceName} onChangeText={v=>setAssignment(x=>({...x,deviceName:v}))} placeholder="Device name / mobile identity" placeholderTextColor="#94A3B8" style={s.input}/><TextInput value={assignment.stateId} onChangeText={v=>setAssignment(x=>({...x,stateId:v}))} placeholder="State ID" placeholderTextColor="#94A3B8" style={s.input}/><TextInput value={assignment.cityId} onChangeText={v=>setAssignment(x=>({...x,cityId:v}))} placeholder="City ID" placeholderTextColor="#94A3B8" style={s.input}/><TextInput value={assignment.changeReason} onChangeText={v=>setAssignment(x=>({...x,changeReason:v}))} placeholder="Change reason" placeholderTextColor="#94A3B8" style={s.input}/><Pressable style={s.primary} disabled={saving} onPress={()=>void saveAssignment()}><Text style={s.primaryText}>{saving?'Saving…':'Save Assignment'}</Text></Pressable></Card><Card title="Control State"><Text style={s.label}>Authoritative control state</Text>{options(['NORMAL','BLOCKED','MAINTENANCE'],controlState,setControlState)}<TextInput value={changeReason} onChangeText={setChangeReason} placeholder="Change reason" placeholderTextColor="#94A3B8" style={s.input}/><Pressable style={s.primary} disabled={saving} onPress={()=>void saveControl()}><Text style={s.primaryText}>{saving?'Saving…':'Save Control'}</Text></Pressable></Card><Card title="Operational Status"><Text style={s.label}>Status</Text>{options(['UNKNOWN','ONLINE','OFFLINE','ERROR','SUSPENDED'],status,setStatus)}<Text style={s.label}>Approval</Text>{options(['PENDING','APPROVED','REJECTED','SUSPENDED'],approvalState,setApprovalState)}<Text style={s.label}>Security</Text>{options(['UNKNOWN','VERIFIED','SECURITY_DRIFT','BLOCKED'],securityState,setSecurityState)}<Text style={s.label}>Provider</Text>{options(['UNKNOWN','CONNECTED','AUTH_REQUIRED','NETWORK_UNAVAILABLE','REJECTED','HTTP_ERROR'],providerState,setProviderState)}<Pressable style={s.primary} disabled={saving} onPress={()=>void saveStatus()}><Text style={s.primaryText}>{saving?'Saving…':'Save Status'}</Text></Pressable><Pressable style={s.refresh} onPress={()=>setSelected(null)}><Text style={s.refreshText}>Close details</Text></Pressable></Card></>:null}</ScrollView>;
}

function AvailabilityPanel({ onMessage }: { onMessage?: (message: string) => void }) {
  const [lat,setLat]=useState('');const [lng,setLng]=useState('');const [service,setService]=useState('PASSENGER');const [rideType,setRideType]=useState('CITY_RIDE');const [rows,setRows]=useState<any[]>([]);const [loading,setLoading]=useState(false);
  const check=async()=>{if(!lat.trim()||!lng.trim()){onMessage?.('Latitude and longitude are required.');return}setLoading(true);try{const q=new URLSearchParams({pickupLat:lat.trim(),pickupLng:lng.trim(),serviceType:service,rideType});const d=await json(`/admin/operations/availability?${q.toString()}`);setRows(Array.isArray(d?.data)?d.data:Array.isArray(d?.items)?d.items:Array.isArray(d?.options)?d.options:[]);}catch(e){setRows([]);onMessage?.(e instanceof Error?e.message:'Availability endpoint unavailable');}finally{setLoading(false)}};
  const rides = service==='PASSENGER' || service==='EVENT' ? ['CITY_RIDE','SHARING_RIDE','INTERCITY_RIDE'] : service==='PARCEL'?['LOGISTIC_PARCEL']:['LOGISTIC_GOODS'];
  return <ScrollView contentContainerStyle={s.content}><Card title="Location Availability" subtitle="Customer-visible eligibility = location + service + eligible vehicle + available driver."><Text style={s.label}>Latitude</Text><TextInputStub value={lat} onChangeText={setLat} placeholder="25.54"/><Text style={s.label}>Longitude</Text><TextInputStub value={lng} onChangeText={setLng} placeholder="86.12"/><View style={s.rowWrap}>{['PASSENGER','PARCEL','GOODS','EVENT'].map(x=><Pressable key={x} onPress={()=>{setService(x);setRideType(x==='PASSENGER'?'CITY_RIDE':x==='EVENT'?'CITY_RIDE':x==='PARCEL'?'LOGISTIC_PARCEL':'LOGISTIC_GOODS')}} style={[s.filter,x===service&&s.filterActive]}><Text style={[s.filterText,x===service&&s.filterTextActive]}>{x}</Text></Pressable>)}</View><View style={s.rowWrap}>{rides.map(x=><Pressable key={x} onPress={()=>setRideType(x)} style={[s.filter,x===rideType&&s.filterActive]}><Text style={[s.filterText,x===rideType&&s.filterTextActive]}>{x}</Text></Pressable>)}</View><Pressable style={s.primary} onPress={()=>void check()}><Text style={s.primaryText}>{loading?'Checking…':'Check Availability'}</Text></Pressable></Card>{rows.map((r:any,i)=><Card key={String(r.code||r.vehicleCode||r.driverId||i)} title={String(r.name||r.vehicleName||r.vehicleCode||r.code||'Eligible option')} subtitle={String(r.status||r.availability||'AVAILABLE')}><Text style={s.item}>Driver: {String(r.driverId||r.driverName||'—')}</Text><Text style={s.item}>Capacity: {String(r.capacity||r.defaultCapacity||'—')}</Text><Text style={s.item}>ETA: {String(r.etaMinutes??'—')} min</Text></Card>)}</ScrollView>;
}

function TextInputStub({value,onChangeText,placeholder}:{value:string;onChangeText:(v:string)=>void;placeholder?:string}){
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94A3B8" keyboardType="numbers-and-punctuation" style={s.input}/>;
}


const s=StyleSheet.create({
  content:{padding:16,gap:12,paddingBottom:48},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E9F2',borderRadius:16,padding:14,gap:8},cardTitle:{fontSize:17,fontWeight:'900',color:'#172033'},title:{fontSize:16,fontWeight:'900',color:'#172033'},muted:{color:'#697386',fontSize:13,lineHeight:19},label:{fontWeight:'800',color:'#334155',marginTop:4},input:{height:44,borderWidth:1,borderColor:'#D7DEEB',borderRadius:12,paddingHorizontal:12,color:'#172033'},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},item:{width:'47%',color:'#4B5563',fontSize:12},rowWrap:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{backgroundColor:'#FFF1F2',borderRadius:999,paddingHorizontal:10,paddingVertical:6},chipText:{fontSize:11,fontWeight:'800',color:'#BE123C'},filter:{borderWidth:1,borderColor:'#D7DEEB',borderRadius:999,paddingHorizontal:10,paddingVertical:7},filterActive:{backgroundColor:'#E11D48',borderColor:'#E11D48'},filterText:{fontSize:11,fontWeight:'800',color:'#475569'},filterTextActive:{color:'#fff'},primary:{backgroundColor:'#E11D48',borderRadius:12,paddingVertical:12,alignItems:'center',marginTop:6},primaryText:{color:'#fff',fontWeight:'900'},refresh:{alignSelf:'flex-start',backgroundColor:'#F1F5F9',paddingHorizontal:12,paddingVertical:8,borderRadius:10},refreshText:{fontWeight:'800',color:'#17304f'}
});
