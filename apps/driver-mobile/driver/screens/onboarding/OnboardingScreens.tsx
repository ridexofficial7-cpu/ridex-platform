import { Pressable } from 'react-native';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { Screen, PageScroll, BrandHeader, PageTitle, Card, PrimaryButton, OutlineButton, Section, StatusPill, EmptyState, Field, Metric } from '../../components/NakedUI';
import ScreenStateNotice from '../../components/ScreenStateNotice';
import type { DriverScreen } from '../../navigation/routes';
import { useDriverRuntime } from '../../state/DriverRuntime';
import * as DocumentPicker from 'expo-document-picker';
import RideXMapCard from '../../../shared/ui/RideXMapCard';

function verificationBadgeKind(value:any):'success'|'warning'|'danger'{
 const status=String(value||'').toUpperCase();
 if(/(^|_)(PENDING|IN_REVIEW|REQUIRES_ACTION)(_|$)/.test(status)||/^(NOT_|UNVERIFIED)/.test(status))return 'warning';
 if(/^(REJECTED|FAILED|EXPIRED|SUSPENDED)(_|$)/.test(status))return 'danger';
 if(/^(APPROVED|VERIFIED|ACTIVE|ACCEPTED)(_|$)/.test(status)||/_(APPROVED|VERIFIED|ACTIVE|ACCEPTED)$/.test(status))return 'success';
 return 'warning';
}

export function OnboardingStatusScreen({go}:{go:(s:DriverScreen)=>void}){
 const {onboarding,refreshDriver,driverId,submitOnboarding,loading,message,setMessage}=useDriverRuntime();
 const [refreshing,setRefreshing]=useState(false); const [submitting,setSubmitting]=useState(false); const [localNotice,setLocalNotice]=useState(''); const [localNoticeKind,setLocalNoticeKind]=useState<'failure'|'success'>('failure');
 const status=String(onboarding?.applicationStatus||onboarding?.status||'PENDING');
 const verificationStatus=String(onboarding?.verificationStatus||onboarding?.driverVerificationStatus||'PENDING');
 const approved=[onboarding?.verificationStatus,onboarding?.driverVerificationStatus,onboarding?.applicationStatus,onboarding?.status,onboarding?.driverStatus].some((value:any)=>String(value||'').toUpperCase()==='APPROVED');
 const canSubmit=Boolean(onboarding?.canSubmit ?? onboarding?.eligibleToSubmit);
 const refresh=async()=>{if(refreshing)return;setRefreshing(true);setLocalNotice('');try{const result=await refreshDriver(driverId);if(!result?.onboarding){setLocalNoticeKind('failure');setLocalNotice('Application status could not be confirmed by the backend. Check your connection and retry.');}}catch{setLocalNoticeKind('failure');setLocalNotice('Could not refresh application status. Check your connection and try again.');}finally{setRefreshing(false);}};
 const submit=async()=>{if(submitting||!driverId)return;setSubmitting(true);setLocalNotice('');try{const result=await submitOnboarding(driverId);if(!result?.response?.ok||result?.data?.success===false){setLocalNoticeKind('failure');setLocalNotice(String(result?.data?.message||'Application was not submitted. Complete required details and try again.'));return;}setLocalNoticeKind('success');setLocalNotice(String(result?.data?.message||'Application submission received. Refreshing status…'));const refreshed=await refreshDriver(driverId);if(!refreshed?.onboarding){setLocalNoticeKind('failure');setLocalNotice('Application submission was received, but the latest review status could not be confirmed. Refresh status before relying on it.');}}catch{setLocalNoticeKind('failure');setLocalNotice('Unable to submit application due to a network error. Your status has not been confirmed.');}finally{setSubmitting(false);}};
 return <Screen><PageScroll><BrandHeader title="Application Status" onBack={()=>go('profile')}/><PageTitle title="Driver onboarding" subtitle="Application readiness and review status are read from the backend."/>
 {localNotice?<ScreenStateNotice kind={localNoticeKind} message={localNotice}/>:null}
 {message?<ScreenStateNotice kind="failure" message={message} actionLabel="Dismiss" onAction={()=>setMessage('')}/>:null}
 <Card><Section title="Application"/><StatusPill label={status} kind={verificationBadgeKind(status)}/><Text style={{marginTop:8,color:'#667085'}}>Verification status: {verificationStatus}</Text><Text style={{marginTop:4,color:'#667085'}}>Driver status: {String(onboarding?.driverStatus||'—')}</Text><Text style={{marginTop:4,color:'#667085'}}>Documents: {Number(onboarding?.uploadedDocuments??onboarding?.documentCount??0)}</Text><Text style={{marginTop:4,color:'#667085'}}>Vehicles: {Number(onboarding?.vehicleCount??onboarding?.vehicles?.length??0)}</Text><Text style={{marginTop:4,color:'#667085'}}>Payout: {onboarding?.payoutReady?'Ready':'Pending'}</Text>
 {onboarding?.reviewMessage||onboarding?.rejectionReason?<Text style={{marginTop:8,color:'#B42318'}}>Review note: {String(onboarding?.reviewMessage||onboarding?.rejectionReason)}</Text>:null}
 <PrimaryButton title={refreshing?'Refreshing…':'Refresh status'} disabled={refreshing||submitting||loading} onPress={()=>void refresh()}/><PrimaryButton title="Open KYC & Vehicle" disabled={submitting} onPress={()=>go('kyc')}/><OutlineButton title="Open Payout Details" disabled={submitting} onPress={()=>go('payout')}/>{canSubmit&&!approved?<PrimaryButton title={submitting?'Submitting application…':'Review & Submit Application'} disabled={submitting||refreshing||loading} onPress={()=>void submit()}/>:null}{approved?<PrimaryButton title="Go to Driver Home" onPress={()=>go('home')}/>:null}</Card></PageScroll></Screen>}

export function KycScreen({go}:{go:(s:DriverScreen)=>void}){
 const {driverId,driver,vehicleCatalog,createDocumentSlot,uploadDocument,createVehicle,refreshDriver,message,setMessage}=useDriverRuntime();
 const docs=Array.isArray(driver?.documents)?driver.documents:[];const vehicles=Array.isArray(driver?.vehicles)?driver.vehicles:[];
 const [vehicleNumber,setVehicleNumber]=useState('');const [capacity,setCapacity]=useState('1');const [catalogCode,setCatalogCode]=useState(String(vehicleCatalog?.[0]?.code||''));
 const [uploadingId,setUploadingId]=useState('');const [creatingSlot,setCreatingSlot]=useState(false);const [addingVehicle,setAddingVehicle]=useState(false);const [notice,setNotice]=useState('');const [noticeKind,setNoticeKind]=useState<'failure'|'success'>('failure');
 const selectedCatalog:any=vehicleCatalog?.find((c:any)=>String(c.code)===catalogCode)||vehicleCatalog?.[0];
 const fail=(text:string)=>{setNotice(text);setNoticeKind('failure');};
 const pick=async(doc:any)=>{
  if(uploadingId||!driverId)return;setUploadingId(String(doc.id));setNotice('');
  try{
   const result=await DocumentPicker.getDocumentAsync({type:['application/pdf','image/jpeg','image/png'],copyToCacheDirectory:true,multiple:false});
   if(result.canceled||!result.assets?.[0])return;
   const a=result.assets[0];const mime=String(a.mimeType||'').toLowerCase();
   const pickedFileName=String(a.name||'');
   const extension=pickedFileName.includes('.')?pickedFileName.split('.').pop()?.toLowerCase()||'':'';
   const allowedMimes=['application/pdf','image/jpeg','image/png'];
   const allowedExtensions=['pdf','jpg','jpeg','png'];
   if(a.size!=null&&a.size>10*1024*1024){fail('File is larger than 10 MB. Choose a smaller PDF, JPG or PNG.');return;}
   if(mime&&!allowedMimes.includes(mime)&&mime!=='application/octet-stream'){fail('Unsupported file type. Choose a PDF, JPG or PNG document.');return;}
   if(extension&&!allowedExtensions.includes(extension)){fail('File extension is not supported. Choose a PDF, JPG or PNG document.');return;}
   if((!mime||mime==='application/octet-stream')&&!allowedExtensions.includes(extension)){fail('The selected file type could not be verified. Choose a PDF, JPG or PNG document.');return;}
   const res=await fetch(a.uri);if(!res.ok)throw new Error('Unable to read selected file');const blob=await res.blob();if(blob.size>10*1024*1024){fail('Selected file is larger than 10 MB. Choose a smaller PDF, JPG or PNG.');return;}
   const blobMime=String(blob.type||'').toLowerCase();
   if(blobMime&&!allowedMimes.includes(blobMime)&&blobMime!=='application/octet-stream'){fail('Selected file content type is not supported. Choose a PDF, JPG or PNG document.');return;}
   const extensionMime:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
   const effectiveMime=allowedMimes.includes(mime)?mime:allowedMimes.includes(blobMime)?blobMime:extensionMime[extension]||'';
   if(!effectiveMime){fail('The selected file type could not be verified. Choose a PDF, JPG or PNG document.');return;}
   const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Unable to read selected file'));reader.onload=()=>{const raw=String(reader.result||'');if(!raw.includes(',')){reject(new Error('Invalid file data'));return;}resolve(raw);};reader.readAsDataURL(blob);});
   const fallbackExtension=effectiveMime==='application/pdf'?'pdf':effectiveMime==='image/jpeg'?'jpg':effectiveMime==='image/png'?'png':extension;
   const fileName=String(a.name||`document.${fallbackExtension||'bin'}`);
   const uploaded=await uploadDocument(driverId,String(doc.id),fileName,effectiveMime||'application/octet-stream',base64);
   if(!uploaded?.response?.ok||uploaded?.data?.success===false){fail(String(uploaded?.data?.message||'Document upload failed. Check your connection and retry.'));return;}
   setNotice('Document uploaded. Refreshing verification status…');setNoticeKind('success');const refreshed=await refreshDriver(driverId);if(!refreshed?.driver){setNotice('Document upload succeeded, but the latest document status could not be confirmed. Refresh the KYC screen.');setNoticeKind('failure');}
  }catch(error){fail(error instanceof Error?error.message:'Document upload failed. Please retry.');}
  finally{setUploadingId('');}
 };
 const createSlot=async()=>{if(creatingSlot||!driverId)return;setCreatingSlot(true);setNotice('');try{const result=await createDocumentSlot(driverId,'AADHAAR');if(!result?.response?.ok||result?.data?.success===false){fail(String(result?.data?.message||'Could not create document slot.'));return;}setNotice('Document slot created. Refreshing documents…');setNoticeKind('success');const refreshed=await refreshDriver(driverId);if(!refreshed?.driver){setNotice('Document slot was created, but the latest document list could not be confirmed. Refresh the KYC screen.');setNoticeKind('failure');}}catch{fail('Could not create document slot due to a network error.');}finally{setCreatingSlot(false);}};
 const addVehicle=async()=>{if(addingVehicle||!driverId)return;const normalized=vehicleNumber.trim().toUpperCase();if(!/^(?:[A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{0,3}[ -]?[0-9]{1,4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/.test(normalized)){fail('Enter a valid vehicle registration number, for example BR-01-AB-1234 or 22BH1234AA.');return;}if(!selectedCatalog){fail('No vehicle catalog option is available. Refresh the app or contact support.');return;}setAddingVehicle(true);setNotice('');try{const result=await createVehicle(driverId,{catalogCode:String(selectedCatalog.code),vehicleType:String(selectedCatalog.operationalVehicleType||'E_RICKSHAW'),vehicleNumber:normalized,capacity:Number(selectedCatalog.defaultCapacity||capacity||1),goodsEligible:Boolean(selectedCatalog.goodsEligible)});if(!result?.response?.ok||result?.data?.success===false){fail(String(result?.data?.message||'Vehicle could not be added. Check the registration and try again.'));return;}setVehicleNumber('');setNotice('Vehicle saved. Refreshing verification status…');setNoticeKind('success');const refreshed=await refreshDriver(driverId);if(!refreshed?.driver){setNotice('Vehicle was saved, but the latest vehicle status could not be confirmed. Refresh the KYC screen.');setNoticeKind('failure');}}catch{fail('Vehicle could not be added due to a network error.');}finally{setAddingVehicle(false);}};
 return <Screen><PageScroll><BrandHeader title="KYC & Vehicle" onBack={()=>go('profile')}/><PageTitle title="Verification workspace" subtitle="Upload required documents and register a vehicle using backend-authorized endpoints."/>
 {notice?<ScreenStateNotice kind={noticeKind} message={notice}/>:null}{message?<ScreenStateNotice kind="failure" message={message} actionLabel="Dismiss" onAction={()=>setMessage('')}/>:null}
 <Card><Section title="Identity documents"/>{docs.length===0?<EmptyState title="No documents" body="Create a document slot if the backend requires one."/>:docs.map((d:any)=><Card key={String(d.id)}><Text style={{fontWeight:'900'}}>{String(d.documentType||'Document')}</Text><StatusPill label={String(d.status||d.reviewStatus||'PENDING')} kind={verificationBadgeKind(d.status||d.reviewStatus)}/>{d.reviewMessage||d.rejectionReason?<Text style={{marginTop:4,color:'#B42318'}}>{String(d.reviewMessage||d.rejectionReason)}</Text>:null}<PrimaryButton title={uploadingId===String(d.id)?'Uploading document…':'Upload document'} disabled={Boolean(uploadingId)||creatingSlot||addingVehicle} onPress={()=>void pick(d)}/></Card>)}<PrimaryButton title={creatingSlot?'Creating slot…':'Create Aadhaar document slot'} disabled={creatingSlot||Boolean(uploadingId)||addingVehicle} onPress={()=>void createSlot()}/><Text style={{marginTop:6,color:'#667085',fontSize:12}}>Accepted formats: PDF, JPG, PNG. Maximum file size: 10 MB.</Text></Card>
 <Card><Section title="Vehicle"/>{vehicles.length===0?<Text style={{color:'#667085'}}>No vehicle currently loaded.</Text>:vehicles.map((v:any)=><Card key={String(v.id)}><Text style={{fontWeight:'900'}}>{String(v.vehicleNumber||'Vehicle')}</Text><Text style={{marginTop:4,color:'#667085'}}>{String(v.vehicleType||'—')} • Capacity {String(v.capacity??'—')}</Text><StatusPill label={String(v.status||'PENDING')} kind={verificationBadgeKind(v.status)}/></Card>)}{vehicleCatalog.length>0?<Card tone="softBlue"><Section title="Backend vehicle catalog"/><Text style={{color:'#667085'}}>Select one authoritative catalog model. Capacity and goods eligibility are read-only from the catalog.</Text>{vehicleCatalog.map((c:any)=><Pressable key={String(c.code||c.id)} accessibilityRole="button" accessibilityLabel={`Select ${String(c.name||c.code||'vehicle type')}`} onPress={()=>{setCatalogCode(String(c.code));setCapacity(String(c.defaultCapacity||c.capacity||1));}}><Card tone={String(c.code)===String(selectedCatalog?.code)?'softGreen':'default'}><Text style={{fontWeight:'900'}}>{String(c.name||c.displayName||c.code||'Vehicle type')}</Text><Text style={{marginTop:4,color:'#667085'}}>Code: {String(c.code||'—')} • Category: {String(c.categoryName||c.category||c.vehicleCategory||'—')}</Text><Text style={{marginTop:4,color:'#667085'}}>Capacity: {String(c.defaultCapacity??c.capacity??'—')} • Goods: {Boolean(c.goodsEligible)?'YES':'NO'}</Text><Text style={{marginTop:4,color:'#667085'}}>Ride eligibility: {Array.isArray(c.eligibleRideTypes)?c.eligibleRideTypes.join(', '):'—'}</Text></Card></Pressable>)}</Card>:<EmptyState title="Vehicle catalog unavailable" body="Vehicle registration is disabled until the backend catalog loads."/>}<Field label="Vehicle Number" value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="BR-01-AB-1234 or 22BH1234AA" autoCapitalize="characters" autoCorrect={false}/><Field label="Catalog Capacity (read-only)" value={String(selectedCatalog?.defaultCapacity??selectedCatalog?.capacity??capacity)} onChangeText={()=>{}} placeholder="Catalog capacity" keyboardType="numeric"/><PrimaryButton title={addingVehicle?'Saving vehicle…':'Add Vehicle'} disabled={addingVehicle||Boolean(uploadingId)||creatingSlot||vehicleCatalog.length===0||!vehicleNumber.trim()} onPress={()=>void addVehicle()}/></Card><OutlineButton title="Back to Profile" disabled={addingVehicle||Boolean(uploadingId)||creatingSlot} onPress={()=>go('profile')}/></PageScroll></Screen>}

export function PayoutScreen({go}:{go:(s:DriverScreen)=>void}){
 const {payout,savePayout,refreshDriver,driverId,message,setMessage}=useDriverRuntime();
 const [holder,setHolder]=useState(String(payout?.accountHolderName||''));const [account,setAccount]=useState(String(payout?.accountNumber||''));const [ifsc,setIfsc]=useState(String(payout?.ifsc||''));const [bank,setBank]=useState(String(payout?.bankName||''));const [upi,setUpi]=useState(String(payout?.upiId||''));
 const [saving,setSaving]=useState(false);const [notice,setNotice]=useState('');const [noticeKind,setNoticeKind]=useState<'failure'|'success'>('failure');
 const save=async()=>{
  if(saving)return;setNotice('');
  const h=holder.trim(),a=account.trim(),code=ifsc.trim().toUpperCase(),b=bank.trim(),u=upi.trim();
  const bankStarted=Boolean(h||a||code||b);const bankComplete=Boolean(h&&a&&code&&b);
  if(bankStarted&&!bankComplete){setNotice('For bank transfer, enter account holder, account number, IFSC and bank name together.');return;}
  if(bankComplete&&(!/^[0-9]{8,18}$/.test(a))){setNotice('Account number must contain 8–18 digits. Remove spaces and special characters.');return;}
  if(bankComplete&&!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)){setNotice('Enter a valid IFSC code, for example SBIN0001234.');return;}
  if(u&&!/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(u)){setNotice('Enter a valid UPI ID, for example name@bank.');return;}
  if(!bankComplete&&!u){setNotice('Enter complete bank details or a UPI ID to configure payouts.');return;}
  if(!driverId){setNotice('Please sign in again before saving payout details.');return;}
  setSaving(true);setNotice('');
  try{const ok=await savePayout({accountHolderName:h,accountNumber:a,ifsc:code,bankName:b,upiId:u||undefined});if(!ok){setNotice('Payout details were not saved. Review the message and retry.');return;}await refreshDriver(driverId);setNotice('Payout details saved. Open Application Status and refresh to confirm the latest payout readiness.');setNoticeKind('success');}
  catch{setNotice('Could not confirm payout save because of a network error. Refresh status before retrying.');}
  finally{setSaving(false);}
 };
 return <Screen><PageScroll><BrandHeader title="Bank & Payout" onBack={()=>go('profile')}/><PageTitle title="Payout details" subtitle="Financial details are sent directly to the RideX backend. Use bank transfer details or a UPI ID."/>
 {notice?<ScreenStateNotice kind={noticeKind} message={notice}/>:null}{message?<ScreenStateNotice kind="failure" message={message} actionLabel="Dismiss" onAction={()=>setMessage('')}/>:null}
 <Card><StatusPill label={payout?'Profile loaded':'Not configured'} kind={payout?'success':'warning'}/><Section title="Bank transfer"/><Field label="Account Holder" value={holder} onChangeText={setHolder} placeholder="Account holder name"/><Field label="Account Number" value={account} onChangeText={setAccount} placeholder="8–18 digit account number" keyboardType="numeric" autoCapitalize="none" autoCorrect={false}/><Field label="IFSC" value={ifsc} onChangeText={setIfsc} placeholder="SBIN0001234" autoCapitalize="characters" autoCorrect={false}/><Field label="Bank" value={bank} onChangeText={setBank} placeholder="Bank name"/><Section title="UPI (optional if bank details provided)"/><Field label="UPI ID" value={upi} onChangeText={setUpi} placeholder="name@bank" autoCapitalize="none" autoCorrect={false}/><PrimaryButton title={saving?'Saving payout details…':'Save Payout Details'} disabled={saving} onPress={()=>void save()}/></Card><OutlineButton title="Back to Profile" disabled={saving} onPress={()=>go('profile')}/></PageScroll></Screen>}

export function WorkingRoutesScreen({go}:{go:(s:DriverScreen)=>void}){
 const {driver,driverId,refreshDriver}=useDriverRuntime();const [refreshing,setRefreshing]=useState(false);const [notice,setNotice]=useState('');
 const routes=Array.isArray(driver?.workingRoutes)?driver.workingRoutes:[];
 const points=routes.flatMap((route:any,index:number)=>{
  const result:Array<{id:string;latitude:number;longitude:number;title:string;subtitle:string}>=[];
  const startLat=route.startLatitude??route.startLat,startLng=route.startLongitude??route.startLng;
  const endLat=route.endLatitude??route.endLat,endLng=route.endLongitude??route.endLng;
  const valid=(lat:any,lng:any)=>lat!==null&&lat!==undefined&&lat!==''&&lng!==null&&lng!==undefined&&lng!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng))&&Number(lat)>=-90&&Number(lat)<=90&&Number(lng)>=-180&&Number(lng)<=180;
  if(valid(startLat,startLng))result.push({id:`route-${index}-start`,latitude:Number(startLat),longitude:Number(startLng),title:`${String(route.name||'Route')} Start`,subtitle:String(route.startAddress||'Start')});
  if(valid(endLat,endLng))result.push({id:`route-${index}-end`,latitude:Number(endLat),longitude:Number(endLng),title:`${String(route.name||'Route')} End`,subtitle:String(route.endAddress||'End')});
  return result;
 });
 const refresh=async()=>{if(refreshing)return;setRefreshing(true);setNotice('');try{const result=await refreshDriver(driverId);if(!result?.driver)setNotice('Driver profile refresh failed, so latest working routes could not be confirmed.');}catch{setNotice('Could not refresh working routes. Check your connection and retry.');}finally{setRefreshing(false);}};
 return <Screen><PageScroll><BrandHeader title="Working Routes" onBack={()=>go('profile')}/><PageTitle title="Approved working routes" subtitle="Only backend-returned routes are shown. Driver-side create is not fabricated because the verified source does not expose a Driver create endpoint."/>
 {notice?<ScreenStateNotice kind="failure" message={notice}/>:null}<Card><Metric label="Assigned" value={routes.length}/><Metric label="Rule" value="1–5 routes"/><Metric label="Source" value="Backend"/><OutlineButton title={refreshing?'Refreshing routes…':'Refresh routes'} disabled={refreshing} onPress={()=>void refresh()}/></Card>
 {points.length?<RideXMapCard title="Working Routes Map" points={points}/>:null}{routes.length===0?<EmptyState title="No route data" body="No working route is currently returned by the Driver profile."/>:routes.map((r:any)=><Card key={String(r.id)}><StatusPill label={String(r.status||'PENDING')}/><Text style={{marginTop:7,fontWeight:'900'}}>{String(r.name||'Working Route')}</Text><Text style={{marginTop:4,color:'#667085'}}>{String(r.startAddress||'Start')} → {String(r.endAddress||'End')}</Text><Text style={{marginTop:5,color:'#667085'}}>Sequence: {String(r.sequence??r.stopSequence??'—')} • Active: {r.active===false?'No':'Yes'}</Text></Card>)}<OutlineButton title="Back to Profile" disabled={refreshing} onPress={()=>go('profile')}/></PageScroll></Screen>}
