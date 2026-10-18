import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Screen, PageScroll, BrandHeader, PageTitle, Card, Metric, PrimaryButton, OutlineButton, StatusPill, EmptyState } from '../../components/NakedUI';
import type { DriverScreen } from '../../navigation/routes';
import { useDriverRuntime } from '../../state/DriverRuntime';
import RideXMapCard from '../../../shared/ui/RideXMapCard';
import QRCode from 'react-native-qrcode-svg';

function bookingLeg(booking:any, driverId:string){const legs=Array.isArray(booking?.legs)?booking.legs:[];return legs.find((l:any)=>String(l?.driverId||'')===driverId && !['COMPLETED','CANCELLED'].includes(String(l?.status||'').toUpperCase()))||legs[0]||null;}
function Summary({booking}:{booking:any}){return <Card tone="softBlue"><Metric label="Pickup" value={booking?.pickupAddress || '—'}/><Metric label="Destination" value={booking?.dropAddress || '—'}/><Metric label="Fare" value={booking?.finalFare != null ? `₹${Number(booking.finalFare).toFixed(2)}` : '—'}/></Card>}
function RideMap({booking, gps}:{booking:any; gps:any}){
  const pickupLat=Number(booking?.pickupLatitude ?? booking?.pickupLat); const pickupLng=Number(booking?.pickupLongitude ?? booking?.pickupLng);
  const dropLat=Number(booking?.dropLatitude ?? booking?.dropLat); const dropLng=Number(booking?.dropLongitude ?? booking?.dropLng);
  const points=[
    Number.isFinite(pickupLat)&&Number.isFinite(pickupLng)?{id:'pickup',latitude:pickupLat,longitude:pickupLng,title:'Pickup',subtitle:String(booking?.pickupAddress||'Pickup location')}:null,
    Number.isFinite(dropLat)&&Number.isFinite(dropLng)?{id:'drop',latitude:dropLat,longitude:dropLng,title:'Destination',subtitle:String(booking?.dropAddress||'Destination')}:null,
    gps&&Number.isFinite(Number(gps.latitude))&&Number.isFinite(Number(gps.longitude))?{id:'driver',latitude:Number(gps.latitude),longitude:Number(gps.longitude),title:'Driver location',subtitle:'Current GPS'}:null,
  ].filter(Boolean) as Array<{id:string;latitude:number;longitude:number;title:string;subtitle:string}>;
  return <RideXMapCard title="Ride route" points={points} />;
}

export function AcceptedScreen({go}:{go:(s:DriverScreen)=>void}){const {activeRide,arrive,loading,gps}=useDriverRuntime();return <Screen><PageScroll><BrandHeader title="Accepted Ride" onBack={()=>go('home')}/><PageTitle title="Ride accepted" subtitle="The backend has assigned this ride to your Driver session."/><Summary booking={activeRide}/><RideMap booking={activeRide} gps={gps}/><Card><StatusPill label={String(activeRide?.status || 'DRIVER_ASSIGNED')} kind="success"/><PrimaryButton title={loading?'Updating…':'Mark Arrived'} disabled={loading} onPress={()=>void arrive()}/>{String(activeRide?.serviceSubtype||'').toUpperCase()==='EVENT_RIDE'?<OutlineButton title="Event Session" onPress={()=>go('eventSession')}/>:null}<OutlineButton title="Safety" onPress={()=>go('safety')}/></Card></PageScroll></Screen>}

export function ArrivedScreen({go}:{go:(s:DriverScreen)=>void}){
  const {activeRide,prepareQr,refreshActiveRide,verifyOtpRide,start,driverId,message,gps}=useDriverRuntime();
  const [otp,setOtp]=useState('');
  const [qr,setQr]=useState<any>(null);
  const leg=bookingLeg(activeRide,driverId);
  const otpVerified=Boolean(leg?.verificationOtpVerified);
  const qrVerified=Boolean(leg?.verificationQrVerified);
  const runQr=async()=>{const r=await prepareQr(); if(r){setQr(r); await refreshActiveRide();}};
  const verify=async()=>{const value=otp.replace(/\D/g,'').slice(0,4); if(value.length!==4)return; await verifyOtpRide(value); await refreshActiveRide();};
  return <Screen><PageScroll><BrandHeader title="Arrived" onBack={()=>go('home')}/><PageTitle title="At pickup" subtitle="Both backend verification factors are required before trip start."/><Summary booking={activeRide}/><RideMap booking={activeRide} gps={gps}/><Card>
    <StatusPill label={qrVerified?'QR verified':qr?'QR prepared':'QR pending'} kind={qrVerified||qr?'success':'warning'}/>
    {qr?<Text style={{marginTop:8,color:'#667085'}}>QR payload prepared. Show it to the customer for backend verification.</Text>:null}
    <PrimaryButton title="Generate QR" onPress={()=>void runQr()} disabled={qrVerified}/>{qr?.qrPayload ? <View style={{alignItems:'center',marginTop:12,padding:16,borderRadius:16,backgroundColor:'#fff'}}><QRCode value={String(qr.qrPayload)} size={220} backgroundColor="white" color="black"/><Text style={{marginTop:10,textAlign:'center',fontWeight:'800',color:'#101828'}}>Customer: scan this RideX QR</Text><Text style={{marginTop:4,textAlign:'center',fontSize:12,color:'#667085'}}>Backend-generated verification QR</Text></View> : null}<StatusPill label={otpVerified?'Ride OTP verified':'Ride OTP pending'} kind={otpVerified?'success':'warning'}/>
    <Text style={{marginTop:8,color:'#667085'}}>Ride leg: {leg?.id || '—'}</Text><Text style={{marginTop:8,fontWeight:'800'}}>4-digit Ride OTP</Text>
    <TextInput value={otp} onChangeText={(value)=>setOtp(value.replace(/\D/g,'').slice(0,4))} keyboardType="number-pad" inputMode="numeric" maxLength={4} placeholder="Enter OTP from customer" placeholderTextColor="#98A2B3" style={{marginTop:8,borderWidth:1,borderColor:'#D0D5DD',borderRadius:12,paddingHorizontal:14,paddingVertical:12,color:'#101828',fontSize:18,letterSpacing:4}}/>
    <PrimaryButton title={otpVerified?'OTP Verified':'Verify Ride OTP'} disabled={otpVerified || otp.length!==4} onPress={()=>void verify()} />
    <OutlineButton title="Refresh Verification Status" onPress={()=>void refreshActiveRide()} />
    <PrimaryButton title="Start Ride" disabled={!otpVerified || !qrVerified} onPress={()=>void start()}/>{message?<Text style={{marginTop:10,color:'#667085'}}>{message}</Text>:null}</Card></PageScroll></Screen>}

export function TripScreen({go}:{go:(s:DriverScreen)=>void}){const {activeRide,complete,runGps,gps}=useDriverRuntime();return <Screen><PageScroll><BrandHeader title="Trip" onBack={()=>go('home')}/><PageTitle title="Ride in progress" subtitle="Trip state remains backend-authoritative; GPS updates run while online."/><Summary booking={activeRide}/><RideMap booking={activeRide} gps={gps}/><Card><StatusPill label={String(activeRide?.status || 'IN_PROGRESS')} kind="success"/><PrimaryButton title="Refresh GPS" onPress={()=>void runGps?.()}/><PrimaryButton title="Complete Trip" onPress={()=>void complete()}/>{String(activeRide?.serviceSubtype||'').toUpperCase()==='EVENT_RIDE'?<OutlineButton title="Event Session" onPress={()=>go('eventSession')}/>:null}<OutlineButton title="Safety Center" onPress={()=>go('safety')}/></Card></PageScroll></Screen>}

export function CompletedScreen({go}:{go:(s:DriverScreen)=>void}){return <Screen><PageScroll><BrandHeader title="Completed" onBack={()=>go('home')}/><PageTitle title="Trip completed" subtitle="Completion results are refreshed from backend earnings after the operation."/><Card tone="softGreen"><StatusPill label="Backend completion confirmed" kind="success"/><Metric label="Driver earning" value="—"/><Metric label="Payment" value="—"/><Metric label="Distance" value="—"/></Card><PrimaryButton title="View Earnings" onPress={()=>go('earnings')}/><OutlineButton title="Back to Home" onPress={()=>go('home')}/></PageScroll></Screen>}
export function EventSessionScreen({go}:{go:(s:DriverScreen)=>void}){
  const {activeRide,gps,driverId,refreshActiveRide}=useDriverRuntime();
  const isEvent=String(activeRide?.serviceSubtype||'').toUpperCase()==='EVENT_RIDE';
  const leg=bookingLeg(activeRide,driverId);
  const stops=Array.isArray(activeRide?.eventBooking?.stops)?activeRide.eventBooking.stops:Array.isArray(activeRide?.eventStops)?activeRide.eventStops:[];
  return <Screen><PageScroll><BrandHeader title="Event Session" onBack={()=>go('home')}/><PageTitle title="Fixed-route Event Ride session" subtitle="The event route/session remains backend-controlled; the app never fabricates stop data."/>
    {!activeRide ? <EmptyState title="No active event ride" body="Start from an assigned event ride to open this workspace."/> : !isEvent ? <EmptyState title="Current ride is not an Event Ride" body="This workspace is reserved for bookings with serviceSubtype EVENT_RIDE."/> : <><Card tone="softBlue"><StatusPill label="EVENT_RIDE" kind="success"/><Metric label="Booking" value={String(activeRide.id||'—')}/><Metric label="Pickup" value={String(activeRide.pickupAddress||'—')}/><Metric label="Destination" value={String(activeRide.dropAddress||'—')}/><Metric label="Ride leg" value={String(leg?.id||'—')}/></Card><RideMap booking={activeRide} gps={gps}/><Card><Text style={{fontWeight:'900',fontSize:16,color:'#101828'}}>Published event stops</Text>{stops.length?stops.map((stop:any,i:number)=><View key={String(stop?.id||i)} style={{marginTop:8,padding:10,borderRadius:12,backgroundColor:'#F8FAFC'}}><Text style={{fontWeight:'800'}}>{i+1}. {String(stop?.name||stop?.address||`Stop ${i+1}`)}</Text></View>):<Text style={{marginTop:8,color:'#667085'}}>The current Driver booking contract does not include the event stop list. No stops are invented locally.</Text>}</Card><OutlineButton title="Refresh Event Session" onPress={()=>void refreshActiveRide()}/></>}<OutlineButton title="Back to Home" onPress={()=>go('home')}/></PageScroll></Screen>}
