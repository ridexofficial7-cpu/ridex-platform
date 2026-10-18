import React from 'react';
import { SafeAreaView } from 'react-native';
import { COLORS } from './theme';
import type { DriverScreen } from './navigation/routes';
import { DriverRuntimeProvider, useDriverRuntime } from './state/DriverRuntime';
import { WelcomeScreen, LoginScreen, OtpScreen, RegistrationScreen } from './screens/auth/AuthScreens';
import { HomeScreen, ServiceModeScreen, RequestScreen } from './screens/home/HomeScreens';
import { OnboardingStatusScreen, KycScreen, PayoutScreen, WorkingRoutesScreen } from './screens/onboarding/OnboardingScreens';
import { AcceptedScreen, ArrivedScreen, TripScreen, CompletedScreen, EventSessionScreen } from './screens/ride/RideScreens';
import { EarningsScreen, WalletScreen, CashCollectionScreen } from './screens/earnings/EarningsScreens';
import HistoryScreen from './screens/history/HistoryScreen';
import { SafetyScreen, SosScreen } from './screens/safety/SafetyScreens';
import { NotificationsScreen, MessagesScreen } from './screens/communication/CommunicationScreens';
import { ProfileScreen, SecurityScreen } from './screens/profile/ProfileScreens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirstStartGuide from '../shared/ui/FirstStartGuide';
import UntouchableDisplayScreen from '../shared/ui/UntouchableDisplayScreen';
import { useEffect, useState } from 'react';

function ConnectedTree() {
  const { screen, setScreen, driverDisplayAssetSource } = useDriverRuntime();
  const go = (s: DriverScreen) => setScreen(s);
  switch (screen as DriverScreen) {
    case 'welcome': return <WelcomeScreen go={go}/>;
    case 'login': return <LoginScreen go={go}/>;
    case 'otp': return <OtpScreen go={go}/>;
    case 'registration': return <RegistrationScreen go={go}/>;
    case 'onboardingStatus': return <OnboardingStatusScreen go={go}/>;
    case 'home': return <HomeScreen go={go}/>;
    case 'serviceMode': return <ServiceModeScreen go={go}/>;
    case 'request': return <RequestScreen go={go}/>;
    case 'accepted': return <AcceptedScreen go={go}/>;
    case 'arrived': return <ArrivedScreen go={go}/>;
    case 'trip': return <TripScreen go={go}/>;
    case 'completed': return <CompletedScreen go={go}/>;
    case 'eventSession': return <EventSessionScreen go={go}/>;
    case 'history': return <HistoryScreen go={go}/>;
    case 'earnings': return <EarningsScreen go={go}/>;
    case 'wallet': return <WalletScreen go={go}/>;
    case 'cashCollection': return <CashCollectionScreen go={go}/>;
    case 'profile': return <ProfileScreen go={go}/>;
    case 'kyc': return <KycScreen go={go}/>;
    case 'payout': return <PayoutScreen go={go}/>;
    case 'workingRoutes': return <WorkingRoutesScreen go={go}/>;
    case 'safety': return <SafetyScreen go={go}/>;
    case 'sos': return <SosScreen go={go}/>;
    case 'notifications': return <NotificationsScreen go={go}/>;
    case 'messages': return <MessagesScreen go={go}/>;
    case 'security': return <SecurityScreen go={go}/>;
    case 'display': return <UntouchableDisplayScreen audience="Driver" onClose={() => go('home')} remoteAssetSource={driverDisplayAssetSource} />;
    default: return <WelcomeScreen go={go}/>;
  }
}

export default function App({ startAt = 'welcome' }: { startAt?: 'welcome' | 'login'; onBackToCustomer?: () => void } = {}) {
  const [guideState, setGuideState] = useState<"CHECKING" | "SHOW" | "HIDDEN">("CHECKING");
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem("ridex_driver_first_start_guide_v1").then((value) => {
      if (active) setGuideState(value === "DONE" ? "HIDDEN" : "SHOW");
    }).catch(() => { if (active) setGuideState("SHOW"); });
    return () => { active = false; };
  }, []);
  const closeGuide = async () => {
    try { await AsyncStorage.setItem("ridex_driver_first_start_guide_v1", "DONE"); } catch {}
    setGuideState("HIDDEN");
  };
  if (guideState === "CHECKING") return <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} />;
  if (guideState === "SHOW") return <FirstStartGuide audience="Driver" onClose={() => void closeGuide()} />;
  return <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}><DriverRuntimeProvider startAt={startAt}><ConnectedTree/></DriverRuntimeProvider></SafeAreaView>;
}
