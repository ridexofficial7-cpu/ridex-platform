import React, { useCallback, useMemo } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import {
  RideXMobileLocaleProvider as SharedRideXMobileLocaleProvider,
  useRideXLocale as useSharedRideXLocale,
  type RideXMobileLegacyPreference,
} from '../../../packages/localization/src/RideXMobileLocaleProvider';

export type RideXMobileLocale = 'en' | 'hi';
type TranslationParams = Record<string, string | number>;
type LocaleContextValue = {
  language: RideXMobileLocale;
  setLanguage: (language: RideXMobileLocale) => void;
  t: (key: string, fallback?: string, params?: TranslationParams) => string;
};

const DRIVER_LEGACY_PREFERENCE: RideXMobileLegacyPreference = {
  storageKey: 'ridex_mobile_language_v1',
  valueMap: { en: 'en-IN', hi: 'hi-IN' },
};

// This local dictionary keeps the Driver app runnable as a standalone ZIP. Keys not
// yet covered by the shared localization package safely use the screen's supplied fallback.
const HI: Record<string, string> = {
  'auth.driverWelcomeTitle': 'RideX के साथ ड्राइव करें',
  'auth.driverWelcomeSubtitle': 'RideX बैकएंड से जुड़ा आपका ड्राइवर कार्यक्षेत्र।',
  'auth.login': 'ड्राइवर लॉगिन',
  'auth.newDriverRegister': 'नए ड्राइवर हैं? रजिस्टर करें',
  'auth.welcomeBack': 'वापसी पर स्वागत है',
  'auth.password': 'पासवर्ड',
  'auth.signingIn': 'लॉगिन हो रहा है…',
  'auth.registerAsDriver': 'ड्राइवर के रूप में रजिस्टर करें',
  'auth.newDeviceVerification': 'नए डिवाइस का सत्यापन',
  'auth.verifyDevice': 'अपने डिवाइस का सत्यापन करें',
  'auth.enterOtp': 'OTP दर्ज करें',
  'auth.verifyOtp': 'सत्यापित करें और आगे बढ़ें',
  'auth.resendOtp': 'OTP फिर भेजें',
  'auth.driverRegistration': 'ड्राइवर रजिस्ट्रेशन',
  'auth.createDriverAccount': 'ड्राइवर अकाउंट बनाएँ',
  'auth.mobileNumber': 'मोबाइल नंबर',
  'auth.sendOtp': 'रजिस्ट्रेशन OTP भेजें',
  'auth.fullName': 'पूरा नाम',
  'auth.address': 'पता',
  'driverHome.title': 'ड्राइवर होम',
  'driverHome.today': 'आज',
  'driverHome.rides': 'राइड्स',
  'driverHome.vehicle': 'वाहन',
  'driverHome.online': 'ऑनलाइन',
  'driverHome.offline': 'ऑफलाइन',
  'driverHome.connected': 'कनेक्टेड',
  'driverHome.available': 'उपलब्ध',
  'driverHome.notAvailable': 'उपलब्ध नहीं',
  'driverHome.approved': 'स्वीकृत',
  'driverHome.pending': 'लंबित',
  'driver.goOnline': 'ऑनलाइन हों',
  'driver.goOffline': 'ऑफलाइन हों',
  'driverRequests.title': 'राइड अनुरोध',
  'driverRequests.refresh': 'अनुरोध रीफ़्रेश करें',
  'driverRequests.noLiveRequests': 'कोई लाइव अनुरोध नहीं',
  'driverRide.pickup': 'पिकअप',
  'driverRide.destination': 'गंतव्य',
  'driverRide.fare': 'किराया',
  'driverRide.acceptedRide': 'स्वीकृत राइड',
  'driverRide.markArrived': 'पिकअप स्थान पर पहुँचे',
  'driverRide.trip': 'यात्रा',
  'driverRide.completeTrip': 'यात्रा पूरी करें',
  'driverEarnings.title': 'कमाई',
  'driverEarnings.gross': 'कुल',
  'driverEarnings.commission': 'कमीशन',
  'driverEarnings.net': 'शुद्ध कमाई',
  'driverEarnings.refresh': 'कमाई रीफ़्रेश करें',
  'driverHistory.title': 'राइड इतिहास',
};

function interpolate(value: string, params?: TranslationParams) {
  if (!params) return value;
  return value.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

export function RideXMobileLocaleProvider({ children }: { children: React.ReactNode }) {
  return (
    <SharedRideXMobileLocaleProvider legacyPreference={DRIVER_LEGACY_PREFERENCE}>
      {children}
    </SharedRideXMobileLocaleProvider>
  );
}

export function useRideXLocale(): LocaleContextValue {
  const { locale, setLocale } = useSharedRideXLocale();
  const language: RideXMobileLocale = locale === 'hi-IN' ? 'hi' : 'en';
  const setLanguage = useCallback(
    (next: RideXMobileLocale) => setLocale(next === 'hi' ? 'hi-IN' : 'en-IN'),
    [setLocale],
  );
  const t = useCallback((key: string, fallback = key, params?: TranslationParams) => {
    const value = language === 'hi' ? (HI[key] || fallback) : fallback;
    return interpolate(value, params);
  }, [language]);
  return useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
}

export function RideXLanguageToggle() {
  const { language, setLanguage } = useRideXLocale();
  const next = language === 'en' ? 'hi' : 'en';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Switch language to ${next === 'hi' ? 'Hindi' : 'English'}`} onPress={() => setLanguage(next)} style={styles.toggle}>
      <Text style={styles.toggleText}>{language === 'en' ? 'हिन्दी' : 'English'}</Text>
    </Pressable>
  );
}

export default RideXMobileLocaleProvider;

const styles = StyleSheet.create({
  toggle: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#D92D20', backgroundColor: '#FFFFFF' },
  toggleText: { color: '#B42318', fontSize: 13, fontWeight: '800' },
});
