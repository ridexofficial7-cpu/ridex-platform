import React, { useState } from 'react';
import { Linking, Text } from 'react-native';
import { Screen, PageScroll, BrandHeader, PageTitle, Card, OutlineButton, PrimaryButton, Section, StatusPill } from '../../components/NakedUI';
import ScreenStateNotice from '../../components/ScreenStateNotice';
import type { DriverScreen } from '../../navigation/routes';
import { useDriverRuntime } from '../../state/DriverRuntime';

function verificationBadgeKind(value:any):'success'|'warning'|'danger'{
 const status=String(value||'').toUpperCase();
 if(/(^|_)(PENDING|IN_REVIEW|REQUIRES_ACTION)(_|$)/.test(status)||/^(NOT_|UNVERIFIED)/.test(status))return 'warning';
 if(/^(REJECTED|FAILED|EXPIRED|SUSPENDED)(_|$)/.test(status))return 'danger';
 if(/^(APPROVED|VERIFIED|ACTIVE|ACCEPTED)(_|$)/.test(status)||/_(APPROVED|VERIFIED|ACTIVE|ACCEPTED)$/.test(status))return 'success';
 return 'warning';
}

export function ProfileScreen({go}:{go:(s:DriverScreen)=>void}){const {driver,online,realtimeConnected,gps,unreadCount,driverId,refreshDriver}=useDriverRuntime();const [refreshing,setRefreshing]=useState(false);const [notice,setNotice]=useState('');const refresh=async()=>{if(refreshing)return;setRefreshing(true);setNotice('');try{const result=await refreshDriver(driverId);if(!result?.driver)setNotice('Driver profile could not be confirmed by the backend. Check your connection and retry.');}catch{setNotice('Could not refresh the driver profile. Check your connection and retry.');}finally{setRefreshing(false);}};return <Screen><PageScroll><BrandHeader title="Driver Profile" onBack={()=>go('home')}/><PageTitle title={driver?.fullName||'Driver'} subtitle="Backend-loaded account and operational profile."/>{notice?<ScreenStateNotice kind="failure" message={notice}/>:null}<OutlineButton title={refreshing?'Refreshing profile…':'Refresh Profile'} disabled={refreshing} onPress={()=>void refresh()}/><Card><StatusPill label={online?'ONLINE':'OFFLINE'} kind={online?'success':'neutral'}/><Text style={{marginTop:9,fontSize:20,fontWeight:'900'}}>{String(driver?.fullName||'Not available')}</Text><Text style={{marginTop:4,color:'#667085'}}>Mobile: {String(driver?.mobile||driver?.user?.mobile||'Not available')}</Text><Text style={{marginTop:4,color:'#667085'}}>Verification status</Text><StatusPill label={String(driver?.verificationStatus||'PENDING')} kind={verificationBadgeKind(driver?.verificationStatus)}/><Text style={{marginTop:4,color:'#667085'}}>Realtime: {realtimeConnected?'Connected':'Disconnected'}</Text><Text style={{marginTop:4,color:'#667085'}}>GPS: {gps?'Available':'Not available'}</Text></Card><Section title="Account & operations"/><OutlineButton title="Application Status" onPress={()=>go('onboardingStatus')}/><OutlineButton title="KYC & Vehicle" onPress={()=>go('kyc')}/><OutlineButton title="Working Routes" onPress={()=>go('workingRoutes')}/><OutlineButton title="Bank & Payout" onPress={()=>go('payout')}/><OutlineButton title={`Notifications${unreadCount?` (${unreadCount})`:''}`} onPress={()=>go('notifications')}/><OutlineButton title="Help & Support" onPress={()=>go('messages')}/><OutlineButton title="Safety" onPress={()=>go('safety')}/><OutlineButton title="Settings & Security" onPress={()=>go('security')}/></PageScroll></Screen>}

export function SecurityScreen({go}:{go:(s:DriverScreen)=>void}){
 const {driverId,realtimeConnected,online,gps,logout}=useDriverRuntime();
 const [loggingOut,setLoggingOut]=useState(false);const [notice,setNotice]=useState('');
 const openSettings=async()=>{setNotice('');try{await Linking.openSettings();}catch{setNotice('Device settings could not be opened automatically. Open your phone Settings and adjust app permissions there.');}};
 const signOut=async()=>{if(loggingOut)return;setLoggingOut(true);setNotice('');try{await logout();}catch{setNotice('Logout could not be completed cleanly. Check your connection and retry.');}finally{setLoggingOut(false);}};
 return <Screen><PageScroll><BrandHeader title="Security" onBack={()=>go('profile')}/><PageTitle title="Security & settings" subtitle="Authentication and operational security remain backend-authoritative."/>
 {notice?<ScreenStateNotice kind="failure" message={notice}/>:null}
 <Card><Section title="Session"/><Text style={{color:'#667085'}}>Driver ID: {driverId||'—'}</Text><Text style={{marginTop:5,color:'#667085'}}>Online: {online?'YES':'NO'}</Text><Text style={{marginTop:5,color:'#667085'}}>Realtime: {realtimeConnected?'CONNECTED':'DISCONNECTED'}</Text><Text style={{marginTop:5,color:'#667085'}}>Current GPS: {gps?'AVAILABLE':'NOT AVAILABLE'}</Text><PrimaryButton title={loggingOut?'Signing out…':'Log Out'} disabled={loggingOut} onPress={()=>void signOut()}/></Card>
 <Card><Section title="Device & privacy"/><Text style={{color:'#667085',lineHeight:19}}>Manage RideX Driver location and notification permissions in your device settings. Changes may affect live location updates and alerts.</Text><OutlineButton title="Open App Settings" onPress={()=>void openSettings()}/></Card>
 </PageScroll></Screen>}
