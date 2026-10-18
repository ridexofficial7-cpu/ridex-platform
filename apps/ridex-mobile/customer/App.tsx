import type { CustomerScreen } from "../navigation/routes";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Image,
  Linking,
  Pressable,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as RNStatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { getSecureToken, setSecureToken, removeSecureToken } from "../shared/security/secureTokenStorage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { CameraView, useCameraPermissions } from "expo-camera";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createRideXFetch, getRideXApiUrl } from "../shared/api/client";
import { registerRideXPushToken } from "../pushNotifications";
import { startRideXPushLifecycle } from "../shared/notifications/lifecycle";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, MapType } from "react-native-maps";
import { openRideXEventStream, type RideXStreamEvent } from "../shared/realtime/client";
import { CUSTOMER_ASSETS } from "../shared/assets";
import { chooseCustomerDisplayAsset, chooseCustomerHomeAsset, makeRideXRemoteImageSource, type RideXRemoteAsset } from "../shared/assets/remote";
import { getCachedRideXAssetManifest, syncRideXAssetCache } from "../shared/assets/cache";
import EventSessionScreen from "./EventSessionScreen";
import { RIDEX_EVENT_API, RIDEX_EVENT_RIDE_TYPE, RIDEX_EVENT_SERVICE_TYPE } from "../shared/events/contracts";
import RideXMotionSurface from "../shared/ui/RideXMotionSurface";
import RideXMarkdown from "../shared/ui/RideXMarkdown";
import FirstStartGuide from "../shared/ui/FirstStartGuide";
import UntouchableDisplayScreen from "../shared/ui/UntouchableDisplayScreen";
import { flattenVehicleCatalog, eligiblePassengerVehicles, eligibleEventVehicles, eligibleLogisticVehicles, maxPassengerCount, rideTypeLabel, type VehicleCatalogEntry } from "../shared/vehicleCatalog";




type CustomerIconName = Extract<keyof typeof CUSTOMER_ASSETS.icons, string>;

const DEFAULT_ICON_GLYPHS: Record<string, string> = {
  menu: "☰", back: "‹", close: "×", next: "›", chevron_right: "›", chevron_down: "⌄",
  home: "⌂", history: "◷", ride: "↗", search: "⌕", map: "◎", recenter: "⊙", layers: "▱",
  notification: "♧", wallet: "▣", settings: "⚙", pickup: "●", profile: "◉", passengers: "♙",
  shared: "⇄", parcel: "□", parcelSet: "▤", truck: "▰", promo: "%", rating: "★", rebook: "↻",
  receipt: "▤", route: "⌁", schedule: "◷", clock: "◷", cash: "₹", upi: "₹", support: "?",
  callback: "☎", camera: "◎", email: "✉", emergencyCall: "☎", emergencyContact: "☏", faq: "?",
  gallery: "▦", liveChat: "◌", liveLocation: "⊙", report: "⚑", safety: "✓", security: "▣", sos: "SOS",
  headset: "♫", verified: "✓", whatsapp: "◉", language: "文", edit: "✎", logout: "⇥", otp: "•",
  phone: "☎", profileCamera: "◎", profileFallback: "◉", rewards: "★", settingsProfile: "⚙", wallet2: "▣",
  homeSaved: "⌂", workSaved: "▦", rupee: "₹", qrScanner: "▦", bookingConfirmed: "✓",
};

function AssetIcon({name,size=24}:{name:string;size?:number}) {
  const source = CUSTOMER_ASSETS.icons[name as CustomerIconName];
  if (source) {
    return <Image source={source} style={{ width:size, height:size }} resizeMode="contain" />;
  }
  return <Text accessible={false} style={{ width:size, height:size, fontSize:size * 0.8, lineHeight:size, textAlign:"center", color:"#24313B" }}>{DEFAULT_ICON_GLYPHS[name] || "•"}</Text>;
}

function LegacyIcon({glyph, size=24}: {glyph:string; size?:number}) {
  return <AssetIcon name={glyph} size={size} />;
}

const API = getRideXApiUrl();

const GALLERY_STORAGE_KEY = "ridex_customer_gallery_v1";
const EMERGENCY_CONTACT_STORAGE_KEY = "ridex_customer_emergency_contact_v1";
const CUSTOMER_SESSION_STORAGE_KEY = "ridex_customer_session_v2";
const CUSTOMER_PROFILE_LOCAL_KEY_PREFIX = "ridex_customer_profile_local_v1_";
const CUSTOMER_SUBSCRIPTION_LOCAL_KEY_PREFIX = "ridex_customer_subscription_v1_";
const CUSTOMER_INSURANCE_DEMO_KEY_PREFIX = "ridex_customer_insurance_demo_v1_";
const RIDEX_TEST_MODE = String(process.env.EXPO_PUBLIC_RIDEX_TEST_MODE ?? "false").toLowerCase() === "true";
const CUSTOMER_AUTH_TOKEN_KEY = "ridex_customer_auth_token_v1";
const TIMEZONE = "Asia/Kolkata";
const CUSTOMER_LOGIN_PURPOSE = "CUSTOMER.AUTH.LOGIN";

const ridexFetch = createRideXFetch({ tokenKey: CUSTOMER_AUTH_TOKEN_KEY, apiUrl: API });

/**
 * RideX integration contract
 * - Customer, Driver and Admin apps talk only to the RideX backend.
 * - Production/local API URL can be changed without editing this file:
 *   Expo: EXPO_PUBLIC_API_URL
 * - Optional integrations stay non-blocking. Missing provider URLs/keys do
 *   not prevent the core Customer app from starting.
 */
const RIDEX_OPTIONAL_CONFIG = {
  routingUrl: process.env.EXPO_PUBLIC_ROUTING_URL || "",
  mapsKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || "",
  notificationsUrl: process.env.EXPO_PUBLIC_NOTIFICATIONS_URL || "",
  supportPhone: process.env.EXPO_PUBLIC_SUPPORT_PHONE || "",
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "",
  whatsappPhone: process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || "",
};

// Android edge-to-edge devices can draw app content underneath the system
// status/navigation bars. Keep the existing layouts intact, but reserve the
// system-safe space so headers, maps and bottom actions are never covered.
const ANDROID_TOP_INSET =
  Platform.OS === "android" ? RNStatusBar.currentHeight ?? 24 : 0;
const ANDROID_BOTTOM_INSET = Platform.OS === "android" ? 32 : 0;

type Screen = CustomerScreen;

type RideType =
  | "CITY_RIDE"
  | "SHARING_RIDE"
  | "INTERCITY_RIDE";

type SharedRoutePoint = {
  id: string;
  sequence: number;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  active?: boolean;
};

type SharedRoute = {
  id: string;
  name: string;
  city?: string | null;
  cityZoneId?: string | null;
  active?: boolean;
  selectionMode?: string | null;
  points: SharedRoutePoint[];
};

type PaymentMethod = "CASH" | "UPI" | "WALLET";
type VehicleType = "E_RICKSHAW" | "PICKUP_TRUCK";
type BookingMode = "RIDE" | "GOODS" | "EVENT";
type GoodsSize = "SMALL" | "MEDIUM" | "LARGE";
type AmPm = "AM" | "PM";

type CustomerMatchingState =
  | "IDLE"
  | "SEARCHING"
  | "OFFERED"
  | "NO_MATCH"
  | "SCHEDULED"
  | "ASSIGNED"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "ERROR";


type LocationCompatibility = {
  status: "UNKNOWN" | "VALID" | "INVALID";
  pickupCity: string;
  pickupState: string;
  dropCity: string;
  dropState: string;
  reason: string;
};

const CUSTOMER_NO_MATCH_REASONS = new Set([
  "NO_ONLINE_APPROVED_DRIVER",
  "NO_ELIGIBLE_DRIVER",
  "PICKUP_OUTSIDE_SERVICE_AREA",
  "SHARED_ROUTE_ZONE_MISMATCH",
  "SHARED_ROUTE_NO_LONGER_AVAILABLE",
  "SHARED_ROUTE_POINT_MISMATCH",
  "TARGET_LEG_NOT_FOUND",
  "NO_ACTIVE_LEG",
]);

function normalizeCustomerMatchingState(value: unknown): CustomerMatchingState {
  const normalized = String(value || "").trim().toUpperCase();
  switch (normalized) {
    case "SEARCHING":
    case "OFFERED":
    case "NO_MATCH":
    case "SCHEDULED":
    case "ASSIGNED":
    case "ARRIVED":
    case "IN_PROGRESS":
    case "COMPLETED":
    case "CANCELLED":
    case "ERROR":
    case "IDLE":
      return normalized as CustomerMatchingState;
    default:
      return "IDLE";
  }
}

function isCustomerNoMatchReason(value: unknown) {
  return CUSTOMER_NO_MATCH_REASONS.has(
    String(value || "").trim().toUpperCase(),
  );
}

function customerMatchingReasonText(reason: unknown) {
  switch (String(reason || "").trim().toUpperCase()) {
    case "PICKUP_OUTSIDE_SERVICE_AREA":
      return "Pickup is outside the active RideX service area.";
    case "SHARED_ROUTE_ZONE_MISMATCH":
      return "The selected Sharing Route is not available for this pickup area.";
    case "SHARED_ROUTE_NO_LONGER_AVAILABLE":
      return "The selected Sharing Route is no longer available.";
    case "SHARED_ROUTE_POINT_MISMATCH":
      return "The selected Sharing Route points are no longer valid.";
    case "NO_ONLINE_APPROVED_DRIVER":
      return "There is no approved online driver available for this service right now.";
    case "NO_ELIGIBLE_DRIVER":
      return "No eligible driver is available for this booking right now.";
    case "TARGET_LEG_NOT_FOUND":
    case "NO_ACTIVE_LEG":
      return "The booking leg is not available for matching.";
    default:
      return "No eligible driver is available right now.";
  }
}

function clampPassengerCount(value: number, maximum = 4) {
  return Math.max(1, Math.min(Math.max(1, Math.trunc(maximum || 1)), Math.trunc(value || 1)));
}

function customerRideTypeLabel(type: RideType) {
  if (type === "CITY_RIDE") return "City Ride";
  if (type === "SHARING_RIDE") return "Sharing Ride";
  return "InterCity Ride";
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeDefaultSchedule() {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  const rawHour = date.getHours();
  const period: AmPm = rawHour >= 12 ? "PM" : "AM";
  const hour = rawHour % 12 || 12;
  return {
    date: localDateString(date),
    time: `${String(hour).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    period,
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeScheduledIso(
  dateText: string,
  timeText: string,
  period: AmPm
) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    dateText.trim()
  );
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(
    timeText.trim()
  );

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 1 ||
    hour > 12 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  if (period === "AM") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }

  // Asia/Kolkata is UTC+05:30.
  const utcMillis =
    Date.UTC(year, month - 1, day, hour, minute) -
    5.5 * 60 * 60 * 1000;

  const result = new Date(utcMillis);
  if (Number.isNaN(result.getTime())) {
    return null;
  }

  return result;
}

export default function App({ onBeDriver, onAdminLogin }: { onBeDriver?: () => void; onAdminLogin?: () => void } = {}) {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [firstStartGuideState, setFirstStartGuideState] = useState<"CHECKING" | "SHOW" | "HIDDEN">("CHECKING");
  const CUSTOMER_FIRST_START_GUIDE_KEY = "ridex_customer_first_start_guide_v1";
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(CUSTOMER_FIRST_START_GUIDE_KEY).then((value) => {
      if (active) setFirstStartGuideState(value === "DONE" ? "HIDDEN" : "SHOW");
    }).catch(() => { if (active) setFirstStartGuideState("SHOW"); });
    return () => { active = false; };
  }, []);
  const closeFirstStartGuide = async () => {
    try { await AsyncStorage.setItem(CUSTOMER_FIRST_START_GUIDE_KEY, "DONE"); } catch {}
    setFirstStartGuideState("HIDDEN");
  };

  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [customerLoginMode, setCustomerLoginMode] = useState<"OTP" | "PASSWORD">("PASSWORD");
  const [customerUserId, setCustomerUserId] = useState("");
  const [customerPassword, setCustomerPassword] = useState("");
  const [customerOtpPurpose, setCustomerOtpPurpose] = useState(CUSTOMER_LOGIN_PURPOSE);
  const [testOtp, setTestOtp] = useState("");
  const [otpResendAvailableAt, setOtpResendAvailableAt] = useState<number | null>(null);
  const [otpResendCountdown, setOtpResendCountdown] = useState(0);
  const [otpAttemptsRemaining, setOtpAttemptsRemaining] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerFullName, setCustomerFullName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerRemoteAssets, setCustomerRemoteAssets] = useState<RideXRemoteAsset[]>([]);
  const [customerAuthToken, setCustomerAuthToken] = useState<string>("");
  const customerHomeAsset = useMemo(() => chooseCustomerHomeAsset(customerRemoteAssets), [customerRemoteAssets]);
  const customerDisplayAsset = useMemo(() => chooseCustomerDisplayAsset(customerRemoteAssets), [customerRemoteAssets]);
  const customerHomeAssetSource = useMemo(() => makeRideXRemoteImageSource(customerHomeAsset, customerAuthToken, API), [customerHomeAsset, customerAuthToken]);
  const customerDisplayAssetSource = useMemo(() => makeRideXRemoteImageSource(customerDisplayAsset, customerAuthToken, API), [customerDisplayAsset, customerAuthToken]);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!customerId) {
      setCustomerRemoteAssets([]);
      setCustomerAuthToken("");
      return () => { active = false; };
    }
    void (async () => {
      const cached = await Promise.all([
        getCachedRideXAssetManifest("CUSTOMER", "CUSTOMER", customerId),
        getCachedRideXAssetManifest("CUSTOMER", "SHARED", customerId),
      ]);
      if (active) setCustomerRemoteAssets([...cached[0], ...cached[1]]);
      try {
        const token = String(await getSecureToken(CUSTOMER_AUTH_TOKEN_KEY) || "");
        if (active) setCustomerAuthToken(token);
        const fresh = await Promise.all([
          syncRideXAssetCache("CUSTOMER", "CUSTOMER", customerId, ridexFetch, token),
          syncRideXAssetCache("CUSTOMER", "SHARED", customerId, ridexFetch, token),
        ]);
        if (active) setCustomerRemoteAssets([...fresh[0], ...fresh[1]]);
      } catch (error) {
        console.warn("CUSTOMER ASSET CACHE SYNC:", error);
      }
    })();
    return () => { active = false; };
  }, [customerId]);

  const [profilePhotoUri, setProfilePhotoUri] = useState("");
  const [profileAvatarKey, setProfileAvatarKey] = useState("A");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileState, setProfileState] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [profileTown, setProfileTown] = useState("");
  const [profileNearBy, setProfileNearBy] = useState("");
  const [pendingBookingTarget, setPendingBookingTarget] = useState<"ride" | "parcel" | "goods" | "event" | null>(null);
  const [utilityScreen, setUtilityScreen] = useState<"subscription" | "insurance" | null>(null);

  const [pickup, setPickup] = useState("");
  const [drop, setDrop] = useState("");
  const [pickupLat, setPickupLat] = useState(Number.NaN);
  const [pickupLng, setPickupLng] = useState(Number.NaN);
  const [dropLat, setDropLat] = useState(Number.NaN);
  const [dropLng, setDropLng] = useState(Number.NaN);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    recordedAt?: string;
  } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [currentLocationLabel, setCurrentLocationLabel] = useState("Current location");
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const [customerMapType, setCustomerMapType] = useState<MapType>("standard");
  const [customerMapLayersOpen, setCustomerMapLayersOpen] = useState(false);

  const [bookingMode, setBookingMode] = useState<BookingMode>("RIDE");
  const [rideType, setRideType] = useState<RideType>("CITY_RIDE");
  const [passengers, setPassengers] = useState(1);
  const [vehicleCatalog, setVehicleCatalog] = useState<VehicleCatalogEntry[]>([]);
  const [selectedPassengerCatalogCode, setSelectedPassengerCatalogCode] = useState("");
  const [selectedLogisticCatalogCode, setSelectedLogisticCatalogCode] = useState("");
  const [availabilityState, setAvailabilityState] = useState<"UNKNOWN" | "AVAILABLE" | "UNAVAILABLE">("UNKNOWN");
  const [sharedRoutes, setSharedRoutes] = useState<SharedRoute[]>([]);
  const [sharedRoutesLoading, setSharedRoutesLoading] = useState(false);
  const [sharedRoutesError, setSharedRoutesError] = useState("");
  const [sharedRouteId, setSharedRouteId] = useState("");
  const [sharedPickupPointId, setSharedPickupPointId] = useState("");
  const [sharedDropPointId, setSharedDropPointId] = useState("");
  const [interchangePoints, setInterchangePoints] = useState<string[]>([]);
  const [parcelServiceType, setParcelServiceType] = useState<"FULL" | "QUICK">("FULL");
  const [parcelImageUri, setParcelImageUri] = useState("");

  const initialSchedule = makeDefaultSchedule();
  const [scheduled, setScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(initialSchedule.date);
  const [scheduleTime, setScheduleTime] = useState(initialSchedule.time);
  const [schedulePeriod, setSchedulePeriod] = useState<AmPm>(initialSchedule.period);

  const [goodsVehicle, setGoodsVehicle] =
    useState<VehicleType>("PICKUP_TRUCK");
  const [goodsType, setGoodsType] = useState("");
  const [goodsDescription, setGoodsDescription] = useState("");
  const [parcelRows, setParcelRows] = useState<Array<{weight:string;description:string}>>([{weight:"",description:""}]);
  const [weight, setWeight] = useState("");
  const [size, setSize] = useState<GoodsSize>("SMALL");
  const [receiverName, setReceiverName] = useState("");
  const [receiverMobile, setReceiverMobile] = useState("");
  const [waiting, setWaiting] = useState("0");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [stops, setStops] = useState<string[]>([]);

  const [eventDraft, setEventDraft] = useState<{
    eventId: string;
    eventTitle: string;
    sessionId: string;
    sessionStartAt: string;
    sessionEndAt: string;
    startStopId: string;
    startStopName: string;
    endStopId: string;
    endStopName: string;
    fare: number;
    startLatitude?: number | null;
    startLongitude?: number | null;
    endLatitude?: number | null;
    endLongitude?: number | null;
  } | null>(null);
  const [eventAvailableCatalogCodes, setEventAvailableCatalogCodes] = useState<string[]>([]);
  const [eventAvailabilityMessage, setEventAvailabilityMessage] = useState("");
  const [eventAvailabilityLoading, setEventAvailabilityLoading] = useState(false);

  const [bookingId, setBookingId] = useState("");
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [selectedHistoryBooking, setSelectedHistoryBooking] = useState<any | null>(null);
  const [bookingStatus, setBookingStatus] = useState("NEW");
  const [matchingState, setMatchingState] = useState<CustomerMatchingState>("IDLE");
  const [matchingReason, setMatchingReason] = useState("");
  const [scheduledPickupText, setScheduledPickupText] = useState("");
  const [driverId, setDriverId] = useState("");
  const [driverLocation, setDriverLocation] = useState<{
    latitude: number;
    longitude: number;
    recordedAt?: string;
  } | null>(null);
  const [driverDistanceKm, setDriverDistanceKm] = useState<number | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [walletFilter, setWalletFilter] = useState<"ALL" | "CREDIT" | "DEBIT" | "REFUND">("ALL");
  const [fare, setFare] = useState(0);
  const [fareIsAuthoritative, setFareIsAuthoritative] = useState(false);
  const [routeDistanceKm, setRouteDistanceKm] = useState(0);
  const [routeDurationMinutes, setRouteDurationMinutes] = useState(0);
  const [routeGeometry, setRouteGeometry] = useState<number[][] | null>(null);
  const [driverName, setDriverName] = useState("");
  const [driverVehicleType, setDriverVehicleType] = useState("");
  const [driverVehicleNumber, setDriverVehicleNumber] = useState("");
  const [driverRating, setDriverRating] = useState<number | null>(null);
  const [profileNeedsCompletion, setProfileNeedsCompletion] = useState(false);

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("CASH");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [verificationCredential, setVerificationCredential] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("BOTH");
  const [verificationQrVerified, setVerificationQrVerified] = useState(false);
  const [verificationOtp, setVerificationOtp] = useState("");
  const [verificationOtpExpiresAt, setVerificationOtpExpiresAt] = useState("");
  const [activeLegId, setActiveLegId] = useState("");
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Protected customer actions use one shared OTP gate. The exact protected
  // action is selected by purposeCode; booking id is intentionally not sent
  // to the OTP APIs.
  const [protectedOtpOpen, setProtectedOtpOpen] = useState(false);
  const [protectedOtpAction, setProtectedOtpAction] = useState<"CANCEL" | "END" | null>(null);
  const [protectedOtp, setProtectedOtp] = useState("");
  const [protectedOtpBusy, setProtectedOtpBusy] = useState(false);
  const [protectedOtpMessage, setProtectedOtpMessage] = useState("");
  const [protectedOtpAttemptsRemaining, setProtectedOtpAttemptsRemaining] = useState<number | null>(null);
  const [protectedOtpResendAvailableAt, setProtectedOtpResendAvailableAt] = useState<number | null>(null);
  const [protectedOtpResendCountdown, setProtectedOtpResendCountdown] = useState(0);

  const CUSTOMER_CANCEL_REASON_OPTIONS = [
    { id: "DRIVER_LATE", label: "Driver is taking too long" },
    { id: "PLAN_CHANGED", label: "My plans changed" },
    { id: "BOOKED_BY_MISTAKE", label: "Booked by mistake" },
    { id: "PICKUP_OR_DROP_CHANGED", label: "Pickup or drop changed" },
    { id: "FOUND_OTHER_RIDE", label: "Found another ride" },
    { id: "OTHER", label: "Other reason" },
  ] as const;

  const [cancelReviewOpen, setCancelReviewOpen] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("DRIVER_LATE");
  const [cancelFeePreview, setCancelFeePreview] = useState<number | null>(null);
  const [cancelFeePreviewAvailable, setCancelFeePreviewAvailable] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const realtimeCleanupRef = useRef<(() => void) | null>(null);

  // Customer push lifecycle: refresh/touch the registered device after login and on app resume.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    if (customerId) {
      void getSecureToken(CUSTOMER_AUTH_TOKEN_KEY).then((token) => {
        if (cancelled || !token) return;
        stop = startRideXPushLifecycle({ api: API, authToken: token, appVersion: String(process.env.EXPO_PUBLIC_APP_VERSION ?? ""), deviceName: `RideX Customer ${customerId}` });
      });
    }
    return () => { cancelled = true; stop?.(); };
  }, [customerId]);

  const [supportCases, setSupportCases] = useState<any[]>([]);
  const [selectedSupportCase, setSelectedSupportCase] = useState<any | null>(null);
  const [supportDraft, setSupportDraft] = useState("");
  const [supportAttachment, setSupportAttachment] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportHistoryOpen, setSupportHistoryOpen] = useState(true);
  const [supportComposerHeight, setSupportComposerHeight] = useState(48);

  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [paymentPreparing, setPaymentPreparing] = useState(false);
  const paymentPreparedRef = useRef("");
  const paymentStatusRefreshBusyRef = useRef(false);
  const bookingRefreshSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const authToken = await getSecureToken(CUSTOMER_AUTH_TOKEN_KEY);
      if (!cancelled && authToken) {
        void registerRideXPushToken({ api: API, authToken, appVersion: String(process.env.EXPO_PUBLIC_APP_VERSION ?? "") });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (screen === "rides" && customerId) void loadCustomerHistory();
    if (screen === "location" && customerId) void loadSavedLocations();
    if ((screen === "profile" || screen === "editProfile") && customerId) {
      void loadCustomerProfile();
      void loadWalletBalance();
      void loadCustomerHistory();
    }
  }, [screen, customerId]);

  useEffect(() => {
    if (!customerId) return;
    if (screen === "support") void loadSupportCases();
    if (screen === "notifications" || screen === "home") void loadNotifications();
  }, [screen, customerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await ridexFetch(`${API}/meta/vehicle-catalog`);
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && data?.success) {
          const rows = flattenVehicleCatalog(data);
          setVehicleCatalog(rows);
          if (!selectedPassengerCatalogCode) {
            const first = eligiblePassengerVehicles(rows, rideType)[0];
            if (first) setSelectedPassengerCatalogCode(first.code);
          }
          if (!selectedLogisticCatalogCode) {
            const first = eligibleLogisticVehicles(rows, goodsType === "Logistic Goods" ? "GOODS" : "PARCEL")[0];
            if (first) setSelectedLogisticCatalogCode(first.code);
          }
        }
      } catch { /* backend remains authoritative; UI keeps its current selection until availability is checked */ }
    })();
    return () => { cancelled = true; };
  }, [rideType, goodsType, customerId]);

  useEffect(() => {
    let cancelled = false;
    if (bookingMode !== "EVENT" || !eventDraft || !Number.isFinite(Number(eventDraft.startLatitude)) || !Number.isFinite(Number(eventDraft.startLongitude))) {
      setEventAvailableCatalogCodes([]);
      setEventAvailabilityMessage(bookingMode === "EVENT" ? "Event start location is missing from the published route." : "");
      return;
    }

    const loadEventAvailability = async () => {
      setEventAvailabilityLoading(true);
      setEventAvailabilityMessage("");
      try {
        const params = new URLSearchParams({
          pickupLat: String(eventDraft.startLatitude),
          pickupLng: String(eventDraft.startLongitude),
          serviceType: RIDEX_EVENT_SERVICE_TYPE,
          rideType: RIDEX_EVENT_RIDE_TYPE,
          passengerCount: String(Math.max(1, Number(passengers))),
        });
        const response = await ridexFetch(`${RIDEX_EVENT_API.availability}?${params.toString()}`);
        const data = await response.json().catch(() => ({}));
        const options = Array.isArray(data?.data?.options) ? data.data.options : [];
        if (!response.ok || data?.success === false) throw new Error(data?.message || `Vehicle availability failed (${response.status})`);
        const codes = options
          .map((option: any) => String(option?.vehicleCatalogCode || "").trim().toUpperCase())
          .filter(Boolean);
        if (!cancelled) {
          setEventAvailableCatalogCodes(codes);
          if (codes.length === 0) setEventAvailabilityMessage("No eligible Event Ride vehicle is currently available at this event stop.");
        }
      } catch (error) {
        if (!cancelled) {
          setEventAvailableCatalogCodes([]);
          setEventAvailabilityMessage(error instanceof Error ? error.message : "Unable to load Event Ride vehicle availability.");
        }
      } finally {
        if (!cancelled) setEventAvailabilityLoading(false);
      }
    };

    void loadEventAvailability();
    return () => { cancelled = true; };
  }, [bookingMode, eventDraft, passengers]);

  const selectedPassengerVehicle = useMemo(() => vehicleCatalog.find(v => v.code === selectedPassengerCatalogCode) || eligiblePassengerVehicles(vehicleCatalog, rideType)[0] || null, [vehicleCatalog, selectedPassengerCatalogCode, rideType]);
  const eventAvailableVehicles = useMemo(() => {
    if (bookingMode !== "EVENT") return [];
    const available = new Set(eventAvailableCatalogCodes);
    return eligibleEventVehicles(vehicleCatalog).filter((vehicle) => available.has(vehicle.code) && vehicle.defaultCapacity >= passengers);
  }, [bookingMode, eventAvailableCatalogCodes, passengers, vehicleCatalog]);
  const selectedEventVehicle = useMemo(() => {
    if (bookingMode !== "EVENT") return null;
    const requested = vehicleCatalog.find((vehicle) => vehicle.code === selectedPassengerCatalogCode);
    if (requested && eventAvailableCatalogCodes.includes(requested.code) && requested.defaultCapacity >= passengers) return requested;
    return eventAvailableVehicles[0] || null;
  }, [bookingMode, eventAvailableCatalogCodes, eventAvailableVehicles, passengers, selectedPassengerCatalogCode, vehicleCatalog]);
  const selectedLogisticVehicle = useMemo(() => vehicleCatalog.find(v => v.code === selectedLogisticCatalogCode) || eligibleLogisticVehicles(vehicleCatalog, goodsType === "Logistic Goods" ? "GOODS" : "PARCEL")[0] || null, [vehicleCatalog, selectedLogisticCatalogCode, goodsType]);
  const passengerMaximum = bookingMode === "EVENT" ? maxPassengerCount(selectedEventVehicle) : maxPassengerCount(selectedPassengerVehicle);

  useEffect(() => {
    if (screen === "safety" && customerId) void loadEmergencyContacts();
  }, [screen, customerId]);

  useEffect(() => {
    if (!customerId || !bookingId) {
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
      setRealtimeConnected(false);
      return;
    }

    let stopped = false;

    const connect = () => {
      if (stopped) return;
      realtimeCleanupRef.current?.();
      const tokenKey = CUSTOMER_AUTH_TOKEN_KEY;
      getSecureToken(tokenKey).then((token) => {
        if (stopped || !token) return;
        const url = `${API}/realtime/stream?actorType=CUSTOMER&actorId=${encodeURIComponent(customerId)}`;
        realtimeCleanupRef.current = openRideXEventStream({
          url,
          headers: { Authorization: `Bearer ${token}` },
          onOpen: () => {
            setRealtimeConnected(true);
            void fetchBooking();
          },
          onClose: () => { setRealtimeConnected(false); },
          onError: () => { setRealtimeConnected(false); },
          onReplayGap: () => {
            if (!stopped) void fetchBooking();
          },
          onEvent: (event: RideXStreamEvent) => {
            const sameBooking = !event.bookingId || event.bookingId === bookingId;
            if (!sameBooking) return;

            const eventType = String(event.type || "").toUpperCase();
            const payload = event.payload ?? {};
            const nextDriverLat = Number(payload.latitude ?? payload.driverLatitude);
            const nextDriverLng = Number(payload.longitude ?? payload.driverLongitude);

            if (
              eventType === "GPS_UPDATED" &&
              Number.isFinite(nextDriverLat) &&
              Number.isFinite(nextDriverLng)
            ) {
              setDriverLocation({
                latitude: nextDriverLat,
                longitude: nextDriverLng,
                recordedAt: event.createdAt,
              });
              if (Number.isFinite(pickupLat) && Number.isFinite(pickupLng)) {
                const latKm = (nextDriverLat - pickupLat) * 111;
                const lngKm = (nextDriverLng - pickupLng) * 111;
                setDriverDistanceKm(Math.sqrt(latKm * latKm + lngKm * lngKm));
              }
            }

            if (eventType === "REQUEST_EXPIRED") {
              const reasonCode = String(payload.reason || "").trim().toUpperCase();
              if (reasonCode !== "CUSTOMER_CANCELLED") {
                setMatchingState((current) =>
                  current === "OFFERED" ? "SEARCHING" : current,
                );
                setMatchingReason(reasonCode);
              }
            }

            if (
              (eventType === "REQUEST_EXPIRED" &&
                String(payload.reason || "").trim().toUpperCase() === "CUSTOMER_CANCELLED") ||
              eventType === "REQUEST_CREATED" ||
              eventType === "REQUEST_ACCEPTED" ||
              eventType === "DRIVER_ARRIVING" ||
              eventType === "DRIVER_ARRIVED" ||
              eventType === "TRIP_STARTED" ||
              eventType === "TRIP_PROGRESS" ||
              eventType === "TRIP_COMPLETED" ||
              eventType === "ROUTE_CHANGED" ||
              eventType === "PAYMENT_COMPLETED" ||
              eventType === "BOOKING_UPDATED" ||
              eventType === "REQUEST_EXPIRED" ||
              eventType === "CANCELLED"
            ) {
              void fetchBooking();
            }
            if (event.type === "NOTIFICATION_CREATED") {
              void loadNotifications();
            }
            if (event.type === "SUPPORT_MESSAGE_CREATED" && String(payload.caseId || "") === String(selectedSupportCase?.id || "")) {
              void openSupportCase(String(payload.caseId));
            }
          },
          heartbeatTimeoutMs: 65000,
          reconnect: true,
          lastEventIdStorageKey: `ridex_realtime_cursor_customer_v1:${customerId}`,
        });
      }).catch(() => undefined);
    };

    connect();
    return () => {
      stopped = true;
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
      setRealtimeConnected(false);
    };
  }, [customerId, bookingId]);

  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [quick, setQuick] = useState<any[]>([]);
  const [quickCategory, setQuickCategory] = useState("");
  const [savedLocations, setSavedLocations] = useState<any[]>([]);
  const [locationSearchTerm, setLocationSearchTerm] = useState("");
  const [locationTarget, setLocationTarget] = useState<"pickup" | "drop" | "stop" | "interchange" | "profileAddress">("drop");
  const [locationReturnScreen, setLocationReturnScreen] = useState<Screen>("home");
  const [locationGeoResults, setLocationGeoResults] = useState<Array<{name:string;address:string;latitude:number;longitude:number}>>([]);
  const [locationCompatibility, setLocationCompatibility] = useState<LocationCompatibility>({
    status: "UNKNOWN",
    pickupCity: "",
    pickupState: "",
    dropCity: "",
    dropState: "",
    reason: "Select pickup and destination to validate service compatibility.",
  });

  const [galleryPhotos, setGalleryPhotos] = useState<Array<{ id: string; uri: string; fileName?: string; mimeType?: string }>>([]);

  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyMobile, setEmergencyMobile] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");
  const [emergencyContacts, setEmergencyContacts] = useState<any[]>([]);
  const bookingIdempotencyKeyRef = useRef("");
  const eventBookingIdempotencyKeyRef = useRef("");
  const rebookIdempotencyKeyRef = useRef("");
  const [sosReason, setSosReason] = useState("Unsafe situation");
  const [sosConfirm, setSosConfirm] = useState(false);

  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState("");
  const [subscriptionExpiry, setSubscriptionExpiry] = useState("");
  const [insuranceDemoClaim, setInsuranceDemoClaim] = useState<any | null>(null);

  // Optional providers are intentionally non-blocking.
  // They can be wired later via environment variables without App.tsx changes.
  void RIDEX_OPTIONAL_CONFIG;

  useEffect(() => {
    async function restoreSession() {
      try {
        const stored = await AsyncStorage.getItem(
          CUSTOMER_SESSION_STORAGE_KEY
        );
        if (!stored) return;
        const parsed = JSON.parse(stored);
        const storedToken = String(parsed?.token || "").trim();
        if (storedToken) {
          await setSecureToken(CUSTOMER_AUTH_TOKEN_KEY, storedToken);
          // Migrate legacy session JSON away from browser/native persistent
          // storage so the bearer token exists only in secure token storage.
          const { token: _legacyToken, ...sanitizedSession } = parsed;
          await AsyncStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify(sanitizedSession));
        }
        const storedCustomerId = String(parsed?.customerId || "");
        const storedBookingId = String(parsed?.bookingId || "");
        const storedBookingStatus = String(parsed?.bookingStatus || "NEW");
        const storedMatchingState = normalizeCustomerMatchingState(parsed?.matchingState);
        const storedMatchingReason = String(parsed?.matchingReason || "");
        const storedScheduledPickupText = String(parsed?.scheduledPickupText || "");
        const storedSharedRouteId = String(parsed?.sharedRouteId || "");
        const storedSharedPickupPointId = String(parsed?.sharedPickupPointId || "");
        const storedSharedDropPointId = String(parsed?.sharedDropPointId || "");

        let profileComplete = true;
        if (storedCustomerId) {
          setCustomerId(storedCustomerId);
          profileComplete = await loadCustomerProfile(storedCustomerId);

          // Backend recovery is authoritative after app restart. Local storage is
          // only a fallback for unsent client state; it must never create a ride
          // that the backend does not know about.
          try {
            const activeResponse = await ridexFetch(
              `${API}/trips/customer/${encodeURIComponent(storedCustomerId)}/active`,
            );
            const activeData = await activeResponse.json().catch(() => ({}));
            const recoveredLeg = activeResponse.ok && activeData?.success
              ? activeData?.data?.leg
              : null;
            const recoveredBookingId = String(recoveredLeg?.bookingId || "").trim();
            if (recoveredBookingId) {
              setBookingId(recoveredBookingId);
              setBookingStatus(String(recoveredLeg?.status || "DRIVER_ASSIGNED").toUpperCase());
              setMatchingState("ASSIGNED");
              setMatchingReason("Recovered from RideX backend state");
              setScheduledPickupText("");
              setScreen("confirmed");
              return;
            }
          } catch (recoveryError) {
            console.warn("CUSTOMER BACKEND RECOVERY FALLBACK:", recoveryError);
          }
        }

        if (storedBookingId) {
          setBookingId(storedBookingId);
          setBookingStatus(storedBookingStatus);
          setMatchingState(storedMatchingState);
          setMatchingReason(storedMatchingReason);
          setScheduledPickupText(storedScheduledPickupText);
          setSharedRouteId(storedSharedRouteId);
          setSharedPickupPointId(storedSharedPickupPointId);
          setSharedDropPointId(storedSharedDropPointId);
          setScreen("confirmed");
        } else if (storedCustomerId) {
          // An authenticated customer may return to the app before completing
          // the mandatory first-time profile. Re-enter that gate on restart.
          setScreen(profileComplete ? "home" : "editProfile");
        } else {
          setScreen("welcome");
        }
      } catch (error) {
        console.error("CUSTOMER SESSION RESTORE ERROR:", error);
      }
    }

    void restoreSession();
  }, []);

  useEffect(() => {
    async function loadGallery() {
      if (customerId) {
        try {
          const response = await ridexFetch(`${API}/customer/${encodeURIComponent(customerId)}/gallery`);
          const data = await response.json().catch(() => ({}));
          if (response.ok && data?.success && Array.isArray(data.data)) {
            setGalleryPhotos(data.data.filter((item: any) => item?.uri).map((item: any) => ({
              id: String(item.id),
              uri: String(item.uri),
              fileName: item.fileName ? String(item.fileName) : undefined,
              mimeType: item.mimeType ? String(item.mimeType) : undefined,
            })));
            return;
          }
        } catch (error) {
          console.warn("CUSTOMER GALLERY BACKEND LOAD FALLBACK:", error);
        }
      }

      try {
        const stored = await AsyncStorage.getItem(GALLERY_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setGalleryPhotos(parsed.filter((item) => typeof item === "string").map((uri) => ({ id: `local-${uri}`, uri })));
        }
      } catch (error) {
        console.error("GALLERY LOAD ERROR:", error);
      }
    }

    void loadGallery();

    async function loadLegacyEmergencyContact() {
      try {
        const stored = await AsyncStorage.getItem(EMERGENCY_CONTACT_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (parsed?.name) setEmergencyName(String(parsed.name));
        if (parsed?.mobile) setEmergencyMobile(String(parsed.mobile));
      } catch (error) {
        console.error("EMERGENCY CONTACT LEGACY LOAD ERROR:", error);
      }
    }

    void loadLegacyEmergencyContact();
  }, []);

  useEffect(() => {
    if (!otpResendAvailableAt) {
      setOtpResendCountdown(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((otpResendAvailableAt - Date.now()) / 1000),
      );
      setOtpResendCountdown(remaining);
      if (remaining === 0) setOtpResendAvailableAt(null);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [otpResendAvailableAt]);

  useEffect(() => {
    if (!protectedOtpResendAvailableAt) {
      setProtectedOtpResendCountdown(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((protectedOtpResendAvailableAt - Date.now()) / 1000),
      );
      setProtectedOtpResendCountdown(remaining);
      if (remaining === 0) setProtectedOtpResendAvailableAt(null);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [protectedOtpResendAvailableAt]);

  useEffect(() => {
    const backAction = () => {
      if (screen === "welcome" || screen === "login" || screen === "home") {
        return false;
      }

      goBack();
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => subscription.remove();
  }, [screen, bookingMode]);

  async function refreshCurrentLocation(useAsPickup = false) {
    try {
      setLocationLoading(true);
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setMessage("Location permission is required to use your current location.");
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        recordedAt: new Date().toISOString(),
      };

      setUserLocation(nextLocation);
      try {
        const places = await Location.reverseGeocodeAsync({ latitude: nextLocation.latitude, longitude: nextLocation.longitude });
        const place = places?.[0];
        const label = [place?.name, place?.street, place?.city || place?.district]
          .filter((value, index, arr) => value && arr.indexOf(value) === index)
          .join(", ");
        if (label) setCurrentLocationLabel(label);
      } catch {}

      if (useAsPickup) {
        setPickupLat(nextLocation.latitude);
        setPickupLng(nextLocation.longitude);
        if (!pickup.trim()) {
          setPickup("Current location");
        }
      }

      setMessage(
        `Current location updated${typeof nextLocation.accuracy === "number" ? ` (±${Math.round(nextLocation.accuracy)} m)` : ""}.`
      );
      return nextLocation;
    } catch (error) {
      console.error("CUSTOMER CURRENT LOCATION ERROR:", error);
      setMessage("Unable to get your current location. Check GPS/location services.");
      return null;
    } finally {
      setLocationLoading(false);
    }
  }

  useEffect(() => {
    if (screen === "home" && !pickup.trim()) {
      void refreshCurrentLocation(true);
    }
  }, [screen]);

  useEffect(() => {
    const activeRideStatuses = new Set([
      "DRIVER_ASSIGNED",
      "DRIVER_ARRIVING",
      "DRIVER_ARRIVED",
      "STARTED",
      "IN_PROGRESS",
    ]);
    const shouldWatchActiveRide =
      screen === "confirmed" &&
      activeRideStatuses.has(String(bookingStatus || "").toUpperCase());

    locationSubscriptionRef.current?.remove();
    locationSubscriptionRef.current = null;

    // Location selection uses a one-shot refreshCurrentLocation() call.
    // Scheduled/no-match/idle booking states do not require continuous GPS.
    if (!shouldWatchActiveRide) return;

    let active = true;

    async function startLocationWatch() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== Location.PermissionStatus.GRANTED) return;

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (active) {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            recordedAt: new Date().toISOString(),
          });
        }

        locationSubscriptionRef.current?.remove();
        locationSubscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (next) => {
            if (!active) return;
            setUserLocation({
              latitude: next.coords.latitude,
              longitude: next.coords.longitude,
              accuracy: next.coords.accuracy,
              recordedAt: new Date().toISOString(),
            });
          }
        );
      } catch (error) {
        console.error("CUSTOMER ACTIVE RIDE LOCATION WATCH ERROR:", error);
      }
    }

    void startLocationWatch();

    return () => {
      active = false;
      locationSubscriptionRef.current?.remove();
      locationSubscriptionRef.current = null;
    };
  }, [screen, bookingStatus]);

  async function uploadGalleryPhoto(uri: string, fileName: string, mimeType: string, source: "CAMERA" | "LIBRARY") {
    if (!customerId) {
      setMessage("Please login before saving gallery photos.");
      return;
    }
    const blob = await fetch(uri).then((response) => response.blob());
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(blob);
    });
    const response = await ridexFetch(`${API}/customer/${encodeURIComponent(customerId)}/gallery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, mimeType: mimeType || blob.type || "image/jpeg", base64: dataUrl, source }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success || !data?.data?.uri) {
      throw new Error(data?.message || "Unable to save gallery photo");
    }
    setGalleryPhotos((current) => [{
      id: String(data.data.id),
      uri: String(data.data.uri),
      fileName: data.data.fileName ? String(data.data.fileName) : fileName,
      mimeType: data.data.mimeType ? String(data.data.mimeType) : mimeType,
    }, ...current].slice(0, 50));
  }

  async function openCamera() {
    try {
      const permission =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        setMessage(
          "Camera permission is required to take a photo."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      await uploadGalleryPhoto(
        result.assets[0].uri,
        result.assets[0].fileName || `ridex-gallery-${Date.now()}.jpg`,
        result.assets[0].mimeType || "image/jpeg",
        "CAMERA",
      );
      setMessage("Photo captured and saved to RideX Gallery.");
    } catch (error) {
      console.error("CAMERA ERROR:", error);
      setMessage("Unable to open camera.");
    }
  }

  async function chooseFromGallery() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setMessage(
          "Photo library permission is required to choose photos."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      for (const asset of result.assets) {
        await uploadGalleryPhoto(
          asset.uri,
          asset.fileName || `ridex-gallery-${Date.now()}.jpg`,
          asset.mimeType || "image/jpeg",
          "LIBRARY",
        );
      }
      setMessage("Photos added to RideX Gallery.");
    } catch (error) {
      console.error("GALLERY PICK ERROR:", error);
      setMessage("Unable to open photo gallery.");
    }
  }

  async function removePhoto(photo: { id: string; uri: string }) {
    if (customerId && !photo.id.startsWith("local-")) {
      try {
        const response = await ridexFetch(`${API}/customer/${encodeURIComponent(customerId)}/gallery/${encodeURIComponent(photo.id)}`, { method: "DELETE" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success) throw new Error(data?.message || "Unable to delete gallery photo");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to delete gallery photo");
        return;
      }
    }
    setGalleryPhotos((current) => current.filter((item) => item.id !== photo.id));
  }

  async function loadEmergencyContacts() {
    if (!customerId) return;
    try {
      const response = await ridexFetch(`${API}/sos/emergency-contacts`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setMessage(data?.message || "Unable to load emergency contacts.");
        return;
      }
      const contacts = Array.isArray(data.data) ? data.data : [];
      setEmergencyContacts(contacts);

      if (!emergencyName.trim() && !emergencyMobile.trim() && contacts.length > 0) {
        const primary = contacts.find((item: any) => item?.isPrimary) || contacts[0];
        setEmergencyName(String(primary?.name || ""));
        setEmergencyRelation(String(primary?.relation || ""));
        // Backend intentionally masks stored phone numbers. Keep the locally
        // entered number for calling only when it is already known on device.
      }
    } catch (error) {
      console.error("EMERGENCY CONTACT LIST ERROR:", error);
      setMessage("Unable to load emergency contacts.");
    }
  }

  async function saveEmergencyContact() {
    if (!customerId) {
      setMessage("Please login before saving an emergency contact.");
      return;
    }

    const name = emergencyName.trim();
    const mobileNumber = emergencyMobile.replace(/\D/g, "");
    const relation = emergencyRelation.trim();

    if (!name) {
      setMessage("Please enter emergency contact name.");
      return;
    }

    if (!/^\d{10,15}$/.test(mobileNumber)) {
      setMessage("Please enter a valid emergency contact mobile number.");
      return;
    }

    if (emergencyContacts.length >= 5) {
      setMessage("Maximum 5 emergency contacts are allowed.");
      return;
    }

    try {
      setLoading(true);
      const response = await ridexFetch(`${API}/sos/emergency-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mobile: mobileNumber,
          relation: relation || undefined,
          isPrimary: emergencyContacts.length === 0,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setMessage(data?.message || "Unable to save emergency contact.");
        return;
      }

      await AsyncStorage.setItem(
        EMERGENCY_CONTACT_STORAGE_KEY,
        JSON.stringify({ name, mobile: mobileNumber, relation }),
      );
      setEmergencyName(name);
      setEmergencyMobile(mobileNumber);
      setEmergencyRelation(relation);
      setMessage("Emergency contact saved in RideX. The server keeps the stored number protected.");
      await loadEmergencyContacts();
    } catch (error) {
      console.error("EMERGENCY CONTACT SAVE ERROR:", error);
      setMessage("Unable to save emergency contact.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteEmergencyContact(contactId: string) {
    if (!customerId || !contactId) return;
    try {
      setLoading(true);
      const response = await ridexFetch(`${API}/sos/emergency-contacts/${encodeURIComponent(contactId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setMessage(data?.message || "Unable to delete emergency contact.");
        return;
      }
      setMessage("Emergency contact deleted.");
      await loadEmergencyContacts();
    } catch (error) {
      console.error("EMERGENCY CONTACT DELETE ERROR:", error);
      setMessage("Unable to delete emergency contact.");
    } finally {
      setLoading(false);
    }
  }
  async function callEmergencyContact() {
    const mobileNumber = emergencyMobile.replace(/\D/g, "");
    if (!mobileNumber) {
      setMessage("Please save an emergency contact first.");
      return;
    }

    try {
      await Linking.openURL(`tel:${mobileNumber}`);
    } catch (error) {
      console.error("CALL CONTACT ERROR:", error);
      setMessage("Unable to start the phone call.");
    }
  }

  async function createSupportCase(subject: string, description: string, priority = "NORMAL") {
    if (!customerId) {
      setMessage("Please login before contacting support.");
      return false;
    }
    try {
      setLoading(true);
      const response = await ridexFetch(`${API}/support/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorType: "CUSTOMER", actorId: customerId, bookingId: bookingId || undefined, subject, description, priority }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setMessage(data.message || "Unable to create support case.");
        return false;
      }
      setMessage("Support case created. RideX Support has received your request.");
      return true;
    } catch (error) {
      console.error("SUPPORT CASE ERROR:", error);
      setMessage("Unable to reach RideX Support.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function callSupport() {
    const phone = String(RIDEX_OPTIONAL_CONFIG.supportPhone || "").replace(/\D/g, "");
    if (!phone) {
      setMessage("Support calling is not configured. Please create a support case.");
      return;
    }
    try { await Linking.openURL(`tel:${phone}`); }
    catch { setMessage("Unable to open the support call."); }
  }

  async function emailSupport() {
    const email = String(RIDEX_OPTIONAL_CONFIG.supportEmail || "").trim();
    if (!email) {
      setMessage("Support email is not configured. Please create a support case.");
      return;
    }
    try { await Linking.openURL(`mailto:${email}`); }
    catch { setMessage("Unable to open email."); }
  }

  async function openWhatsAppSupport() {
    const phone = String(RIDEX_OPTIONAL_CONFIG.whatsappPhone || "").replace(/\D/g, "");
    if (!phone) {
      setMessage("WhatsApp support is not configured. Please create a support case.");
      return;
    }
    const url = `https://wa.me/${phone}?text=RideX%20Support%20Request`;
    try { await Linking.openURL(url); }
    catch { setMessage("Unable to open WhatsApp."); }
  }

  async function triggerSos() {
    if (!bookingId) {
      setMessage("SOS is available from an active booking.");
      return;
    }

    if (!sosConfirm) {
      setMessage("Please confirm before sending SOS.");
      return;
    }

    try {
      setLoading(true);
      setMessage("Sending SOS to RideX Safety...");

      const response = await ridexFetch(`${API}/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          bookingId,
          driverId: driverId || undefined,
          latitude: Number(userLocation?.latitude ?? pickupLat),
          longitude: Number(userLocation?.longitude ?? pickupLng),
          reason: sosReason,
          source: "CUSTOMER_APP",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Unable to send SOS. Please contact emergency services.");
        return;
      }

      setSosConfirm(false);
      setMessage("SOS sent to RideX Safety.");
    } catch (error) {
      console.error("SOS ERROR:", error);
      setMessage("SOS could not reach RideX Safety. Please use your phone's emergency services.");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    if (screen === "qrScanner") { setQrScannerOpen(false); setScreen("confirmed"); return; }
    if (screen === "event") { setBookingMode("RIDE"); setEventDraft(null); setMessage(""); setScreen("home"); return; }
    if (screen === "location") { setMessage(""); setScreen("home"); return; }
    if (screen === "rideType") { setMessage(""); setScreen("location"); return; }
    if (screen === "goods") { setMessage(""); setScreen("home"); return; }
    if (screen === "fare") { setMessage(""); setScreen(bookingMode === "GOODS" ? "goods" : bookingMode === "EVENT" ? "event" : "rideType"); return; }
    if (screen === "confirmed") { setMessage("Booking is already created. Back returns to the booking summary."); return; }
    if (screen === "payment") { setScreen("confirmed"); return; }
    if (screen === "rating") { setScreen("payment"); return; }
    if (screen === "gallery") { setScreen("home"); return; }
    if (screen === "safety") { setScreen(bookingId ? "confirmed" : "home"); return; }
    if (screen === "rebook") { setScreen("home"); }
  }

  async function customerPasswordLogin() {
    const userId = customerUserId.trim();
    if (!userId) {
      setMessage("Please enter your Customer User ID.");
      return;
    }
    if (!customerPassword) {
      setMessage("Please enter your password.");
      return;
    }

    try {
      setLoading(true);
      setMessage("Signing in securely...");
      const response = await ridexFetch(`${API}/auth/password/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorType: "CUSTOMER", identifier: userId, password: customerPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        setMessage(data?.message || "Invalid Customer User ID or password.");
        return;
      }

      if (data?.data?.requiresOtp) {
        const actorId = String(data?.data?.actorId || "").trim();
        if (!/^\d{10}$/.test(actorId)) {
          setMessage("New-device verification could not be started safely.");
          return;
        }
        setMobile(actorId);
        setCustomerOtpPurpose("CUSTOMER.AUTH.NEW_DEVICE");
        setOtp("");
        setOtpAttemptsRemaining(Number(data?.data?.attemptsRemaining ?? 5));
        const resendAfterSeconds = Number(data?.data?.resendAfterSeconds ?? 0);
        setOtpResendAvailableAt(resendAfterSeconds > 0 ? Date.now() + resendAfterSeconds * 1000 : null);
        if (RIDEX_TEST_MODE && data?.data?.testOtp) setTestOtp(String(data.data.testOtp));
        else setTestOtp("");
        setMessage("A new-device OTP is required before you can continue.");
        setScreen("otp");
        return;
      }

      const returnedCustomerId = String(data?.data?.customerId || data?.data?.userId || "").trim();
      const token = String(data?.data?.token || "").trim();
      if (!returnedCustomerId || !token) {
        setMessage("Authentication succeeded but the customer session was incomplete.");
        return;
      }
      setCustomerId(returnedCustomerId);
      await setSecureToken(CUSTOMER_AUTH_TOKEN_KEY, token);
      await AsyncStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify({ customerId: returnedCustomerId, userId }));
      void registerRideXPushToken({ api: API, authToken: token, appVersion: String(process.env.EXPO_PUBLIC_APP_VERSION ?? "") });

      // Existing password-authenticated customers must still complete the
      // mandatory profile before entering the Customer Home/booking workspace.
      const profileComplete = await loadCustomerProfile(returnedCustomerId);
      setMessage(profileComplete ? "Login successful." : "Login successful. Complete your profile to continue.");
      setScreen(profileComplete ? "home" : "editProfile");
    } catch (error) {
      console.error("CUSTOMER PASSWORD LOGIN ERROR:", error);
      setMessage("Unable to reach RideX service.");
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp() {
    if (mobile.trim().length !== 10) {
      setMessage("Please enter a valid 10-digit mobile number.");
      return;
    }

    try {
      setLoading(true);
      setMessage("Sending OTP...");

      const normalizedMobile = mobile.replace(/\D/g, "").slice(-10);
      const response = await ridexFetch(
        `${API}/auth/send-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actorType: "CUSTOMER",
            actorId: normalizedMobile,
            purposeCode: customerOtpPurpose,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        const failedAttemptsRemaining = Number(data?.attemptsRemaining);
        if (Number.isFinite(failedAttemptsRemaining) && failedAttemptsRemaining >= 0) {
          setOtpAttemptsRemaining(Math.min(5, Math.floor(failedAttemptsRemaining)));
        }
        setMessage(data.message || "Unable to send OTP.");
        return;
      }

      const attemptsRemaining = Number(data?.attemptsRemaining);
      setOtpAttemptsRemaining(
        Number.isFinite(attemptsRemaining) && attemptsRemaining >= 0
          ? Math.min(5, Math.floor(attemptsRemaining))
          : null,
      );
      setOtp("");
      const resendAfterSeconds = Number(data?.resendAfterSeconds ?? 0);
      setOtpResendAvailableAt(
        Number.isFinite(resendAfterSeconds) && resendAfterSeconds > 0
          ? Date.now() + resendAfterSeconds * 1000
          : null,
      );

if (RIDEX_TEST_MODE) {
  const generatedTestOtp = String(data.testOtp ?? "").trim();
  setTestOtp(generatedTestOtp);

  setMessage(
    generatedTestOtp
      ? "TEST OTP generated successfully."
      : "TEST OTP generated successfully."
  );
} else {
  setTestOtp("");
  setMessage("OTP sent successfully.");
}

setScreen("otp");
    } catch (error) {
      console.error("SEND OTP ERROR:", error);
      setMessage("Backend not reachable. Check API URL.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    const normalizedMobile = mobile.replace(/\D/g, "").slice(-10);
    if (!/^\d{10}$/.test(normalizedMobile)) {
      setMessage("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (otpResendCountdown > 0) {
      setMessage(`Please wait ${otpResendCountdown} seconds before resending.`);
      return;
    }

    try {
      setLoading(true);
      setMessage("Resending OTP...");
      const response = await ridexFetch(`${API}/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorType: "CUSTOMER",
          actorId: normalizedMobile,
          purposeCode: customerOtpPurpose,
        }),
      });
      const data = await response.json().catch(() => ({}));

      const attemptsRemaining = Number(data?.attemptsRemaining);
      if (Number.isFinite(attemptsRemaining) && attemptsRemaining >= 0) {
        setOtpAttemptsRemaining(Math.min(5, Math.floor(attemptsRemaining)));
      }

      if (!response.ok || !data?.success) {
        const retryAfterSeconds = Number(data?.retryAfterSeconds ?? 0);
        setOtpResendAvailableAt(
          Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? Date.now() + retryAfterSeconds * 1000
            : null,
        );
        setMessage(data?.message || "Unable to resend OTP.");
        return;
      }

      setOtp("");
      const resendAfterSeconds = Number(data?.resendAfterSeconds ?? 0);
      setOtpResendAvailableAt(
        Number.isFinite(resendAfterSeconds) && resendAfterSeconds > 0
          ? Date.now() + resendAfterSeconds * 1000
          : null,
      );

      if (RIDEX_TEST_MODE && data?.testOtp) {
        setTestOtp(String(data.testOtp));
        setMessage("TEST OTP resent successfully.");
      } else {
        setTestOtp("");
        setMessage("OTP resent successfully.");
      }
    } catch (error) {
      console.error("CUSTOMER RESEND OTP ERROR:", error);
      setMessage("Unable to reach RideX service.");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (otp.trim().length !== 4) {
      setMessage("Please enter 4-digit OTP.");
      return;
    }

    try {
      setLoading(true);
      setMessage("Verifying OTP...");

      const normalizedMobile = mobile.replace(/\D/g, "").slice(-10);
      if (!/^\d{10}$/.test(normalizedMobile)) {
        setMessage("Please enter a valid 10-digit mobile number.");
        return;
      }
      const response = await ridexFetch(
        `${API}/auth/verify-otp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actorType: "CUSTOMER",
            actorId: normalizedMobile,
            purposeCode: customerOtpPurpose,
            otp: otp.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        const failedAttemptsRemaining = Number(data?.attemptsRemaining);
        if (Number.isFinite(failedAttemptsRemaining) && failedAttemptsRemaining >= 0) {
          setOtpAttemptsRemaining(Math.min(5, Math.floor(failedAttemptsRemaining)));
        }
        setMessage(data.message || "Invalid OTP.");
        return;
      }
      setOtpAttemptsRemaining(null);

      const returnedCustomerId = data.data?.customerId;
      if (!returnedCustomerId) {
        setMessage("Customer ID not received from backend.");
        return;
      }

      setCustomerId(returnedCustomerId);
      try {
        const token = String(data.data?.token || "").trim();
        if (token) await setSecureToken(CUSTOMER_AUTH_TOKEN_KEY, token);
        await AsyncStorage.setItem(
          CUSTOMER_SESSION_STORAGE_KEY,
          JSON.stringify({ customerId: returnedCustomerId, mobile: mobile.trim(), userId: data.data?.userId || null })
        );
        if (token) void registerRideXPushToken({ api: API, authToken: token, appVersion: String(process.env.EXPO_PUBLIC_APP_VERSION ?? "") });
      } catch (error) {
        console.error("CUSTOMER SESSION SAVE ERROR:", error);
      }
      const profileResponse = await ridexFetch(`${API}/customer/${encodeURIComponent(returnedCustomerId)}/profile`);
      const profileData = await profileResponse.json().catch(() => ({}));
      const loadedName = String(profileData?.data?.fullName || "").trim();
      setCustomerFullName(loadedName);
      setCustomerEmail(String(profileData?.data?.email || ""));
      await loadCustomerProfileExtras(returnedCustomerId);
      const needsProfileCompletion = Boolean(
        data?.data?.profileCompletionRequired === true ||
        data?.data?.nextStep === "PROFILE_COMPLETION" ||
        !loadedName ||
        /^Customer \d{4}$/.test(loadedName) ||
        !String(profileData?.data?.address || "").trim() ||
        !String(profileData?.data?.stateId || "").trim() ||
        !String(profileData?.data?.cityId || "").trim() ||
        !String(profileData?.data?.town || "").trim() ||
        !String(profileData?.data?.nearBy || "").trim()
      );
      setProfileNeedsCompletion(needsProfileCompletion);
      setMessage(needsProfileCompletion ? "OTP verified. Complete your profile to continue." : "Login successful!");
      setScreen(needsProfileCompletion ? "editProfile" : "home");
    } catch (error) {
      console.error("VERIFY OTP ERROR:", error);
      setMessage("Backend not reachable. Check API URL.");
    } finally {
      setLoading(false);
    }
  }


async function loadCustomerProfileExtras(customerIdOverride?: string) {
  const id = customerIdOverride || customerId;
  if (!id) return;
  try {
    let serverProfileLoaded = false;
    try {
      const response = await ridexFetch(`${API}/customer/${encodeURIComponent(id)}/profile`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success && data.data) {
        const profile = data.data;
        serverProfileLoaded = true;
        setProfileAddress(String(profile.address || ""));
        setProfileState(String(profile.state || ""));
        setProfileCity(String(profile.city || ""));
        setProfileTown(String(profile.town || ""));
        setProfileNearBy(String(profile.nearBy || ""));
        setProfilePhotoUri(String(profile.photoUrl || ""));
      }
    } catch (error) {
      console.warn("CUSTOMER SERVER PROFILE LOAD ERROR:", error);
    }

    const raw = await AsyncStorage.getItem(`${CUSTOMER_PROFILE_LOCAL_KEY_PREFIX}${id}`);
    if (raw && !serverProfileLoaded) {
      const parsed = JSON.parse(raw);
      setProfilePhotoUri(String(parsed?.photoUri || ""));
      setProfileAvatarKey(String(parsed?.avatarKey || "A"));
      setProfileAddress(String(parsed?.address || ""));
      setProfileState(String(parsed?.state || ""));
      setProfileCity(String(parsed?.city || ""));
      setProfileTown(String(parsed?.town || ""));
      setProfileNearBy(String(parsed?.nearBy || ""));
    }
    let serverSubscriptionLoaded = false;
    try {
      const subscriptionResponse = await ridexFetch(`${API}/customer/${encodeURIComponent(id)}/subscriptions/current`);
      const subscriptionData = await subscriptionResponse.json().catch(() => ({}));
      if (subscriptionResponse.ok && subscriptionData?.success) {
        const subscription = subscriptionData?.data?.subscription || subscriptionData?.data || null;
        serverSubscriptionLoaded = true;
        const active = Boolean(subscription?.active || String(subscription?.status || "").toUpperCase() === "ACTIVE");
        setSubscriptionActive(active);
        setSubscriptionPlan(String(subscription?.planCode || subscription?.planName || ""));
        setSubscriptionExpiry(String(subscription?.expiresAt || ""));
      }
    } catch { /* local state below is only a recovery fallback for offline display */ }
    const subscriptionRaw = await AsyncStorage.getItem(`${CUSTOMER_SUBSCRIPTION_LOCAL_KEY_PREFIX}${id}`);
    if (subscriptionRaw && !serverSubscriptionLoaded) {
      const subscription = JSON.parse(subscriptionRaw);
      setSubscriptionActive(Boolean(subscription?.active));
      setSubscriptionPlan(String(subscription?.plan || ""));
      setSubscriptionExpiry(String(subscription?.expiry || ""));
    }
    const claimRaw = await AsyncStorage.getItem(`${CUSTOMER_INSURANCE_DEMO_KEY_PREFIX}${id}`);
    if (claimRaw) setInsuranceDemoClaim(JSON.parse(claimRaw));
  } catch (error) {
    console.warn("CUSTOMER LOCAL DATA LOAD ERROR:", error);
  }
}

function isProfileActuallyComplete() {
  return Boolean(
    customerFullName.trim() &&
    profileAddress.trim() &&
    profileState.trim() &&
    profileCity.trim() &&
    profileTown.trim() &&
    profileNearBy.trim()
  );
}

async function captureProfileGpsAddress() {
  const position = userLocation || await refreshCurrentLocation(false);
  if (!position) return;
  try {
    const places = await Location.reverseGeocodeAsync({
      latitude: position.latitude,
      longitude: position.longitude,
    });
    const place = places?.[0];
    const address = [
      place?.name,
      place?.street,
      place?.subregion,
      place?.city,
      place?.region,
      place?.postalCode,
    ].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join(", ");
    setProfileAddress(address || currentLocationLabel || "Current location");
    setProfileState(String(place?.region || ""));
    setProfileCity(String(place?.city || place?.subregion || ""));
    setProfileTown(String(place?.subregion || place?.district || place?.city || ""));
    setProfileNearBy(String(place?.name || place?.street || place?.district || ""));
  } catch {
    setMessage("Unable to capture the full GPS address.");
  }
}

async function saveCustomerProfileExtras() {
  if (!customerId) return;
  await AsyncStorage.setItem(
    `${CUSTOMER_PROFILE_LOCAL_KEY_PREFIX}${customerId}`,
    JSON.stringify({
      photoUri: profilePhotoUri,
      avatarKey: profileAvatarKey,
      address: profileAddress,
      state: profileState,
      city: profileCity,
      town: profileTown,
      nearBy: profileNearBy,
      updatedAt: new Date().toISOString(),
    }),
  );
}

async function chooseProfilePhoto() {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setProfilePhotoUri(result.assets[0].uri);
    setProfileAvatarKey("");
  } catch {
    setMessage("Unable to select profile photo.");
  }
}

function chooseBuiltInAvatar(key: string) {
  setProfileAvatarKey(key);
  setProfilePhotoUri("");
}

function startBookingFlow(target: "ride" | "city" | "sharing" | "intercity" | "parcel" | "goods" | "event") {
  if (!isProfileActuallyComplete()) {
    setPendingBookingTarget(target);
    setMessage("Please complete your profile before booking.");
    setScreen("editProfile");
    return;
  }
  setPendingBookingTarget(null);
  if (target === "ride" || target === "city" || target === "sharing" || target === "intercity") {
    setBookingMode("RIDE");
    setRideType(target === "sharing" ? "SHARING_RIDE" : target === "intercity" ? "INTERCITY_RIDE" : "CITY_RIDE");
    setPassengers(1);
    setScreen("location");
  } else if (target === "parcel") {
    setBookingMode("GOODS");
    setGoodsVehicle("PICKUP_TRUCK");
    setSelectedLogisticCatalogCode("");
    setGoodsType("Logistic Parcel");
    setParcelServiceType("FULL");
    setScreen("goods");
  } else if (target === "goods") {
    setBookingMode("GOODS");
    setGoodsVehicle("PICKUP_TRUCK");
    setGoodsType("Logistic Goods");
    setScreen("goods");
  } else {
    setBookingMode("EVENT");
    setEventDraft(null);
    setScreen("event");
  }
}

function openLocationPicker(
  target: "pickup" | "drop" | "stop" | "interchange" | "profileAddress",
  returnScreen: Screen,
) {
  setLocationTarget(target);
  setLocationReturnScreen(returnScreen);
  setLocationSearchTerm("");
  setScreen("location");
}

function applyLocationSelection(name: string, latitude: number, longitude: number) {
  if (!name.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    setMessage("Please select a valid location.");
    return;
  }
  const clean = name.trim();
  if (locationTarget === "pickup") {
    setPickup(clean);
    setPickupLat(latitude);
    setPickupLng(longitude);
  } else if (locationTarget === "drop") {
    setDrop(clean);
    setDropLat(latitude);
    setDropLng(longitude);
  } else if (locationTarget === "stop") {
    setStops((current) => [...current, clean]);
  } else if (locationTarget === "interchange") {
    setInterchangePoints((current) => [...current, clean]);
    setStops((current) => [...current, clean]);
  } else {
    setProfileAddress(clean);
  }
  setLocationSearchTerm("");
  setScreen(locationReturnScreen);
}

async function chooseParcelImage() {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setParcelImageUri(result.assets[0].uri);
    }
  } catch {
    setMessage("Unable to select parcel image.");
  }
}

const locationSearchResults = useMemo(() => {
  const term = locationSearchTerm.trim().toLowerCase();
  if (!term || !userLocation) return [];
  const combined = [
    ...quick.map((item) => ({
      id: `quick-${item.id}`,
      name: String(item.name || ""),
      address: String(item.address || ""),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
    })),
    ...savedLocations.map((item) => ({
      id: `saved-${item.id}`,
      name: String(item.label || ""),
      address: String(item.address || ""),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
    })),
    ...locationGeoResults.map((item, index) => ({
      id: `geo-${index}-${item.latitude}-${item.longitude}`,
      name: item.name,
      address: item.address,
      latitude: item.latitude,
      longitude: item.longitude,
    })),
  ];
  const seen = new Set<string>();
  return combined
    .filter((item) =>
      item.name.toLowerCase().startsWith(term) ||
      item.address.toLowerCase().startsWith(term) ||
      `${item.name} ${item.address}`.toLowerCase().includes(term)
    )
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map((item) => ({
      ...item,
      distanceKm: haversineKm(userLocation.latitude, userLocation.longitude, item.latitude, item.longitude),
    }))
    .filter((item) => item.distanceKm <= 60)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .filter((item) => {
      const key = `${item.name}|${item.latitude.toFixed(5)}|${item.longitude.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}, [locationSearchTerm, userLocation, quick, savedLocations, locationGeoResults]);

  async function loadCustomerProfile(customerIdOverride?: string): Promise<boolean> {
    const id = customerIdOverride || customerId;
    if (!id) return true;
    try {
      const response = await ridexFetch(`${API}/customer/${encodeURIComponent(id)}/profile`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success && data.data) {
        const fullName = String(data.data.fullName || "");
        setCustomerFullName(fullName);
        setCustomerEmail(String(data.data.email || ""));
        setMobile(String(data.data.mobile || mobile));
        await loadCustomerProfileExtras(id);
        const needsCompletion = !fullName.trim() || /^Customer \d{4}$/.test(fullName.trim()) || !String(data.data.address || "").trim() || !String(data.data.stateId || "").trim() || !String(data.data.cityId || "").trim() || !String(data.data.town || "").trim() || !String(data.data.nearBy || "").trim();
        setProfileNeedsCompletion(needsCompletion);
        return !needsCompletion;
      }
    } catch (error) { console.error("CUSTOMER PROFILE LOAD ERROR:", error); }
    return true;
  }

  async function uploadProfilePhotoIfNeeded(): Promise<string | null> {
    if (!customerId || !profilePhotoUri || /^https?:\/\//i.test(profilePhotoUri)) return null;
    try {
      const blob = await fetch(profilePhotoUri).then((response) => response.blob());
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onerror = () => reject(reader.error || new Error("File read failed"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(blob);
      });
      const response = await ridexFetch(`${API}/customer/${encodeURIComponent(customerId)}/gallery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: `ridex-profile-${Date.now()}.jpg`,
          mimeType: blob.type || "image/jpeg",
          base64: dataUrl,
          source: "LIBRARY",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success || !data?.data?.id) throw new Error(data?.message || "Unable to upload profile photo");
      setGalleryPhotos((current) => [{ id: String(data.data.id), uri: String(data.data.uri || profilePhotoUri), fileName: String(data.data.fileName || "profile.jpg"), mimeType: String(data.data.mimeType || blob.type || "image/jpeg") }, ...current].slice(0, 50));
      return String(data.data.id);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Unable to upload profile photo");
    }
  }

  async function saveCustomerProfile() {
    const completingInitialProfile = profileNeedsCompletion;
    if (!customerId || !customerFullName.trim()) {
      setMessage("Enter your full name.");
      return;
    }
    if (!profileAddress.trim() || !profileState.trim() || !profileCity.trim() || !profileTown.trim() || !profileNearBy.trim()) {
      setMessage("Please complete the full address: State, City, Town and Near By.");
      return;
    }
    try {
      setProfileSaving(true);
      const galleryPhotoId = await uploadProfilePhotoIfNeeded();
      const response = await ridexFetch(`${API}/customer/${encodeURIComponent(customerId)}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: customerFullName.trim(),
          email: customerEmail.trim(),
          address: profileAddress.trim(),
          state: profileState.trim(),
          city: profileCity.trim(),
          town: profileTown.trim(),
          nearBy: profileNearBy.trim(),
          ...(galleryPhotoId ? { galleryPhotoId } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setMessage(data?.message || "Unable to save profile.");
        return;
      }
      setCustomerFullName(String(data.data?.fullName || customerFullName));
      setCustomerEmail(String(data.data?.email || customerEmail));
      setProfileAddress(String(data.data?.address || profileAddress));
      setProfileState(String(data.data?.state || profileState));
      setProfileCity(String(data.data?.city || profileCity));
      setProfileTown(String(data.data?.town || profileTown));
      setProfileNearBy(String(data.data?.nearBy || profileNearBy));
      if (data.data?.photoUrl) setProfilePhotoUri(String(data.data.photoUrl));
      await saveCustomerProfileExtras();
      setProfileNeedsCompletion(false);
      const pending = pendingBookingTarget;
      setPendingBookingTarget(null);

      if (pending === "ride") {
        setBookingMode("RIDE");
        setRideType("CITY_RIDE");
        setPassengers(1);
        setScreen("location");
      } else if (pending === "parcel") {
        setBookingMode("GOODS");
        setGoodsVehicle("PICKUP_TRUCK");
      setSelectedLogisticCatalogCode("");
        setGoodsType("Logistic Parcel");
        setParcelServiceType("FULL");
        setScreen("goods");
      } else if (pending === "goods") {
        setBookingMode("GOODS");
        setGoodsVehicle("PICKUP_TRUCK");
        setGoodsType("Logistic Goods");
        setScreen("goods");
      } else if (pending === "event") {
        setBookingMode("EVENT");
        setEventDraft(null);
        setScreen("event");
      } else {
        // The locked first-access flow is OTP verification → Profile
        // Completion → required data save/confirm → Customer Home.
        setScreen(completingInitialProfile ? "home" : "profile");
      }
      setMessage(completingInitialProfile ? "Profile completed successfully. Welcome to RideX." : "Profile updated successfully.");
    } catch (error) {
      console.error("CUSTOMER PROFILE SAVE ERROR:", error);
      setMessage("Unable to save profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function loadWalletBalance() {
    if (!customerId) return;
    try {
      const response = await ridexFetch(`${API}/customer/${encodeURIComponent(customerId)}/wallet`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success) {
        const balance = Number(data?.data?.balance ?? 0);
        setWalletBalance(Number.isFinite(balance) ? balance : null);
        setWalletTransactions(Array.isArray(data?.data?.transactions) ? data.data.transactions : []);
        return;
      }
      setWalletTransactions([]);
    } catch (error) {
      console.error("CUSTOMER WALLET LOAD ERROR:", error);
      setWalletBalance(null);
      setWalletTransactions([]);
    }
  }

  async function loadSavedLocations() {
    if (!customerId) return;
    try {
      const response=await ridexFetch(`${API}/customer/${customerId}/saved-locations`);
      const data=await response.json();
      if (response.ok && data.success) setSavedLocations(Array.isArray(data.data) ? data.data : []);
    } catch(e) { console.error("SAVED LOCATIONS ERROR:",e); }
  }

  async function saveCurrentLocation(label: string) {
    if (!customerId || !pickup.trim()) { setMessage("Enter a location first."); return; }
    try {
      const response=await ridexFetch(`${API}/customer/${customerId}/saved-locations`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({label,address:pickup,latitude:pickupLat,longitude:pickupLng})});
      const data=await response.json();
      if (!response.ok || !data.success) { setMessage(data.message || "Unable to save location."); return; }
      await loadSavedLocations();
      setMessage(`${label} saved.`);
    } catch(e) { setMessage("Unable to save location."); }
  }

  async function deleteSavedLocation(id: string) {
    if (!customerId) return;
    try {
      await ridexFetch(`${API}/customer/${customerId}/saved-locations/${id}`,{method:"DELETE"});
      await loadSavedLocations();
    } catch(e) { setMessage("Unable to delete saved location."); }
  }

  async function loadQuick(category = "") {
    try {
      setLoading(true);

      const url = new URL(`${API}/quick-locations/`);
      url.searchParams.set("lat", String(pickupLat));
      url.searchParams.set("lng", String(pickupLng));

      if (category) {
        url.searchParams.set("category", category);
      }

      const response = await ridexFetch(url.toString());
      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(
          data.message || "Quick Locations unavailable."
        );
        return;
      }

      setQuick(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error("QUICK LOCATION ERROR:", error);
      setMessage("Quick Locations unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const term = locationSearchTerm.trim();
    if (screen !== "location" || !term || !userLocation) {
      setLocationGeoResults([]);
      return () => { cancelled = true; };
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const matches = await Location.geocodeAsync(term);
          if (cancelled) return;
          setLocationGeoResults(
            matches
              .map((item:any) => ({
                name: String(item?.name || item?.street || item?.city || item?.district || term),
                address: [item?.name, item?.street, item?.district, item?.city, item?.region, item?.postalCode]
                  .filter((part:any, index:number, arr:any[]) => part && arr.indexOf(part) === index)
                  .join(", "),
                latitude: Number(item?.latitude),
                longitude: Number(item?.longitude),
              }))
              .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)),
          );
        } catch {
          if (!cancelled) setLocationGeoResults([]);
        }
      })();
      void loadQuick("");
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [screen, locationSearchTerm, userLocation]);

  async function selectDestinationFromMap(latitude: number, longitude: number) {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      const place = results?.[0];
      const parts = [place?.name, place?.street, place?.district, place?.city, place?.region, place?.postalCode]
        .filter((part, index, arr) => part && arr.indexOf(part) === index);
      if (locationTarget === "profileAddress") {
        setProfileAddress(parts.join(", ") || "Selected location");
        setProfileState(String(place?.region || ""));
        setProfileCity(String(place?.city || place?.subregion || ""));
        setProfileTown(String(place?.subregion || place?.district || place?.city || ""));
        setProfileNearBy(String(place?.name || place?.street || place?.district || ""));
        setLocationSearchTerm("");
        setScreen(locationReturnScreen);
      } else {
        applyLocationSelection(parts.join(", ") || "Selected location", latitude, longitude);
      }
    } catch (error) {
      console.error("CUSTOMER LOCATION REVERSE GEOCODE ERROR:", error);
      applyLocationSelection("Selected location", latitude, longitude);
    }
  }

  function normalizeLocationArea(value: unknown) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  async function reverseGeocodeForCompatibility(latitude: number, longitude: number) {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    const place = places?.[0];
    return {
      city: String(place?.city || place?.subregion || place?.district || "").trim(),
      state: String(place?.region || "").trim(),
    };
  }

  async function validateLocationCompatibility() {
    if (bookingMode === "EVENT") return true;

    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng) || !Number.isFinite(dropLat) || !Number.isFinite(dropLng)) {
      setLocationCompatibility((current) => ({ ...current, status: "INVALID", reason: "Both pickup and destination coordinates are required for compatibility validation." }));
      return false;
    }

    try {
      const [pickupArea, dropArea] = await Promise.all([
        reverseGeocodeForCompatibility(pickupLat, pickupLng),
        reverseGeocodeForCompatibility(dropLat, dropLng),
      ]);

      setLocationCompatibility({
        status: "VALID",
        pickupCity: pickupArea.city,
        pickupState: pickupArea.state,
        dropCity: dropArea.city,
        dropState: dropArea.state,
        reason: "City compatibility validated locally. Active RideX service-zone eligibility remains backend-authoritative.",
      });

      const pickupCity = normalizeLocationArea(pickupArea.city);
      const dropCity = normalizeLocationArea(dropArea.city);

      if ((bookingMode === "RIDE" && (rideType === "CITY_RIDE" || rideType === "SHARING_RIDE")) || bookingMode === "GOODS") {
        if (pickupCity && dropCity && pickupCity !== dropCity) {
          const message = "Pickup and destination are in different cities. Select InterCity Ride for an intercity journey.";
          setLocationCompatibility((current) => ({ ...current, status: "INVALID", reason: message }));
          setMessage(message);
          return false;
        }
      }

      if (bookingMode === "RIDE" && rideType === "SHARING_RIDE") {
        const route = getSelectedSharedRoute();
        const routeCity = normalizeLocationArea(route?.city);
        if (routeCity && pickupCity && routeCity !== pickupCity) {
          const message = `Selected Sharing Route is for ${route?.city}, but pickup is in ${pickupArea.city || "another city"}.`;
          setLocationCompatibility((current) => ({ ...current, status: "INVALID", reason: message }));
          setMessage(message);
          return false;
        }
        if (routeCity && dropCity && routeCity !== dropCity) {
          const message = `Selected Sharing Route is for ${route?.city}, but destination is in ${dropArea.city || "another city"}.`;
          setLocationCompatibility((current) => ({ ...current, status: "INVALID", reason: message }));
          setMessage(message);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.warn("CUSTOMER LOCATION COMPATIBILITY REVERSE GEOCODE ERROR:", error);
      setLocationCompatibility((current) => ({
        ...current,
        status: "UNKNOWN",
        reason: "City compatibility could not be resolved locally. RideX backend will remain authoritative at booking confirmation.",
      }));
      return true;
    }
  }

  async function continueFromLocation() {
    if (!isProfileActuallyComplete()) {
      setMessage("Please complete your profile before booking a ride.");
      setScreen("editProfile");
      return;
    }
    if (!pickup.trim()) {
      setMessage("Please enter pickup location.");
      return;
    }

    if (!drop.trim() || !Number.isFinite(dropLat) || !Number.isFinite(dropLng)) {
      setMessage("Please select a destination on the map or choose a saved/quick location.");
      return;
    }

    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
      setMessage("Please set your current pickup location first.");
      return;
    }

    setLoading(true);
    try {
      const compatible = await validateLocationCompatibility();
      if (!compatible) return;
      setMessage("");
      setScreen("rideType");
    } finally {
      setLoading(false);
    }
  }

  function validateScheduledPickup() {
    if (!scheduled) return null;
    if (bookingMode === "EVENT") return null;

    const parsed = makeScheduledIso(scheduleDate, scheduleTime, schedulePeriod);
    if (!parsed) {
      setMessage("Use a valid date, time and AM/PM.");
      return false;
    }

    const now = Date.now();
    if (parsed.getTime() < now + 5 * 60 * 1000) {
      setMessage("Scheduled time must be at least 5 minutes from now.");
      return false;
    }
    if (parsed.getTime() > now + 72 * 60 * 60 * 1000) {
      setMessage("Scheduled time can be selected only within the next 72 hours.");
      return false;
    }
    return parsed;
  }

  async function calculate() {
    if (!isProfileActuallyComplete()) {
      setPendingBookingTarget(bookingMode === "GOODS" ? (goodsType === "Logistic Parcel" ? "parcel" : "goods") : bookingMode === "EVENT" ? "event" : "ride");
      setMessage("Please complete your profile before booking a ride.");
      setScreen("editProfile");
      return;
    }
    if (!pickup.trim()) {
      setMessage("Please select pickup location.");
      return;
    }

    if (!drop.trim()) {
      setMessage("Please select drop location.");
      return;
    }

    if (
      bookingMode === "RIDE" &&
      (rideType === "SHARING_RIDE" ||
        rideType === "INTERCITY_RIDE") &&
      (passengers < 1 || passengers > passengerMaximum)
    ) {
      setMessage(`Maximum ${passengerMaximum} passengers for the selected vehicle.`);
      return;
    }

    if (bookingMode === "RIDE" && rideType === "SHARING_RIDE") {
      const route = getSelectedSharedRoute();
      const pickupPoint = getSelectedSharedPickupPoint();
      const dropPoint = getSelectedSharedDropPoint();

      if (!route || !pickupPoint || !dropPoint) {
        setMessage("Please select an active Sharing Route, pickup point and drop point.");
        return;
      }
      if (pickupPoint.sequence >= dropPoint.sequence) {
        setMessage("Sharing Ride drop point must come after pickup point.");
        return;
      }
    }

    if (bookingMode === "GOODS" && !goodsType.trim()) {
      setMessage("Please select Logistic Parcel or Logistic Goods.");
      return;
    }
    if (bookingMode === "GOODS" && goodsType.trim() === "Logistic Parcel") {
      const activeParcelRows =
        parcelServiceType === "FULL" ? parcelRows : parcelRows.slice(0, 1);
      if (!activeParcelRows.length) {
        setMessage("Please add at least one parcel.");
        return;
      }

      const totalParcelWeightKg = activeParcelRows.reduce((sum, row) => {
        const kg = Number(row.weight);
        return sum + (Number.isFinite(kg) ? kg : 0);
      }, 0);

      if (
        activeParcelRows.some((row) => {
          const kg = Number(row.weight);
          return !Number.isFinite(kg) || kg < 1 || kg > 300;
        })
      ) {
        setMessage("Each parcel weight must be between 1 kg and 300 kg.");
        return;
      }

      if (totalParcelWeightKg > 300) {
        setMessage(
          "Combined parcel weight must not exceed 300 kg for one booking.",
        );
        return;
      }

      setGoodsVehicle("PICKUP_TRUCK");
      setSelectedLogisticCatalogCode("");
    }
    if (bookingMode === "GOODS" && goodsType.trim() !== "Logistic Parcel") {
      setGoodsVehicle("PICKUP_TRUCK");
    }

    if (scheduled && !validateScheduledPickup()) {
      return;
    }

    setLoading(true);
    try {
      const compatible = await validateLocationCompatibility();
      if (!compatible) return;
    } finally {
      setLoading(false);
    }

    setFare(0);
    setFareIsAuthoritative(false);
    setRouteDistanceKm(0);
    setRouteDurationMinutes(0);
    setRouteGeometry(null);
    setMessage("");
    setScreen("fare");
  }

  async function resolveStopsForBooking(addresses: string[]) {
    const cleaned = addresses.map((value) => value.trim()).filter(Boolean);
    if (!cleaned.length) return [];
    const resolved: Array<{address: string; lat: number; lng: number}> = [];
    for (const address of cleaned) {
      try {
        const matches = await Location.geocodeAsync(address);
        const point = matches?.[0];
        if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
          throw new Error(`Unable to locate stop: ${address}`);
        }
        resolved.push({ address, lat: point.latitude, lng: point.longitude });
      } catch (error) {
        throw new Error(`Unable to locate stop: ${address}`);
      }
    }
    return resolved;
  }

  async function book() {
    if (bookingMode === "EVENT") {
      if (!isProfileActuallyComplete()) {
        setPendingBookingTarget("event");
        setMessage("Please complete your profile before booking an event ride.");
        setScreen("editProfile");
        return;
      }
    if (!customerId) {
        setMessage("Customer session not found. Please login again.");
        setScreen("login");
        return;
      }
      if (!eventDraft) {
        setMessage("Please select an event, session, starting stop and ending stop.");
        setScreen("event");
        return;
      }
      try {
        if (eventAvailabilityLoading) {
          setMessage("Checking currently available Event Ride vehicles…");
          return;
        }
        if (!selectedEventVehicle) {
          setMessage(eventAvailabilityMessage || "No eligible Event Ride vehicle is currently available for the selected stop and passenger count.");
          return;
        }
        setLoading(true);
        setMessage("Creating Event / Sessional booking...");
        if (!eventBookingIdempotencyKeyRef.current) {
          eventBookingIdempotencyKeyRef.current = `customer-event-booking-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
        }
        const response = await ridexFetch(`${API}${RIDEX_EVENT_API.booking}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": eventBookingIdempotencyKeyRef.current,
          },
          body: JSON.stringify({
            eventId: eventDraft.eventId,
            sessionId: eventDraft.sessionId,
            startStopId: eventDraft.startStopId,
            endStopId: eventDraft.endStopId,
            vehicleCatalogCode: selectedEventVehicle?.code,
            passengerCount: clampPassengerCount(passengers),
            paymentPreference: paymentMethod,
          }),
        });
        const data: any = await response.json().catch(() => ({}));
        if (!response.ok || data?.success === false) {
          setMessage(data?.message || "Event booking failed. Please retry after refreshing Event Ride availability.");
          return;
        }
        const booking = data?.data?.booking || data?.data;
        if (!booking?.id) { setMessage("Event booking response did not include a booking ID."); return; }
        setBookingId(String(booking.id));
        setBookingStatus(String(booking.status || "NEW"));
        const eventBackendFare = Number(booking.finalFare ?? booking.estimatedFare);
        setFare(Number.isFinite(eventBackendFare) ? eventBackendFare : 0);
        setFareIsAuthoritative(Number.isFinite(eventBackendFare));
        const activeLeg = Array.isArray(booking.legs) ? (booking.legs.find((leg: any) => !["COMPLETED", "CANCELLED"].includes(String(leg.status))) || booking.legs[0]) : null;
        if (activeLeg?.id) setActiveLegId(String(activeLeg.id));
        await AsyncStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, JSON.stringify({ customerId, bookingId: booking.id, bookingStatus: booking.status || "NEW", bookingType: "EVENT", eventDraft }));
        setScreen("confirmed");
        setMessage("Event / Sessional booking created successfully.");
      } catch (error) {
        console.error("EVENT BOOKING ERROR:", error);
        setMessage("Unable to reach the RideX Event booking service. Please retry.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!isProfileActuallyComplete()) {
      setPendingBookingTarget(bookingMode === "GOODS" ? (goodsType === "Logistic Parcel" ? "parcel" : "goods") : "ride");
      setMessage("Please complete your profile before booking a ride.");
      setScreen("editProfile");
      return;
    }
    if (!customerId) {
      setMessage("Customer session not found. Please login again.");
      setScreen("login");
      return;
    }

    if (!pickup.trim() || !drop.trim()) {
      setMessage("Please enter pickup and drop locations.");
      return;
    }

    if (
      bookingMode === "RIDE" &&
      (rideType === "SHARING_RIDE" ||
        rideType === "INTERCITY_RIDE") &&
      (passengers < 1 || passengers > passengerMaximum)
    ) {
      setMessage(`Maximum ${passengerMaximum} passengers for the selected vehicle.`);
      return;
    }

    if (bookingMode === "GOODS" && !goodsType.trim()) {
      setMessage("Please select Logistic Parcel or Logistic Goods.");
      return;
    }
    let parcelTotalWeightKg = 0;
    if (bookingMode === "GOODS" && goodsType.trim() === "Logistic Parcel") {
      const activeParcelRows = parcelServiceType === "FULL" ? parcelRows : parcelRows.slice(0, 1);
      if (!activeParcelRows.length) { setMessage("Please add at least one parcel."); return; }
      const weights = activeParcelRows.map((row) => Number(row.weight));
      if (weights.some((kg) => !Number.isFinite(kg) || kg < 1 || kg > 300)) {
        setMessage("Each parcel weight must be between 1 kg and 300 kg.");
        return;
      }
      parcelTotalWeightKg = weights.reduce((sum, kg) => sum + kg, 0);
      if (parcelTotalWeightKg > 300) {
        setMessage("Combined parcel weight must not exceed 300 kg for one booking.");
        return;
      }
      setGoodsVehicle("PICKUP_TRUCK");
      setSelectedLogisticCatalogCode("");
    }
    if (bookingMode === "GOODS" && goodsType.trim() !== "Logistic Parcel") {
      setGoodsVehicle("PICKUP_TRUCK");
    }

    const scheduledDate = scheduled
      ? validateScheduledPickup()
      : null;

    if (scheduled && !scheduledDate) {
      return;
    }

    try {
      setLoading(true);
      setMessage("Creating booking...");

      const effectivePassengerCount =
        bookingMode === "RIDE"
          ? rideType === "CITY_RIDE"
            ? 1
            : clampPassengerCount(passengers)
          : bookingMode === "GOODS"
            ? 1
            : clampPassengerCount(passengers);

      const routeStopAddresses = [...stops, ...interchangePoints.filter((point) => !stops.includes(point))];
      const resolvedStops = await resolveStopsForBooking(routeStopAddresses);

      const body: any = {
        customerId,
        bookingType: bookingMode,
        rideType:
          bookingMode === "RIDE" ? rideType : null,
        pickupAddress: pickup.trim(),
        pickupLat: Number(pickupLat),
        pickupLng: Number(pickupLng),
        dropAddress: drop.trim(),
        dropLat: Number(dropLat),
        dropLng: Number(dropLng),
        passengerCount:
          bookingMode === "RIDE" && rideType === "CITY_RIDE"
            ? undefined
            : effectivePassengerCount,
        vehicleCatalogCode: (bookingMode === "RIDE" || bookingMode === "EVENT") ? (selectedPassengerVehicle?.code || undefined) : undefined,
        paymentMethod,
        paymentPreference: paymentMethod,
        durationMinutes:
          bookingMode === "GOODS" ||
          (bookingMode === "RIDE" && rideType === "CITY_RIDE")
            ? Number(durationMinutes || 0)
            : 0,
        specialInstructions: specialInstructions.trim() || undefined,
        stops: resolvedStops,
        timezone: TIMEZONE,
        isScheduled: Boolean(scheduled),
        pickupDatetime:
          scheduled && scheduledDate
            ? scheduledDate.toISOString()
            : undefined,
        couponCode: couponCode.trim() || undefined,
      };

      if (bookingMode === "RIDE" && rideType === "SHARING_RIDE") {
        body.sharedRouteId = sharedRouteId;
        body.sharedPickupPointId = sharedPickupPointId;
        body.sharedDropPointId = sharedDropPointId;
      }

      if (bookingMode === "GOODS") {
        Object.assign(body, {
          goodsVehicleType: "PICKUP_TRUCK",
          goodsType: goodsType.trim(),
          vehicleCatalogCode: selectedLogisticVehicle?.code || undefined,
          parcelServiceSubtype: goodsType.trim() === "Logistic Parcel" ? (parcelServiceType === "FULL" ? "CITY_LOGISTIC_PARCEL" : "QUICK_LOGISTIC_PARCEL") : undefined,
          goodsWeightKg: goodsType.trim() === "Logistic Parcel"
            ? parcelTotalWeightKg
            : Number(weight || 0),
          goodsSize: size,
          receiverName: receiverName.trim(),
          receiverMobile: receiverMobile.trim(),
          waitingMinutes: Number(waiting || 0),
          serviceSubtype: goodsType.trim() === "Logistic Parcel" ? "PARCEL" : "GOODS",
          goodsDescription: goodsDescription.trim() || undefined,
          parcelItems: goodsType.trim() === "Logistic Parcel"
            ? (parcelServiceType === "FULL" ? parcelRows : parcelRows.slice(0,1)).filter(row => Number(row.weight) >= 1).map((row, index) => ({
                description: row.description || `Logistic Parcel ${index + 1}`,
                weightKg: Number(row.weight),
                pickupAddress: pickup.trim(),
                pickupLat: Number(pickupLat), pickupLng: Number(pickupLng),
                dropAddress: drop.trim(), dropLat: Number(dropLat), dropLng: Number(dropLng),
              }))
            : undefined,
        });
      }


      if (!bookingIdempotencyKeyRef.current) {
        bookingIdempotencyKeyRef.current = `customer-booking-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
      }

      const response = await ridexFetch(`${API}/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": bookingIdempotencyKeyRef.current,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Booking failed.");
        return;
      }

      const booking = data.data?.booking;
      if (!booking?.id) {
        setMessage("Booking ID not received.");
        return;
      }

      const newBookingStatus = String(booking.status || "NEW").toUpperCase();
      const matchingResult = data?.data?.matching ?? null;
      const matchingResultReason = String(matchingResult?.reason || "").trim().toUpperCase();
      const assignedDriverId = String(booking.assignedDriverId || "").trim();
      const returnedPickupDatetime = String(
        booking.pickupDatetime || (scheduled ? makeScheduledIso(scheduleDate, scheduleTime, schedulePeriod)?.toISOString() || "" : ""),
      );

      setScheduledPickupText(returnedPickupDatetime);

      let nextMatchingState: CustomerMatchingState;
      if (assignedDriverId) {
        nextMatchingState =
          newBookingStatus === "DRIVER_ARRIVED"
            ? "ARRIVED"
            : newBookingStatus === "STARTED" || newBookingStatus === "IN_PROGRESS"
              ? "IN_PROGRESS"
              : "ASSIGNED";
      } else if (newBookingStatus === "UPCOMING" || Boolean(scheduled)) {
        nextMatchingState = "SCHEDULED";
      } else if (matchingResult?.matched === true) {
        nextMatchingState = "OFFERED";
      } else if (matchingResult?.matched === false && isCustomerNoMatchReason(matchingResultReason)) {
        nextMatchingState = "NO_MATCH";
      } else {
        nextMatchingState = "SEARCHING";
      }

      setBookingId(booking.id);
      setBookingStatus(newBookingStatus);
      setMatchingState(nextMatchingState);
      setMatchingReason(matchingResultReason);
      setDriverId(assignedDriverId);
      if (String(booking?.rideType || "").toUpperCase() === "SHARING_RIDE") {
        setSharedRouteId(String(booking?.sharedRouteId || sharedRouteId));
        setSharedPickupPointId(String(booking?.sharedPickupPointId || sharedPickupPointId));
        setSharedDropPointId(String(booking?.sharedDropPointId || sharedDropPointId));
      } else {
        clearSharedRideSelection();
      }

      if (booking?.rideType === "SHARING_RIDE") {
        setSharedRouteId(String(booking?.sharedRouteId || sharedRouteId || ""));
        setSharedPickupPointId(String(booking?.sharedPickupPointId || sharedPickupPointId || ""));
        setSharedDropPointId(String(booking?.sharedDropPointId || sharedDropPointId || ""));
      } else {
        clearSharedRideSelection();
      }

      const authoritativeFare = Number(
        booking.finalFare ?? booking.estimatedFare,
      );
      setFare(Number.isFinite(authoritativeFare) ? authoritativeFare : 0);
      setFareIsAuthoritative(Number.isFinite(authoritativeFare));

      const backendCouponDiscount = Number(booking.couponDiscount ?? 0);
      setCouponDiscount(Number.isFinite(backendCouponDiscount) ? Math.max(0, backendCouponDiscount) : 0);
      setCouponMessage(
        backendCouponDiscount > 0
          ? "Promo discount applied by RideX."
          : couponCode.trim()
            ? "Promo code was validated by RideX."
            : "",
      );

      const backendPaymentMethod = String(
        booking.paymentPreference ?? booking.payment?.method ?? "",
      ).toUpperCase();
      if (backendPaymentMethod === "CASH" || backendPaymentMethod === "UPI" || backendPaymentMethod === "WALLET") {
        setPaymentMethod(backendPaymentMethod as PaymentMethod);
      }

      setRouteDistanceKm(Number(data.data?.route?.distanceKm ?? 0));
      setRouteDurationMinutes(Number(data.data?.route?.durationMinutes ?? 0));
      const freshGeometry = booking?.routes?.[0]?.geometry;
      setRouteGeometry(Array.isArray(freshGeometry?.coordinates) ? freshGeometry.coordinates : null);
      const createdLeg = Array.isArray(booking.legs) ? (booking.legs.find((leg:any)=>!['COMPLETED','CANCELLED'].includes(String(leg.status))) || booking.legs[0]) : null;
      if (createdLeg?.id) setActiveLegId(String(createdLeg.id));

      try {
        await AsyncStorage.setItem(
          CUSTOMER_SESSION_STORAGE_KEY,
          JSON.stringify({
            customerId,
            bookingId: booking.id,
            bookingStatus: newBookingStatus,
            matchingState: nextMatchingState,
            matchingReason: matchingResultReason || null,
            scheduledPickupText: returnedPickupDatetime || null,
            sharedRouteId: booking?.sharedRouteId || null,
            sharedPickupPointId: booking?.sharedPickupPointId || null,
            sharedDropPointId: booking?.sharedDropPointId || null,
          })
        );
      } catch (error) {
        console.error("CUSTOMER BOOKING SESSION SAVE ERROR:", error);
      }


      setScreen("confirmed");
      setMessage(
        nextMatchingState === "NO_MATCH"
          ? customerMatchingReasonText(matchingResultReason)
          : nextMatchingState === "OFFERED"
            ? "Driver offer sent. Waiting for the driver to accept."
            : scheduled
              ? "Scheduled City Ride created successfully."
              : "Booking created successfully."
      );
    } catch (error) {
      console.error("BOOKING ERROR:", error);
      setMessage("Backend not reachable. Check API URL.");
    } finally {
      setLoading(false);
    }
  }

  async function callAssignedDriver() {
    if (!bookingId || !driverId) {
      setMessage("Driver contact is not available.");
      return;
    }
    try {
      setLoading(true);
      const response = await ridexFetch(`${API}/calls/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setMessage(data?.message || "Protected calling is unavailable.");
        return;
      }
      if (data?.data?.actualVoiceReady && data?.data?.dialUrl) {
        await Linking.openURL(String(data.data.dialUrl));
      } else {
        setMessage(String(data?.data?.message || "RideX protected call session created. Live voice provider is not configured in this environment."));
      }
    } catch (error) {
      console.error("CUSTOMER MASKED CALL ERROR:", error);
      setMessage("Unable to start protected call.");
    } finally {
      setLoading(false);
    }
  }

  const CUSTOMER_CANCEL_PURPOSE = "CUSTOMER.BOOKING.CANCEL";
  const CUSTOMER_END_RIDE_PURPOSE = "CUSTOMER.RIDE.TRIP_END";

  function protectedOtpConfig(action: "CANCEL" | "END") {
    return action === "END"
      ? {
          purposeCode: CUSTOMER_END_RIDE_PURPOSE,
          title: "Secure Ride End",
          subtitle: "RideX requires OTP verification before this active ride can be ended early.",
          fieldLabel: "4-Digit Ride End OTP",
          verifyTitle: "Verify & End Ride",
          successText: "Ride end request sent successfully.",
        }
      : {
          purposeCode: CUSTOMER_CANCEL_PURPOSE,
          title: "Secure Ride Cancellation",
          subtitle: "RideX requires OTP verification before this active ride can be cancelled.",
          fieldLabel: "4-Digit Cancellation OTP",
          verifyTitle: "Verify & Cancel Ride",
          successText: "Ride cancelled successfully.",
        };
  }

  async function requestProtectedOtp(action: "CANCEL" | "END", resend = false) {
    if (!bookingId || !customerId) {
      setMessage("Customer ride session is not available.");
      return false;
    }
    if (resend && protectedOtpResendCountdown > 0) {
      setProtectedOtpMessage(`Please wait ${protectedOtpResendCountdown} seconds before resending.`);
      return false;
    }

    const config = protectedOtpConfig(action);

    try {
      setProtectedOtpBusy(true);
      setProtectedOtpMessage(resend ? "Resending protected OTP..." : "Sending protected OTP...");
      const response = await ridexFetch(`${API}/auth/${resend ? "resend-otp" : "send-otp"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorType: "CUSTOMER",
          actorId: customerId,
          purposeCode: config.purposeCode,
        }),
      });
      const data = await response.json().catch(() => ({}));

      const attemptsRemaining = Number(data?.attemptsRemaining);
      if (Number.isFinite(attemptsRemaining) && attemptsRemaining >= 0) {
        setProtectedOtpAttemptsRemaining(Math.min(5, Math.floor(attemptsRemaining)));
      }

      if (!response.ok || !data?.success) {
        const retryAfterSeconds = Number(data?.retryAfterSeconds ?? data?.resendAfterSeconds ?? 0);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          setProtectedOtpResendAvailableAt(Date.now() + retryAfterSeconds * 1000);
        }
        setProtectedOtpMessage(data?.message || "Unable to send protected OTP.");
        return false;
      }

      setProtectedOtp("");
      const resendAfterSeconds = Number(data?.resendAfterSeconds ?? 0);
      if (Number.isFinite(resendAfterSeconds) && resendAfterSeconds > 0) {
        setProtectedOtpResendAvailableAt(Date.now() + resendAfterSeconds * 1000);
      }
      if (RIDEX_TEST_MODE && data?.testOtp) {
        setProtectedOtp(String(data.testOtp));
        setProtectedOtpMessage(`TEST OTP generated for ${action === "END" ? "ride end" : "cancellation"}. Verify it to continue.`);
      } else {
        setProtectedOtpMessage(`${action === "END" ? "Ride end" : "Cancellation"} OTP sent. Enter the 4-digit code to continue.`);
      }
      return true;
    } catch (error) {
      console.error("CUSTOMER PROTECTED OTP REQUEST ERROR:", error);
      setProtectedOtpMessage("Unable to reach RideX service.");
      return false;
    } finally {
      setProtectedOtpBusy(false);
    }
  }

  async function reconcileCustomerProtectedMutationOutcome(action: "CANCEL" | "END") {
    const requestedBookingId = String(bookingId || "").trim();
    if (!requestedBookingId) {
      setMessage("RideX could not identify the booking to reconcile. Refresh your booking before taking further action.");
      return;
    }

    try {
      const response = await ridexFetch(`${API}/bookings/${encodeURIComponent(requestedBookingId)}`);
      const data = await response.json().catch(() => ({}));
      const booking = data?.data;
      if (!response.ok || !data?.success || !booking) {
        setMessage("The action response was lost and RideX could not confirm the current booking status. Refresh status before trying again.");
        return;
      }

      const status = String(booking.status || "UNKNOWN").trim().toUpperCase();
      setBookingStatus(status);
      if (action === "CANCEL" && status === "CANCELLED") {
        setCancelReviewOpen(false);
        setDriverLocation(null);
        setDriverDistanceKm(null);
        setScreen("rebook");
        setMessage("RideX confirmed that the ride was cancelled.");
        await loadWalletBalance();
        return;
      }
      if (action === "END" && status === "COMPLETED") {
        setPaymentStatus(String(booking.payment?.status || booking.paymentStatus || "PENDING").toUpperCase());
        setDriverLocation(null);
        setDriverDistanceKm(null);
        setScreen("payment");
        setMessage("RideX confirmed that the ride has ended. Check the payment status before taking further action.");
        return;
      }

      // Do not automatically replay a one-time protected OTP grant after a
      // transport failure. It may already have been consumed server-side.
      setMessage(`RideX reports booking status ${status}, but the requested action is not confirmed. Do not retry with the same OTP; refresh status before requesting a new verification code.`);
    } catch {
      setMessage("The action outcome is still unknown because RideX status could not be reached. Do not retry the protected action until the booking status is confirmed.");
    }
  }

  async function performCustomerCancel(otpVerificationGrant: string) {
    if (!bookingId) return;
    const reasonOption = CUSTOMER_CANCEL_REASON_OPTIONS.find((item) => item.id === selectedCancelReason);
    const reason = reasonOption?.label || "Cancelled by customer";
    try {
      setLoading(true);
      const response = await ridexFetch(`${API}/bookings/${encodeURIComponent(bookingId)}/customer-cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId, reason, otpVerificationGrant }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) { setMessage(data.message || "Unable to cancel ride."); return; }
      setCancelReviewOpen(false);
      setMessage("Ride cancelled successfully.");
      await fetchBooking();
      await loadWalletBalance();
    } catch (error) {
      console.error("CUSTOMER CANCEL ACTIVE BOOKING ERROR:", error);
      setMessage("Cancellation response was lost. Checking the authoritative booking status...");
      await reconcileCustomerProtectedMutationOutcome("CANCEL");
    }
    finally { setLoading(false); }
  }

  async function performCustomerEndRide(otpVerificationGrant: string) {
    if (!bookingId) return;

    try {
      setLoading(true);
      setMessage("Ending ride...");

      const response = await ridexFetch(
        `${API}/bookings/${encodeURIComponent(bookingId)}/customer-end`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId,
            reason: "Customer requested to end the ride early",
            otpVerificationGrant,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Unable to end ride.");
        return;
      }

      setMessage("Ride end request sent successfully.");
      await fetchBooking();
    } catch (error) {
      console.error("CUSTOMER END RIDE ERROR:", error);
      setMessage("Ride-end response was lost. Checking the authoritative booking status...");
      await reconcileCustomerProtectedMutationOutcome("END");
    } finally {
      setLoading(false);
    }
  }

  async function verifyProtectedOtp() {
    if (!bookingId || !customerId || !protectedOtpAction) return;
    const normalizedOtp = protectedOtp.replace(/\D/g, "").slice(0, 4);
    if (protectedOtpAttemptsRemaining === 0) {
      setProtectedOtpMessage("This OTP is no longer valid. Request a new OTP.");
      return;
    }
    if (normalizedOtp.length !== 4) {
      setProtectedOtpMessage("Please enter the 4-digit protected OTP.");
      return;
    }

    const config = protectedOtpConfig(protectedOtpAction);

    try {
      setProtectedOtpBusy(true);
      setProtectedOtpMessage("Verifying protected OTP...");
      const response = await ridexFetch(`${API}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorType: "CUSTOMER",
          actorId: customerId,
          purposeCode: config.purposeCode,
          otp: normalizedOtp,
          actionContextId: bookingId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.success) {
        const failedAttemptsRemaining = Number(data?.attemptsRemaining);
        if (Number.isFinite(failedAttemptsRemaining) && failedAttemptsRemaining >= 0) {
          setProtectedOtpAttemptsRemaining(Math.min(5, Math.floor(failedAttemptsRemaining)));
        }
        setProtectedOtpMessage(data?.message || "Invalid protected OTP.");
        return;
      }
      const otpVerificationGrant = String(data?.data?.otpVerificationGrant ?? "");
      if (!/^[A-Za-z0-9_-]{43}$/.test(otpVerificationGrant)) {
        setProtectedOtpMessage("Verification succeeded but the secure action grant was not returned. Request a new OTP.");
        return;
      }
      setProtectedOtpAttemptsRemaining(null);

      const nextAction = protectedOtpAction;
      setProtectedOtpOpen(false);
      setProtectedOtpAction(null);
      setProtectedOtp("");
      setProtectedOtpMessage("");
      setProtectedOtpResendAvailableAt(null);

      if (nextAction === "END") {
        await performCustomerEndRide(otpVerificationGrant);
      } else {
        await performCustomerCancel(otpVerificationGrant);
      }
    } catch (error) {
      console.error("CUSTOMER PROTECTED OTP VERIFY ERROR:", error);
      setProtectedOtpMessage("Protected OTP verification failed.");
    } finally {
      setProtectedOtpBusy(false);
    }
  }

  async function cancelActiveBooking() {
    if (!bookingId || !customerId) return;
    setCancelReviewOpen(true);
    setSelectedCancelReason((current) => current || "DRIVER_LATE");
    // The supplied customer-cancel backend contract does not expose a verified
    // cancellation-fee preview field, so the UI must not invent a charge.
    setCancelFeePreview(null);
    setCancelFeePreviewAvailable(false);
  }

  async function continueCancellationToOtp() {
    if (!bookingId || !customerId) return;
    setCancelReviewOpen(false);
    setProtectedOtpAction("CANCEL");
    setProtectedOtpOpen(true);
    setProtectedOtp("");
    setProtectedOtpMessage("");
    setProtectedOtpResendAvailableAt(null);
    setProtectedOtpAttemptsRemaining(null);
    await requestProtectedOtp("CANCEL", false);
  }

  async function customerEndRide() {
    if (!bookingId || !customerId) return;
    setProtectedOtpAction("END");
    setProtectedOtpOpen(true);
    setProtectedOtp("");
    setProtectedOtpMessage("");
    setProtectedOtpResendAvailableAt(null);
    setProtectedOtpAttemptsRemaining(null);
    await requestProtectedOtp("END", false);
  }

  async function fetchBooking(): Promise<string> {
    const requestedBookingId = String(bookingId || "").trim();
    if (!requestedBookingId) return "";

    const refreshSeq = ++bookingRefreshSeqRef.current;

    try {
      const response = await ridexFetch(
        `${API}/bookings/${requestedBookingId}`
      );
      const data = await response.json().catch(() => ({}));

      if (refreshSeq !== bookingRefreshSeqRef.current) return "";
      if (!response.ok || !data.success) return "";

      const booking = data.data;
      if (!booking) return "";

      const nextStatus = String(booking.status || "NEW").toUpperCase();
      const bookingPickupDatetime = String(booking.pickupDatetime || "");
      if (bookingPickupDatetime) {
        setScheduledPickupText(bookingPickupDatetime);
      }

      let nextMatchingState: CustomerMatchingState = matchingState;
      if (nextStatus === "COMPLETED") {
        nextMatchingState = "COMPLETED";
      } else if (nextStatus === "CANCELLED") {
        nextMatchingState = "CANCELLED";
      } else if (nextStatus === "UPCOMING") {
        nextMatchingState = "SCHEDULED";
      } else if (booking.assignedDriverId) {
        nextMatchingState =
          nextStatus === "DRIVER_ARRIVED"
            ? "ARRIVED"
            : nextStatus === "STARTED" || nextStatus === "IN_PROGRESS"
              ? "IN_PROGRESS"
              : "ASSIGNED";
      } else if (
        nextMatchingState !== "NO_MATCH" &&
        nextMatchingState !== "OFFERED"
      ) {
        nextMatchingState = "SEARCHING";
      }

      setBookingStatus(nextStatus);
      setMatchingState(nextMatchingState);

      if (String(booking?.rideType || "").toUpperCase() === "SHARING_RIDE") {
        setSharedRouteId(String(booking?.sharedRouteId || ""));
        setSharedPickupPointId(String(booking?.sharedPickupPointId || ""));
        setSharedDropPointId(String(booking?.sharedDropPointId || ""));
      } else {
        setSharedRouteId("");
        setSharedPickupPointId("");
        setSharedDropPointId("");
      }

      const firstRoute =
        Array.isArray(booking.routes)
          ? booking.routes.find((route: any) => !route.legId) || booking.routes[0]
          : null;

      const currentRouteData =
        Array.isArray(booking.routes) && currentLegRoute(booking, activeLegId)
          ? currentLegRoute(booking, activeLegId)
          : firstRoute;

      setRouteDistanceKm(
        Number(currentRouteData?.distanceKm ?? firstRoute?.distanceKm ?? 0),
      );
      setRouteDurationMinutes(
        Number(
          currentRouteData?.durationMinutes ??
            firstRoute?.durationMinutes ??
            0,
        ),
      );

      const geometry =
        currentRouteData?.geometry ?? firstRoute?.geometry;

      setRouteGeometry(
        Array.isArray(geometry?.coordinates) ? geometry.coordinates : null,
      );

      const currentLeg = Array.isArray(booking.legs)
        ? booking.legs.find((leg: any) =>
            [
              "DRIVER_ARRIVED",
              "STARTED",
              "IN_PROGRESS",
              "DRIVER_ASSIGNED",
              "DRIVER_ARRIVING",
            ].includes(String(leg.status)),
          ) ||
          booking.legs.find(
            (leg: any) =>
              !["COMPLETED", "CANCELLED"].includes(String(leg.status)),
          ) ||
          booking.legs[0]
        : null;

      const resolvedActiveLegId = currentLeg?.id
        ? String(currentLeg.id)
        : "";

      if (resolvedActiveLegId) {
        setActiveLegId(resolvedActiveLegId);
      }

      // RideX ride verification is backend-controlled. The Customer App
      // displays the customer-visible OTP notification and the QR verification
      // state, while the Driver App performs the final trip-start verification.
      const verificationLeg = currentLeg || {};
      const nextVerificationMethod = String(
        verificationLeg?.verificationMethod || "BOTH",
      ).toUpperCase();
      const nextQrVerified = Boolean(
        verificationLeg?.verificationQrUsedAt ||
          verificationLeg?.verificationQrVerifiedAt ||
          verificationLeg?.verificationQrVerified ||
          verificationLeg?.qrVerified,
      );
      let nextVerificationOtp = String(
        verificationLeg?.verificationOtp ||
          verificationLeg?.verificationCode ||
          booking?.verificationOtp ||
          booking?.verificationCode ||
          "",
      ).trim();
      let nextVerificationOtpExpiresAt = String(
        verificationLeg?.verificationOtpExpiresAt ||
          verificationLeg?.verificationExpiresAt ||
          booking?.verificationOtpExpiresAt ||
          booking?.verificationExpiresAt ||
          "",
      );

      // Ride-start OTP is delivered to the Customer as a push notification.
      // The booking API intentionally does not expose the OTP itself. When
      // the active leg reaches DRIVER_ARRIVED, recover the customer-visible
      // OTP from the authenticated notification feed.
      if (nextStatus === "DRIVER_ARRIVED" && !nextVerificationOtp && customerId) {
        try {
          const notificationUrl = new URL(`${API}/notifications`);
          notificationUrl.searchParams.set("actorType", "CUSTOMER");
          notificationUrl.searchParams.set("actorId", customerId);
          notificationUrl.searchParams.set("channel", "PUSH");
          notificationUrl.searchParams.set("limit", "20");
          const notificationResponse = await ridexFetch(notificationUrl.toString());
          const notificationData = await notificationResponse.json().catch(() => ({}));
          const rows = Array.isArray(notificationData?.data) ? notificationData.data : [];
          const otpNotification = notificationResponse.ok && notificationData?.success
            ? rows.find((item: any) =>
                String(item?.title || "").trim().toLowerCase() === "ridex otp verification" &&
                String(item?.body || "").includes("DRIVER.RIDE.TRIP_START_VERIFY")
              )
            : null;
          const match = String(otpNotification?.body || "").match(/Your RideX OTP is\s*(\d{4})/i);
          if (match?.[1]) nextVerificationOtp = match[1];
          if (otpNotification?.createdAt && !nextVerificationOtpExpiresAt) {
            const created = new Date(otpNotification.createdAt).getTime();
            if (Number.isFinite(created)) nextVerificationOtpExpiresAt = new Date(created + 5 * 60 * 1000).toISOString();
          }
        } catch {
          // Best-effort recovery; the push notification itself remains authoritative.
        }
      }
      setVerificationMethod(nextVerificationMethod);
      setVerificationQrVerified(nextQrVerified);
      setVerificationOtp(nextVerificationOtp);
      setVerificationOtpExpiresAt(nextVerificationOtpExpiresAt);

      if (booking.assignedDriverId) {
        const assignedId = String(booking.assignedDriverId);
        setDriverId(assignedId);
        setDriverName(String(booking.assignedDriver?.fullName || ""));
        setDriverVehicleType(String(booking.vehicle?.vehicleType || ""));
        setDriverVehicleNumber(String(booking.vehicle?.vehicleNumber || ""));

        const bookingDriverRating = Number(booking.assignedDriver?.rating);
        setDriverRating(
          Number.isFinite(bookingDriverRating) ? bookingDriverRating : null,
        );

        try {
          const driverResponse = await ridexFetch(
            `${API}/driver/${encodeURIComponent(assignedId)}`
          );
          const driverData = await driverResponse.json().catch(() => ({}));

          if (refreshSeq !== bookingRefreshSeqRef.current) return "";

          if (driverResponse.ok && driverData?.success) {
            setDriverName(
              String(
                driverData?.data?.fullName ||
                  driverData?.data?.user?.name ||
                  "",
              ),
            );

            const firstVehicle = Array.isArray(driverData?.data?.vehicles)
              ? driverData.data.vehicles[0]
              : null;

            setDriverVehicleType(
              String(
                firstVehicle?.vehicleType ||
                  booking.vehicle?.vehicleType ||
                  "",
              ),
            );

            setDriverVehicleNumber(
              String(
                firstVehicle?.vehicleNumber ||
                  booking.vehicle?.vehicleNumber ||
                  "",
              ),
            );

            const driverProfileRating = Number(driverData?.data?.rating);
            if (Number.isFinite(driverProfileRating)) {
              setDriverRating(driverProfileRating);
            }
          }

          if (
            driverResponse.ok &&
            driverData?.success &&
            Number.isFinite(Number(driverData?.data?.location?.latitude)) &&
            Number.isFinite(Number(driverData?.data?.location?.longitude))
          ) {
            const nextDriverLocation = {
              latitude: Number(driverData.data.location.latitude),
              longitude: Number(driverData.data.location.longitude),
              recordedAt: driverData.data.location.recordedAt,
            };

            setDriverLocation(nextDriverLocation);

            if (
              Number.isFinite(Number(booking.pickupLat)) &&
              Number.isFinite(Number(booking.pickupLng))
            ) {
              const latKm =
                (nextDriverLocation.latitude - Number(booking.pickupLat)) * 111;
              const lngKm =
                (nextDriverLocation.longitude - Number(booking.pickupLng)) * 111;

              setDriverDistanceKm(
                Math.sqrt(latKm * latKm + lngKm * lngKm),
              );
            }
          } else {
            setDriverLocation(null);
            setDriverDistanceKm(null);
          }
        } catch (error) {
          console.log("CUSTOMER DRIVER LOCATION UNAVAILABLE:", error);
        }
      } else {
        setDriverId("");
        setDriverName("");
        setDriverVehicleType("");
        setDriverVehicleNumber("");
        setDriverRating(null);
        setDriverLocation(null);
        setDriverDistanceKm(null);
      }

      try {
        await AsyncStorage.setItem(
          CUSTOMER_SESSION_STORAGE_KEY,
          JSON.stringify({
            customerId,
            bookingId: requestedBookingId,
            bookingStatus: nextStatus,
            matchingState: nextMatchingState,
            matchingReason,
            scheduledPickupText: bookingPickupDatetime || scheduledPickupText || null,
            sharedRouteId: String(booking?.sharedRouteId || ""),
            sharedPickupPointId: String(booking?.sharedPickupPointId || ""),
            sharedDropPointId: String(booking?.sharedDropPointId || ""),
          })
        );
      } catch (error) {
        console.error("CUSTOMER BOOKING SESSION UPDATE ERROR:", error);
      }

      const refreshedFare = Number(
        booking.finalFare ?? booking.estimatedFare,
      );

      if (Number.isFinite(refreshedFare)) {
        setFare(refreshedFare);
        setFareIsAuthoritative(true);
      }

      if (nextStatus === "COMPLETED") {
        setPaymentStatus(String(booking.payment?.status || "PENDING"));

        const backendPaymentMethod = booking.payment?.method;
        if (
          backendPaymentMethod === "CASH" ||
          backendPaymentMethod === "UPI" ||
          backendPaymentMethod === "WALLET"
        ) {
          setPaymentMethod(backendPaymentMethod);
        }

        setDriverLocation(null);
        setDriverDistanceKm(null);
        setScreen("payment");
        return resolvedActiveLegId;
      }

      if (nextStatus === "CANCELLED") {
        setDriverLocation(null);
        setDriverDistanceKm(null);
        setScreen("rebook");
      }

      return resolvedActiveLegId;
    } catch (error) {
      console.error("BOOKING STATUS ERROR:", error);
      return "";
    }
  }

  useEffect(() => {
    if (screen !== "confirmed" || !bookingId) {
      return;
    }

    fetchBooking();
    const timer = setInterval(fetchBooking, realtimeConnected ? 30000 : 5000);

    return () => clearInterval(timer);
  }, [screen, bookingId, realtimeConnected]);

  useEffect(() => {
    if (screen !== "payment" || !bookingId || !customerId) {
      return;
    }
    const key = `${bookingId}:${paymentMethod}`;
    if (paymentPreparedRef.current === key) return;
    paymentPreparedRef.current = key;
    void preparePayment();
  }, [screen, bookingId, customerId, paymentMethod]);

  useEffect(() => {
    if (
      screen !== "payment" ||
      paymentMethod !== "UPI" ||
      RIDEX_TEST_MODE ||
      !bookingId ||
      !customerId ||
      paymentStatus === "SUCCESS" ||
      paymentStatus === "FAILED"
    ) {
      return;
    }

    let stopped = false;
    let attempts = 0;
    const timer = setInterval(async () => {
      if (stopped || paymentStatusRefreshBusyRef.current) return;
      attempts += 1;
      if (attempts > 12) {
        clearInterval(timer);
        return;
      }

      paymentStatusRefreshBusyRef.current = true;
      try {
        const response = await ridexFetch(
          `${API}/bookings/${encodeURIComponent(bookingId)}`,
        );
        const data = await response.json().catch(() => ({}));
        const nextStatus = String(data?.data?.payment?.status || "").toUpperCase();
        if (!response.ok || !data?.success || !nextStatus) return;

        if (nextStatus === "SUCCESS" || nextStatus === "FAILED") {
          setPaymentStatus(nextStatus);
          setMessage(
            nextStatus === "SUCCESS"
              ? "UPI payment confirmed by RideX."
              : "UPI payment was not completed."
          );
          if (!stopped) clearInterval(timer);
        } else {
          setPaymentStatus(nextStatus);
        }
      } catch (error) {
        console.warn("CUSTOMER UPI PAYMENT STATUS POLL ERROR:", error);
      } finally {
        paymentStatusRefreshBusyRef.current = false;
      }
    }, 5000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [screen, bookingId, customerId, paymentMethod, paymentStatus]);

  async function rebook() {
    if (!bookingId) {
      setMessage("Booking ID missing.");
      return;
    }

    try {
      setLoading(true);
      setMessage("Booking ride again...");

      if (!rebookIdempotencyKeyRef.current) {
        rebookIdempotencyKeyRef.current =
          `customer-rebook-${Date.now()}-${Math.floor(
            Math.random() * 1_000_000_000,
          )}`;
      }

      const response = await ridexFetch(
        `${API}/bookings/${bookingId}/rebook`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": rebookIdempotencyKeyRef.current,
          },
          body: JSON.stringify({ customerId }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Rebook failed.");
        return;
      }

      const booking = data.data?.booking;
      const newBookingId = String(booking?.id || "");
      const newBookingStatus = String(booking?.status || "NEW").toUpperCase();
      const matchingResult = data?.data?.matching ?? null;
      const matchingResultReason = String(matchingResult?.reason || "").trim().toUpperCase();
      const assignedDriverId = String(booking?.assignedDriverId || "").trim();
      const returnedPickupDatetime = String(booking?.pickupDatetime || "");

      setScheduledPickupText(returnedPickupDatetime);

      let nextMatchingState: CustomerMatchingState;
      if (assignedDriverId) {
        nextMatchingState =
          newBookingStatus === "DRIVER_ARRIVED"
            ? "ARRIVED"
            : newBookingStatus === "STARTED" || newBookingStatus === "IN_PROGRESS"
              ? "IN_PROGRESS"
              : "ASSIGNED";
      } else if (newBookingStatus === "UPCOMING") {
        nextMatchingState = "SCHEDULED";
      } else if (matchingResult?.matched === true) {
        nextMatchingState = "OFFERED";
      } else if (matchingResult?.matched === false && isCustomerNoMatchReason(matchingResultReason)) {
        nextMatchingState = "NO_MATCH";
      } else {
        nextMatchingState = "SEARCHING";
      }

      setBookingId(newBookingId);
      setBookingStatus(newBookingStatus);
      setMatchingState(nextMatchingState);
      setMatchingReason(matchingResultReason);
      setDriverId(assignedDriverId);

      if (
        booking?.finalFare !== null ||
        booking?.estimatedFare !== null
      ) {
        const authoritativeFare = Number(
          booking?.finalFare ?? booking?.estimatedFare,
        );
        setFare(Number.isFinite(authoritativeFare) ? authoritativeFare : 0);
        setFareIsAuthoritative(Number.isFinite(authoritativeFare));
      }

      try {
        await AsyncStorage.setItem(
          CUSTOMER_SESSION_STORAGE_KEY,
          JSON.stringify({
            customerId,
            bookingId: newBookingId,
            bookingStatus: newBookingStatus,
            matchingState: nextMatchingState,
            matchingReason: matchingResultReason || null,
            scheduledPickupText: returnedPickupDatetime || null,
            sharedRouteId: String(booking?.sharedRouteId || ""),
            sharedPickupPointId: String(booking?.sharedPickupPointId || ""),
            sharedDropPointId: String(booking?.sharedDropPointId || ""),
          })
        );
      } catch (storageError) {
        console.error("CUSTOMER REBOOK SESSION SAVE ERROR:", storageError);
      }

      setScreen("confirmed");
      setMessage(
        nextMatchingState === "NO_MATCH"
          ? customerMatchingReasonText(matchingResultReason)
          : nextMatchingState === "OFFERED"
            ? "Driver offer sent. Waiting for the driver to accept."
            : "New booking created."
      );
    } catch (error) {
      console.error("REBOOK ERROR:", error);
      setMessage("Unable to book again.");
    } finally {
      setLoading(false);
    }
  }



  useEffect(() => {
    if (screen === "rideType" && rideType === "SHARING_RIDE") {
      void loadSharedRideCatalog();
    }
  }, [screen, rideType]);

  function currentLegRoute(booking: any, legId: string) {
    if (!legId || !Array.isArray(booking?.routes)) return null;
    return booking.routes.find((route: any) => String(route?.legId || "") === String(legId)) || null;
  }

  function normalizeSharedRouteCatalog(raw: any): SharedRoute[] {
    const rows = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.routes)
        ? raw.routes
        : Array.isArray(raw?.data)
          ? raw.data
          : [];

    return rows
      .map((route: any) => {
        const pointsRaw = Array.isArray(route?.points)
          ? route.points
          : Array.isArray(route?.sharedRoutePoints)
            ? route.sharedRoutePoints
            : [];

        const points = pointsRaw
          .map((point: any) => ({
            id: String(point?.id || "").trim(),
            sequence: Number(point?.sequence ?? 0),
            name: String(point?.name || point?.label || "").trim(),
            address: point?.address ?? null,
            latitude: Number(point?.latitude ?? point?.lat),
            longitude: Number(point?.longitude ?? point?.lng),
            active: point?.active !== false,
          }))
          .filter((point: SharedRoutePoint) =>
            point.id &&
            point.name &&
            Number.isInteger(point.sequence) &&
            point.sequence > 0 &&
            Number.isFinite(point.latitude) &&
            Number.isFinite(point.longitude) &&
            point.active !== false
          )
          .sort((a: SharedRoutePoint, b: SharedRoutePoint) => a.sequence - b.sequence);

        return {
          id: String(route?.id || "").trim(),
          name: String(route?.name || route?.title || "").trim(),
          city: route?.city ?? null,
          cityZoneId: route?.cityZoneId ?? null,
          active: route?.active !== false,
          selectionMode: route?.selectionMode ?? null,
          points,
        };
      })
      .filter((route: SharedRoute) =>
        route.id &&
        route.name &&
        route.active !== false &&
        route.points.length >= 2
      );
  }

  function getSelectedSharedRoute(): SharedRoute | null {
    return sharedRoutes.find((route) => route.id === sharedRouteId) || null;
  }

  function getSelectedSharedPickupPoint(): SharedRoutePoint | null {
    const route = getSelectedSharedRoute();
    return route?.points.find((point) => point.id === sharedPickupPointId) || null;
  }

  function getSelectedSharedDropPoint(): SharedRoutePoint | null {
    const route = getSelectedSharedRoute();
    return route?.points.find((point) => point.id === sharedDropPointId) || null;
  }

  function applySharedRouteSelection(route: SharedRoute | null, pickupPoint: SharedRoutePoint | null, dropPoint: SharedRoutePoint | null) {
    setSharedRouteId(route?.id || "");
    setSharedPickupPointId(pickupPoint?.id || "");
    setSharedDropPointId(dropPoint?.id || "");

    if (pickupPoint) {
      const address = String(pickupPoint.address || pickupPoint.name).trim();
      setPickup(address);
      setPickupLat(pickupPoint.latitude);
      setPickupLng(pickupPoint.longitude);
    }
    if (dropPoint) {
      const address = String(dropPoint.address || dropPoint.name).trim();
      setDrop(address);
      setDropLat(dropPoint.latitude);
      setDropLng(dropPoint.longitude);
    }
  }

  async function loadSharedRideCatalog() {
    setSharedRoutesLoading(true);
    setSharedRoutesError("");
    try {
      const response = await ridexFetch(`${API}/shared-rides?active=true`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.success === false) {
        const message = String(data?.message || "Unable to load Sharing Ride routes.");
        setSharedRoutesError(response.status === 404 ? "Sharing Ride route catalog is not available on this backend yet." : message);
        return;
      }

      const routes = normalizeSharedRouteCatalog(data?.data ?? data);
      setSharedRoutes(routes);

      if (sharedRouteId && !routes.some((route) => route.id === sharedRouteId)) {
        applySharedRouteSelection(null, null, null);
      }
    } catch (error) {
      console.error("SHARED RIDE CATALOG ERROR:", error);
      setSharedRoutesError("Unable to reach the Sharing Ride route catalog.");
    } finally {
      setSharedRoutesLoading(false);
    }
  }

  function selectSharedRoute(routeId: string) {
    const route = sharedRoutes.find((item) => item.id === routeId) || null;
    const firstPickup = route?.points[0] || null;
    const firstDrop = route?.points.find((point) => point.sequence > Number(firstPickup?.sequence || 0)) || null;
    applySharedRouteSelection(route, firstPickup, firstDrop);
    setMessage(route ? `Sharing Route selected: ${route.name}` : "Sharing Route cleared.");
  }

  function selectSharedPickupPoint(pointId: string) {
    const route = getSelectedSharedRoute();
    const point = route?.points.find((item) => item.id === pointId) || null;
    if (!route || !point) return;

    const currentDrop = getSelectedSharedDropPoint();
    const nextDrop = currentDrop && currentDrop.sequence > point.sequence
      ? currentDrop
      : route.points.find((item) => item.sequence > point.sequence) || null;

    applySharedRouteSelection(route, point, nextDrop);
  }

  function selectSharedDropPoint(pointId: string) {
    const route = getSelectedSharedRoute();
    const pickupPoint = getSelectedSharedPickupPoint();
    const point = route?.points.find((item) => item.id === pointId) || null;
    if (!route || !point || !pickupPoint) return;

    if (point.sequence <= pickupPoint.sequence) {
      setMessage("Sharing Ride drop point must come after pickup point.");
      return;
    }

    applySharedRouteSelection(route, pickupPoint, point);
  }

  function clearSharedRideSelection() {
    setSharedRouteId("");
    setSharedPickupPointId("");
    setSharedDropPointId("");
  }

  async function loadNotifications() {
    if (!customerId) return;
    try {
      const url = new URL(`${API}/notifications`);
      url.searchParams.set("actorType", "CUSTOMER");
      url.searchParams.set("actorId", customerId);
      const response = await ridexFetch(url.toString());
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success) {
        const rows = Array.isArray(data.data) ? data.data : [];
        setNotifications(rows);
        setUnreadNotificationCount(rows.filter((item:any) => !item.readAt).length);
      }
    } catch (error) {
      console.error("CUSTOMER NOTIFICATIONS ERROR:", error);
    }
  }

  async function markNotificationRead(notificationId: string) {
    if (!notificationId) return;
    try {
      const response = await ridexFetch(`${API}/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorType: "CUSTOMER", actorId: customerId }),
      });
      if (response.ok) await loadNotifications();
    } catch (error) {
      console.error("MARK NOTIFICATION READ ERROR:", error);
    }
  }

  async function markAllNotificationsRead() {
    try {
      const response = await ridexFetch(`${API}/notifications/read-all`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorType: "CUSTOMER", actorId: customerId }),
      });
      if (response.ok) await loadNotifications();
    } catch (error) {
      console.error("MARK ALL NOTIFICATIONS ERROR:", error);
    }
  }

  async function loadSupportCases() {
    if (!customerId) return;
    try {
      const url = new URL(`${API}/support/cases`);
      url.searchParams.set("actorType", "CUSTOMER");
      url.searchParams.set("actorId", customerId);
      const response = await ridexFetch(url.toString());
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success) setSupportCases(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error("CUSTOMER SUPPORT CASES ERROR:", error);
    }
  }

  async function openSupportCase(caseId: string) {
    try {
      setSupportBusy(true);
      const url = new URL(`${API}/support/cases/${encodeURIComponent(caseId)}`);
      url.searchParams.set("actorType", "CUSTOMER");
      url.searchParams.set("actorId", customerId);
      const response = await ridexFetch(url.toString());
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setMessage(data?.message || "Unable to open support case.");
        return;
      }
      setSelectedSupportCase(data.data);
      setSupportDraft("");
      setSupportAttachment(null);
    } catch (error) {
      console.error("OPEN SUPPORT CASE ERROR:", error);
      setMessage("Unable to open support case.");
    } finally {
      setSupportBusy(false);
    }
  }

  async function sendSupportMessage() {
    if (!selectedSupportCase?.id || (!supportDraft.trim() && !supportAttachment)) return;
    try {
      setSupportBusy(true);
      if (supportAttachment) {
        const blob = await fetch(supportAttachment.uri).then((response) => response.blob());
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onerror = () => reject(reader.error || new Error("File read failed"));
          reader.onload = () => resolve(String(reader.result || ""));
          reader.readAsDataURL(blob);
        });
        const response = await ridexFetch(`${API}/support/cases/${encodeURIComponent(selectedSupportCase.id)}/messages/attachment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actorType: "CUSTOMER",
            actorId: customerId,
            message: supportDraft.trim() || "Attachment",
            fileName: supportAttachment.name,
            mimeType: supportAttachment.mimeType,
            base64,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success) throw new Error(data?.message || "Attachment upload failed");
      } else {
        const response = await ridexFetch(`${API}/support/cases/${encodeURIComponent(selectedSupportCase.id)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorType: "CUSTOMER", actorId: customerId, message: supportDraft.trim() }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success) throw new Error(data?.message || "Message send failed");
      }
      setSupportDraft("");
      setSupportAttachment(null);
      await openSupportCase(selectedSupportCase.id);
      await loadSupportCases();
    } catch (error) {
      console.error("SEND SUPPORT MESSAGE ERROR:", error);
      setMessage(error instanceof Error ? error.message : "Unable to send support message.");
    } finally {
      setSupportBusy(false);
    }
  }

  async function chooseSupportAttachment() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setSupportAttachment({
        uri: asset.uri,
        name: asset.fileName || `ridex-support-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
      });
    } catch (error) {
      console.error("SUPPORT ATTACHMENT PICK ERROR:", error);
      setMessage("Unable to select attachment.");
    }
  }

  async function openSupportAttachment(caseId: string, messageId: string) {
    try {
      const url = new URL(`${API}/support/cases/${encodeURIComponent(caseId)}/messages/${encodeURIComponent(messageId)}/attachment-url`);
      url.searchParams.set("actorType", "CUSTOMER");
      url.searchParams.set("actorId", customerId);
      const response = await ridexFetch(url.toString());
      const data = await response.json().catch(() => ({}));
      const signedUrl = String(data?.data?.url || "");
      if (response.ok && signedUrl) await Linking.openURL(signedUrl);
    } catch (error) {
      console.error("OPEN SUPPORT ATTACHMENT ERROR:", error);
      setMessage("Unable to open attachment.");
    }
  }

  async function refreshAuthoritativePaymentStatus(): Promise<string | null> {
    if (!bookingId) return null;
    try {
      const response = await ridexFetch(`${API}/bookings/${encodeURIComponent(bookingId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setPaymentStatus("UNKNOWN");
        setMessage("RideX could not confirm the payment outcome yet. Check the status again before retrying.");
        return null;
      }
      const status = String(data?.data?.payment?.status ?? data?.data?.paymentStatus ?? "").trim().toUpperCase();
      if (!status) {
        setPaymentStatus("UNKNOWN");
        setMessage("RideX has not returned an authoritative payment status. Do not retry until the status is confirmed.");
        return null;
      }
      setPaymentStatus(status);
      setMessage(status === "SUCCESS"
        ? "RideX confirmed that payment was successful."
        : status === "FAILED"
          ? "RideX confirmed that the payment attempt failed."
          : `RideX payment status: ${status}. Check the status before retrying.`);
      return status;
    } catch {
      setPaymentStatus("UNKNOWN");
      setMessage("Payment status is still unknown. Check with RideX again before retrying.");
      return null;
    }
  }

  async function preparePayment() {
    if (!bookingId || !customerId) return;
    try {
      setPaymentPreparing(true);
      const safeBookingKey = String(bookingId).replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 70);
      // Deterministic per booking + method: an app restart or lost response replays
      // the same payment-intent reservation rather than creating a new operation.
      const idempotencyKey = `customer-payment-intent:${safeBookingKey}:${paymentMethod}`;
      const response = await ridexFetch(`${API}/payments/intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ bookingId, customerId, method: paymentMethod }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        if (RIDEX_TEST_MODE && paymentMethod === "UPI") {
          setPaymentStatus("PENDING");
          setMessage("TEST UPI is ready. Complete the TEST payment to mark it successful.");
        } else {
          setPaymentStatus("FAILED");
          setMessage(data?.message || "Unable to prepare payment.");
        }
        return;
      }
      const returnedPaymentStatus = String(data?.data?.status ?? "").trim().toUpperCase();
      const nextPaymentStatus = returnedPaymentStatus || (paymentMethod === "CASH" ? "PENDING" : "UNKNOWN");
      setPaymentStatus(nextPaymentStatus);
      if (paymentMethod !== "CASH" && nextPaymentStatus === "UNKNOWN") {
        paymentPreparedRef.current = "";
        setPaymentStatus("UNKNOWN");
        setMessage("RideX backend did not return an authoritative payment status.");
        return;
      }

      if (paymentMethod === "UPI" && !RIDEX_TEST_MODE) {
        setMessage(
          nextPaymentStatus === "SUCCESS"
            ? "UPI payment confirmed by RideX."
            : "UPI payment is awaiting provider confirmation. RideX will refresh the status automatically."
        );
      }
      if (paymentMethod === "WALLET") {
        void loadWalletBalance();
      }
    } catch {
      // A transport error cannot prove that the backend/provider did not create
      // the intent. Resolve authoritative booking state before allowing retry.
      console.warn("PREPARE PAYMENT OUTCOME UNKNOWN");
      setPaymentStatus("UNKNOWN");
      setMessage("Payment preparation response was lost. Checking RideX status...");
      const status = await refreshAuthoritativePaymentStatus();
      if (!status) {
        setPaymentStatus("UNKNOWN");
        setMessage("Payment setup outcome is still unknown. Check the status before retrying.");
      }
    } finally {
      setPaymentPreparing(false);
    }
  }

  async function completeTestPayment() {
    if (!RIDEX_TEST_MODE || !bookingId || !customerId) return;
    try {
      setPaymentPreparing(true);
      const safeBookingKey = String(bookingId).replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 70);
      const idempotencyKey = `customer-test-payment-success:${safeBookingKey}`;
      const response = await ridexFetch(`${API}/payments/test-success`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ bookingId, customerId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setMessage(data?.message || "Test payment failed.");
        return;
      }
      setPaymentStatus("SUCCESS");
      setMessage("TEST payment completed successfully.");
      await fetchBooking();
    } catch {
      // The request may have committed even when the client missed its response.
      // Mark it UNKNOWN and reconcile with the authenticated booking endpoint.
      console.warn("TEST PAYMENT OUTCOME UNKNOWN");
      setPaymentStatus("UNKNOWN");
      setMessage("TEST payment response was lost. Checking RideX status...");
      const status = await refreshAuthoritativePaymentStatus();
      if (status === "SUCCESS") {
        setMessage("TEST payment completed successfully and was confirmed by RideX.");
        await fetchBooking();
      } else if (!status) {
        setPaymentStatus("UNKNOWN");
        setMessage("TEST payment outcome is still unknown. Check the status before retrying.");
      }
    } finally {
      setPaymentPreparing(false);
    }
  }

  async function submitRating() {
    if (!bookingId) {
      setScreen("home");
      return;
    }

    try {
      setLoading(true);

      const safeBookingKey = String(bookingId).replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 70);
      // The ratings API reserves this key and compares request bodies. Keep it
      // deterministic so a lost response cannot create a second rating.
      const idempotencyKey = `customer-rating:${safeBookingKey}`;
      const response = await ridexFetch(`${API}/ratings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          bookingId,
          customerId,
          driverId,
          stars,
          comment: comment.trim(),
          target: "RIDE",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Unable to save rating.");
        return;
      }

      setScreen("home");
      setMessage("Thank you for your rating!");
    } catch (error) {
      console.error("RATING ERROR:", error);
      setMessage("Unable to save rating. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomerHistory() {
    if (!customerId) return;
    try {
      const response = await ridexFetch(`${API}/bookings/customer/${encodeURIComponent(customerId)}/history`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success && Array.isArray(data.data)) setCustomerHistory(data.data);
    } catch (error) {
      console.error("CUSTOMER HISTORY ERROR:", error);
    }
  }

  async function startNewBooking() {
    bookingRefreshSeqRef.current += 1;
    setBookingId("");
    setBookingStatus("NEW");
    setMatchingState("IDLE");
    setMatchingReason("");
    setScheduledPickupText("");
    setDriverId("");
    setPaymentStatus("");
    paymentPreparedRef.current = "";
    setStars(5);
    setComment("");
    setFare(0);
    setFareIsAuthoritative(false);
    setRouteDistanceKm(0);
    setRouteDurationMinutes(0);
    setRouteGeometry(null);
    setDriverName("");
    setDriverVehicleType("");
    setDriverVehicleNumber("");
    setDriverRating(null);
    setCouponCode("");
    setCouponDiscount(0);
    setCouponMessage("");
    bookingIdempotencyKeyRef.current = "";
    eventBookingIdempotencyKeyRef.current = "";
    rebookIdempotencyKeyRef.current = "";
    setSpecialInstructions("");
    setPickup("");
    setDrop("");
    setPickupLat(Number.NaN);
    setPickupLng(Number.NaN);
    setDropLat(Number.NaN);
    setDropLng(Number.NaN);
    setGoodsDescription("");
    setParcelRows([{weight:"",description:""}]);
    setBookingMode("RIDE");
    setRideType("CITY_RIDE");
    setPassengers(1);
    setScheduled(false);
    const resetSchedule = makeDefaultSchedule();
    setScheduleDate(resetSchedule.date);
    setScheduleTime(resetSchedule.time);
    setSchedulePeriod(resetSchedule.period);
    setInterchangePoints([]);
    setParcelServiceType("FULL");
    setParcelImageUri("");
    setGoodsVehicle("E_RICKSHAW");
    setGoodsType("");
    setGoodsDescription("");
    setParcelRows([{ weight: "", description: "" }]);
    setWeight("");
    setSize("SMALL");
    setReceiverName("");
    setReceiverMobile("");
    setWaiting("0");
    setDurationMinutes("60");
    setSpecialInstructions("");
    setStops([]);
    clearSharedRideSelection();
    setSharedRoutes([]);
    setSharedRoutesError("");
    setPickup("");
    setDrop("");
    setPickupLat(Number.NaN);
    setPickupLng(Number.NaN);
    setDropLat(Number.NaN);
    setDropLng(Number.NaN);
    setVerificationCredential("");
    setVerificationMethod("BOTH");
    setVerificationQrVerified(false);
    setVerificationOtp("");
    setVerificationOtpExpiresAt("");
    setActiveLegId("");
    setDriverLocation(null);
    setDriverDistanceKm(null);
    setMessage("");
    setScreen("home");
    try {
      await AsyncStorage.setItem(
        CUSTOMER_SESSION_STORAGE_KEY,
        JSON.stringify({ customerId })
      );
    } catch (error) {
      console.error("CUSTOMER RESET SESSION ERROR:", error);
    }
  }

  async function logoutCustomer() {
    setLoading(true);
    try {
      try {
        await ridexFetch(`${API}/auth/logout`, { method: "POST", headers: { "Content-Type": "application/json" } });
      } catch (error) { console.log("CUSTOMER LOGOUT BACKEND UNAVAILABLE:", error); }
      await removeSecureToken(CUSTOMER_AUTH_TOKEN_KEY);
      await AsyncStorage.removeItem(CUSTOMER_SESSION_STORAGE_KEY);
    } catch (error) { console.error("CUSTOMER LOGOUT ERROR:", error); }
    finally {
      rebookIdempotencyKeyRef.current = "";
      eventBookingIdempotencyKeyRef.current = "";
      bookingRefreshSeqRef.current += 1;
      setCustomerId(""); setMobile(""); setOtp(""); setCustomerUserId(""); setCustomerPassword(""); setCustomerLoginMode("OTP"); setBookingId(""); setBookingStatus("NEW"); setMatchingState("IDLE"); setMatchingReason(""); setScheduledPickupText(""); setDriverId("");
      setDriverLocation(null); setDriverDistanceKm(null); setActiveLegId(""); setVerificationCredential(""); setVerificationMethod("BOTH"); setVerificationQrVerified(false); setVerificationOtp(""); setVerificationOtpExpiresAt(""); setPaymentStatus("");
      clearSharedRideSelection();
      setCustomerAuthToken("");
      setSharedRoutes([]);
      setSharedRoutesError("");
      setLoading(false); setScreen("login");
    }
  }


  if (firstStartGuideState === "CHECKING") {
    return <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}><View style={s.center}><Text style={s.muted}>Preparing RideX…</Text></View></SafeAreaView>;
  }
  if (firstStartGuideState === "SHOW") {
    return <FirstStartGuide audience="Customer" onClose={() => void closeFirstStartGuide()} />;
  }

  const statusTheme = getStatusTheme(bookingStatus, bookingMode);
  const isNoMatch = matchingState === "NO_MATCH";
  const isScheduledBooking =
    matchingState === "SCHEDULED" || bookingStatus === "UPCOMING";
  const isSearching =
    !isNoMatch &&
    !isScheduledBooking &&
    (bookingStatus === "NEW" ||
      bookingStatus === "MATCHING" ||
      bookingStatus === "PENDING");
  const isAssigned =
    bookingStatus === "DRIVER_ASSIGNED" ||
    bookingStatus === "DRIVER_ARRIVING";
  const isArrived = bookingStatus === "DRIVER_ARRIVED";
  const isTripStarted =
    bookingStatus === "STARTED" ||
    bookingStatus === "IN_PROGRESS";
  const activeGoodsUsesTruck =
    bookingMode === "GOODS"
      ? String(driverVehicleType || "").toUpperCase() === "PICKUP_TRUCK" ||
        (!driverVehicleType && goodsType === "Logistic Goods")
      : false;

  if (screen === "welcome") {
    return (
      <ScreenShell>
        <View style={s.welcomeHero}>
          <TopLanguage />
          <BrandLogo large />
          <Text style={s.tagline}>Your Ride, Your Way</Text>
          <Text style={s.heroSubline}>SAFE  |  CLEAN  |  AFFORDABLE  |  GREENER CITIES</Text>

          <View style={s.welcomeHeroImageWrap}>
            {customerHomeAssetSource ? (
              <Image source={customerHomeAssetSource} style={s.dynamicHomeAsset} resizeMode="cover" />
            ) : (
              <View style={s.heroFallback}>
                <Text style={s.heroFallbackText}>RIDE</Text>
                <Text style={s.heroFallbackText}>TOGETHER</Text>
              </View>
            )}
          </View>

          <RideXMotionSurface height={72} intensity={0.8} label="SMART ROUTE FLOW" />

          <View style={s.serviceMiniRow}>
            {[
              ["ride", "Ride", "Go Anywhere"],
              ["shared", "Sharing Ride", "Save Together"],
              ["parcel", "Logistic Parcel", "Send with Trust"],
              ["event", "Event Ride", "Admin sessions"],
            ].map(([icon, title, sub]) => (
              <View key={title} style={s.serviceMiniCard}>
                <View style={s.serviceMiniIcon}>
                  <AssetIcon name={icon} size={24} />
                </View>
                <Text style={s.serviceMiniTitle}>{title}</Text>
                <Text style={s.serviceMiniSub}>{sub}</Text>
              </View>
            ))}
          </View>

          <PrimaryButton
            title="Get Started"
            onPress={() => setScreen("login")}
            trailing="→"
          />
          <OutlineButton
            title="Login to Your Account"
            onPress={() => setScreen("login")}
          />

          <View style={s.dividerWithText}>
            <View style={s.dividerLine} />
            <Text style={s.muted}>Mobile + OTP first</Text>
            <View style={s.dividerLine} />
          </View>
          <Text style={s.authNote}>After first mobile + OTP login, Google, Apple or Facebook can be linked from Profile when backend social linking is enabled.</Text>

          <Text style={s.terms}>
            By continuing, you agree to our <Text style={s.redText}>Terms & Privacy Policy</Text>
          </Text>
        </View>
      </ScreenShell>
    );
  }

  if (screen === "login") {
    return (
      <ScreenShell>
        <AuthHeader onBack={() => setScreen("welcome")} />
        <View style={s.authHero}>
          <BrandLogo />
          <View style={s.authScene}>
            <View style={s.heroFallback}><Text style={s.heroFallbackText}>RideX</Text></View>
            <View style={s.authSceneShade} />
          </View>
        </View>
        <RideXMotionSurface height={46} intensity={0.45} compact muted label="SECURE FLOW" />

        <Card style={s.authCard}>
          <Text style={s.authTitle}>Login or Sign Up</Text>
          <Text style={s.authSubtitle}>Choose how you want to access your Customer account</Text>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
            <Pressable
              onPress={() => { setCustomerLoginMode("OTP"); setMessage(""); }}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: customerLoginMode === "OTP" ? COLORS.red : COLORS.line,
                backgroundColor: customerLoginMode === "OTP" ? COLORS.softRed : "#FFFFFF",
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: "center",
              }}
            >
              <Text style={{ color: customerLoginMode === "OTP" ? COLORS.red : COLORS.text, fontSize: 13, fontWeight: "900" }}>Mobile + OTP</Text>
            </Pressable>
            <Pressable
              onPress={() => { setCustomerLoginMode("PASSWORD"); setMessage(""); }}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: customerLoginMode === "PASSWORD" ? COLORS.red : COLORS.line,
                backgroundColor: customerLoginMode === "PASSWORD" ? COLORS.softRed : "#FFFFFF",
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: "center",
              }}
            >
              <Text style={{ color: customerLoginMode === "PASSWORD" ? COLORS.red : COLORS.text, fontSize: 13, fontWeight: "900" }}>User ID + Password</Text>
            </Pressable>
          </View>

          {customerLoginMode === "OTP" ? (
            <>
              <Text style={s.authSubtitle}>Enter your mobile number to continue</Text>
              <View style={s.phoneInput}>
                <Text style={s.flag}>IN</Text>
                <Text style={s.countryCode}>+91</Text>
                <View style={s.verticalLine} />
                <TextInput
                  style={s.phoneTextInput}
                  placeholder="98765 43210"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={mobile}
                  onChangeText={setMobile}
                  placeholderTextColor={COLORS.muted}
                />
              </View>

              <PrimaryButton
                title={loading ? "Sending..." : "Send OTP"}
                onPress={sendOtp}
                disabled={loading}
                trailing="→"
              />

              <View style={s.dividerWithText}>
                <View style={s.dividerLine} />
                <Text style={s.muted}>Mobile + OTP</Text>
                <View style={s.dividerLine} />
              </View>
              <Text style={s.authNote}>Password is the normal Customer login method. Mobile + OTP is retained for first access, recovery and OTP-authorized authentication flows; OTP rules remain controlled by the RideX backend.</Text>
            </>
          ) : (
            <>
              <Text style={s.authSubtitle}>Use your existing Customer account credentials</Text>
              <TextInput
                style={s.input}
                placeholder="Customer User ID"
                placeholderTextColor={COLORS.muted}
                value={customerUserId}
                onChangeText={setCustomerUserId}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={s.input}
                placeholder="Password"
                placeholderTextColor={COLORS.muted}
                value={customerPassword}
                onChangeText={setCustomerPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              <PrimaryButton
                title={loading ? "Signing in..." : "Login with User ID"}
                onPress={customerPasswordLogin}
                disabled={loading}
                trailing="→"
              />

              <View style={s.dividerWithText}>
                <View style={s.dividerLine} />
                <Text style={s.muted}>Existing Customer Login</Text>
                <View style={s.dividerLine} />
              </View>
              <Text style={s.authNote}>Password login is a backend-issued session flow. In LIVE, a new device requires the configured RideX OTP verification.</Text>
            </>
          )}

          {onBeDriver ? (
            <OutlineButton title="Be a Rider" onPress={onBeDriver} />
          ) : null}

          {onAdminLogin ? (
            <Pressable style={{ marginTop: 10, alignItems: "center", paddingVertical: 8 }} onPress={onAdminLogin}>
              <Text style={{ color: COLORS.muted, fontSize: 12, fontWeight: "700" }}>Admin Login</Text>
            </Pressable>
          ) : null}

          <View style={s.featureRibbon}>
            <FeatureItem icon="safety" title="Safe" sub="Rides" />
            <FeatureItem icon="verified" title="Clean" sub="& Green" />
            <FeatureItem icon="rupee" title="Affordable" sub="Travel" />
            <FeatureItem icon="passengers" title="Stronger" sub="Communities" />
          </View>

          <Text style={s.terms}>
            By continuing, you agree to our <Text style={s.redText}>Terms & Privacy Policy</Text>
          </Text>
          <Text style={s.message}>{message}</Text>
        </Card>
      </ScreenShell>
    );
  }

  if (screen === "otp") {
    return (
      <ScreenShell>
        <AuthHeader onBack={() => setScreen("login")} />
        <View style={s.authHero}>
          <BrandLogo />
          <View style={s.authScene}>
            <View style={s.heroFallback}><Text style={s.heroFallbackText}>RideX</Text></View>
            <View style={s.authSceneShade} />
          </View>
        </View>
        <RideXMotionSurface height={46} intensity={0.45} compact muted label="SECURE FLOW" />

        <Card style={s.authCard}>
          <Text style={s.authTitle}>Verify OTP</Text>
          <Text style={s.authSubtitle}>We have sent a 4-digit OTP to</Text>
          <Text style={s.otpMobile}>+91 {mobile}</Text>

          <TextInput
            style={s.otpInput}
            placeholder="Enter OTP"
            placeholderTextColor={COLORS.muted}
            keyboardType="number-pad"
            maxLength={4}
            value={otp}
            onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 4))}
            autoFocus
            textAlign="center"
          />

          {RIDEX_TEST_MODE && testOtp ? (
  <Text style={s.otpHint}>
    TEST OTP: {testOtp}
  </Text>
) : null}

          <Text style={s.otpHint}>
            {otpResendCountdown > 0
              ? `Resend available in ${otpResendCountdown}s`
              : "Resend is controlled by the RideX server policy."}
          </Text>
          <OutlineButton
            title={loading ? "Please wait..." : otpResendCountdown > 0 ? `Resend in ${otpResendCountdown}s` : "Resend OTP"}
            onPress={resendOtp}
            disabled={loading || otpResendCountdown > 0}
          />

          {otpAttemptsRemaining !== null ? (
            <Text style={s.otpAttempts}>Attempts remaining: {otpAttemptsRemaining}</Text>
          ) : null}
          <PrimaryButton
            title={loading ? "Verifying..." : otpAttemptsRemaining === 0 ? "Request New OTP" : "Verify & Continue"}
            onPress={() => otpAttemptsRemaining === 0 ? void resendOtp() : void verify()}
            disabled={loading}
            trailing="→"
          />

          <OutlineButton
            title="← Change Mobile Number"
            onPress={() => {
              setOtp("");
              setMessage("");
              setScreen("login");
            }}
          />

          <View style={s.featureRibbon}>
            <FeatureItem icon="safety" title="Safe" sub="Rides" />
            <FeatureItem icon="verified" title="Clean" sub="& Green" />
            <FeatureItem icon="rupee" title="Affordable" sub="Travel" />
            <FeatureItem icon="passengers" title="Stronger" sub="Communities" />
          </View>

          <Text style={s.message}>{message}</Text>
        </Card>
      </ScreenShell>
    );
  }

  if (screen === "home") {
    return (
      <ScreenShell scroll>
        <View style={s.homeTopHero}>
          <View style={s.homeTopRow}>
            <Pressable style={s.iconButton} onPress={() => setScreen("profile")}>
              <AssetIcon name="menu" size={24} />
            </Pressable>
            <BrandLogo />
            <View style={s.homeRightActions}>
              <Pressable style={s.locationPill} onPress={() => openLocationPicker("drop", "home")}>
                <AssetIcon name="pickup" size={16} />
                <Text style={s.locationPillText} numberOfLines={1}>{currentLocationLabel}</Text>
                <Text style={s.locationPillText}></Text>
              </Pressable>
              <Pressable style={s.bellButton} onPress={() => setScreen("notifications")} accessibilityLabel="Notifications">
                <AssetIcon name="notification" size={23} />
                {unreadNotificationCount > 0 ? <View style={s.notificationBadge}><Text style={s.notificationBadgeText}>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</Text></View> : null}
              </Pressable>
            </View>
          </View>

          <View style={s.homeHeroVisual}>
            <Text style={s.homeScript}>Move Together{"\n"}A Smarter{"\n"}Tomorrow</Text>
            <VehicleIllustration kind="E_RICKSHAW" hero />
            <View style={s.promiseRow}>
              <FeatureItem icon="safety" title="Safe Rides" />
              <FeatureItem icon="verified" title="Clean & Green" />
              <FeatureItem icon="rupee" title="Affordable" />
              <FeatureItem icon="passengers" title="Stronger" />
            </View>
          </View>
        </View>

        <View style={s.homeContent}>
          <Card>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitleLarge}>Where are you going?</Text>
              <PillButton label="On Map" onPress={() => setScreen("location")} />
            </View>
            <View style={s.routeInputCard}>
              <RoutePoint
                active
                color={COLORS.blue}
                title="Your current location"
                value={pickup || "Detecting current location…"}
                onPress={() => {
                  void refreshCurrentLocation(true);
                  openLocationPicker("pickup", "home");
                }}
              />
              <RoutePoint
                color={COLORS.red}
                title="Enter destination"
                value={drop || "Search location, area or landmark"}
                onPress={() => setScreen("location")}
              />
            </View>
          </Card>

          <Card style={{ backgroundColor: COLORS.mapBg }}>
            <RideXMap
              pickupLat={pickupLat}
              pickupLng={pickupLng}
              dropLat={dropLat}
              dropLng={dropLng}
              pickupLabel={pickup}
              dropLabel={drop}
              showVehicles
              compact
              currentLocation={userLocation}
            />
          </Card>

          <View style={s.quickPlacesRow}>
            {[
              ["home", "Home", "Add"],
              ["wallet", "Work", "Add"],
              ["pickup", "Add Location", ""],
              ["rating", "Saved Places", ""],
            ].map(([icon, title, sub]) => (
              <Pressable key={title} style={s.quickPlace} onPress={() => setScreen("location")}>
                <LegacyIcon glyph={icon} size={24} />
                <Text style={s.quickPlaceTitle}>{title}</Text>
                {sub ? <Text style={s.quickPlaceSub}>{sub}</Text> : null}
              </Pressable>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.rideChoiceScroll}>
            <RideChoice selected={bookingMode === "RIDE" && rideType === "CITY_RIDE"} icon="ride" title="Full Ride" price="City Ride • Direct" onPress={() => startBookingFlow("city")} />
            <RideChoice selected={bookingMode === "RIDE" && rideType === "SHARING_RIDE"} icon="passengers" title="Share Ride" price="Share & save" onPress={() => startBookingFlow("sharing")} />
            <RideChoice selected={bookingMode === "RIDE" && rideType === "INTERCITY_RIDE"} icon="route" title="Connection Ride" price="InterCity • Capacity based" onPress={() => startBookingFlow("intercity")} />
            <RideChoice selected={bookingMode === "GOODS" && goodsType === "Logistic Parcel"} icon="parcel" title="Logistic Parcel" price="1–300 kg" onPress={() => startBookingFlow("parcel")} />
            <RideChoice selected={bookingMode === "GOODS" && goodsType === "Logistic Goods"} icon="truck" title="Logistic Goods" price="Cargo delivery" onPress={() => startBookingFlow("goods")} />
            <RideChoice selected={bookingMode === "EVENT"} icon="event" title="Event Ride" price="Vehicle capacity based" onPress={() => startBookingFlow("event")} />
          </ScrollView>
        </View>
      </ScreenShell>
    );
  }

  if (screen === "event") {
    return (
      <EventSessionScreen
        customerId={customerId}
        api={API}
        onBack={goBack}
        onPrepared={(draft) => {
          setEventDraft(draft);
          setBookingMode("EVENT");
          setFare(Number(draft.fare || 0));
          setFareIsAuthoritative(Number.isFinite(Number(draft.fare)));
          setPickup(draft.startStopName);
          setDrop(draft.endStopName);
          setPassengers(1);
          setScreen("fare");
        }}
      />
    );
  }

  if (screen === "location") {
    const targetLabel =
      locationTarget === "pickup" ? "Pickup Location" :
      locationTarget === "drop" ? "Destination" :
      locationTarget === "stop" ? "Route Stop" :
      locationTarget === "interchange" ? "Interchange Point" :
      "Profile Address";
    return (
      <ScreenShell scroll>
        <HeaderBar title="Choose Location" onBack={goBack} right={<TopLanguage />} />
        <RideXMotionSurface height={48} intensity={0.40} compact muted label="RIDEX LOCATION SEARCH" />
        <Card>
          <Text style={s.cardTitle}>{targetLabel}</Text>
          <Text style={s.muted}>Type at least 1 alphabet. Search results are limited to 60 KM from the customer's current GPS location.</Text>
          <TextInput
            style={s.input}
            placeholder="Type 1 alphabet to search"
            value={locationSearchTerm}
            onChangeText={(value) => {
              setLocationSearchTerm(value);
              if (value.trim() && !userLocation) void refreshCurrentLocation(false);
            }}
            autoCapitalize="none"
          />
          {!userLocation ? <OutlineButton title="Use Current GPS" onPress={() => void refreshCurrentLocation(false)} /> : null}
          {locationSearchTerm.trim() && locationSearchResults.length === 0 ? (
            <Text style={s.message}>No related location found within 60 KM.</Text>
          ) : null}
          {locationSearchResults.map((item) => (
            <Pressable key={item.id} style={s.savedRow} onPress={() => applyLocationSelection(item.name || item.address, item.latitude, item.longitude)}>
              <AssetIcon name="pickup" size={18} />
              <View style={{flex:1}}>
                <Text style={s.savedTitle}>{item.name || item.address}</Text>
                <Text style={s.savedSub}>{item.address || "Location"} • {item.distanceKm.toFixed(1)} KM</Text>
              </View>
              <Text style={s.redText}>Select</Text>
            </Pressable>
          ))}
        </Card>
        <View style={s.mapLargeWrap}>
          <RideXMap
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            pickupLabel={pickup || "Pickup"}
            dropLabel={drop || "Destination"}
            showVehicles
            currentLocation={userLocation}
            onCurrentLocationPress={() => void refreshCurrentLocation(true)}
            onMapPress={(coordinate) => { void selectDestinationFromMap(coordinate.latitude, coordinate.longitude); }}
          />
          <Pressable style={[s.mapCenterButton, locationLoading && s.mapCenterButtonLoading]} onPress={() => void refreshCurrentLocation(true)} disabled={locationLoading}>
            <AssetIcon name={locationLoading ? "clock" : "recenter"} size={24} />
          </Pressable>
        </View>
        <Card>
          <Text style={s.cardTitle}>Saved Places</Text>
          <View style={s.quickPlacesRow}>
            <Pressable style={s.quickPlace} onPress={() => void saveCurrentLocation("Home")}>
              <AssetIcon name="homeSaved" size={24}/><Text style={s.quickPlaceTitle}>Home</Text><Text style={s.quickPlaceSub}>Save</Text>
            </Pressable>
            <Pressable style={s.quickPlace} onPress={() => void saveCurrentLocation("Work")}>
              <AssetIcon name="workSaved" size={24}/><Text style={s.quickPlaceTitle}>Work</Text><Text style={s.quickPlaceSub}>Save</Text>
            </Pressable>
          </View>
          {savedLocations.map((item) => (
            <View key={item.id} style={s.savedRow}>
              <Pressable style={{flex:1,flexDirection:"row",alignItems:"center",gap:10}} onPress={() => applyLocationSelection(String(item.address || item.label), Number(item.latitude), Number(item.longitude))}>
                <AssetIcon name={item.label === "Home" ? "homeSaved" : item.label === "Work" ? "workSaved" : "pickup"} size={20}/>
                <View style={{flex:1}}><Text style={s.savedTitle}>{item.label}</Text><Text style={s.savedSub}>{item.address}</Text></View>
              </Pressable>
              <Pressable onPress={() => void deleteSavedLocation(item.id)}><AssetIcon name="close" size={16}/></Pressable>
            </View>
          ))}
          <PrimaryButton title="Confirm Selection" trailing="→" onPress={() => {
            if (locationTarget === "pickup" && Number.isFinite(pickupLat)) {
              if (locationReturnScreen === "home") {
                void continueFromLocation();
              } else {
                setScreen(locationReturnScreen);
              }
            } else if (locationTarget === "drop" && Number.isFinite(dropLat)) {
              if (locationReturnScreen === "home") {
                void continueFromLocation();
              } else {
                setScreen(locationReturnScreen);
              }
            } else {
              setMessage("Select a location first.");
            }
          }} disabled={loading} />
        </Card>
      </ScreenShell>
    );
  }
  if (screen === "rideType") {
    return (
      <ScreenShell>
        <HeaderBar title="Choose Your Ride" onBack={goBack} right={<TopLanguage />} />
        <View style={s.rideMapTop}>
          <RideXMap pickupLat={pickupLat} pickupLng={pickupLng} dropLat={dropLat} dropLng={dropLng} pickupLabel={pickup} dropLabel={drop} showVehicles />
          <View style={s.routeSummary}>
            <View style={{ flex: 1 }}>
              <RoutePoint color={COLORS.red} title="Pickup" value={pickup || "Pickup location not set"} />
              <RoutePoint color={COLORS.red} title="Drop" value={drop || "Tap the map to select destination"} />
            </View>
            <View style={s.distanceBadge}>
              <Text style={s.distanceBig}>{routeDistanceKm > 0 ? `${routeDistanceKm.toFixed(1)} km` : "—"}</Text>
              <Text style={s.distanceSmall}>{routeDurationMinutes > 0 ? `${Math.round(routeDurationMinutes)} min route` : "Route unavailable"}</Text>
            </View>
          </View>
        </View>

        <View style={s.modeToggle}>
          <Pressable style={[s.modeToggleItem, s.modeActive]} onPress={() => {
            setBookingMode("RIDE");
          }}>
            <AssetIcon name="passengers" size={32} />
            <View>
              <Text style={s.modeTitle}>For Passengers</Text>
              <Text style={s.modeSub}>City Ride, Sharing Ride, InterCity Ride</Text>
            </View>
          </Pressable>
          <Pressable style={s.modeToggleItem} onPress={() => {
            setBookingMode("GOODS");
            setScreen("goods");
          }}>
            <AssetIcon name="parcel" size={32} />
            <View>
              <Text style={s.modeTitle}>For Logistic Goods</Text>
              <Text style={s.modeSub}>Logistic Parcel & Pickup Truck</Text>
            </View>
          </Pressable>
        </View>

        <Text style={s.sectionTitleLarge}>Choose Your Ride</Text>
        <Text style={s.muted}>RideX matches your selected service with an approved, eligible vehicle and driver from the backend catalog.</Text>
        <RideOption
          selected={rideType === "CITY_RIDE"}
          icon="ride"
          title="Full Ride"
          subtitle="City Ride logic · Passenger count not collected"
          meta="1–4"
          fare={fareIsAuthoritative ? `₹${fare.toFixed(2)}` : "Server calculated"}
          onPress={() => {
            setRideType("CITY_RIDE");
            setPassengers(1);
            clearSharedRideSelection();
          }}
        />
        <RideOption
          selected={rideType === "SHARING_RIDE"}
          icon="passengers"
          title="Sharing Ride"
          subtitle="Share ride, Save more"
          meta="1–4"
          fare={fareIsAuthoritative ? `₹${fare.toFixed(2)}` : "Server calculated"}
          onPress={() => setRideType("SHARING_RIDE")}
        />
        <RideOption
          selected={rideType === "INTERCITY_RIDE"}
          icon="route"
          title="Connection Ride"
          subtitle="Longer route with interchange"
          meta="1–4"
          fare={fareIsAuthoritative ? `₹${fare.toFixed(2)}` : "Server calculated"}
          onPress={() => { setRideType("INTERCITY_RIDE"); clearSharedRideSelection(); }}
        />

        {rideType === "SHARING_RIDE" && (
          <Card>
            <View style={s.sectionHeaderRow}>
              <Text style={s.cardTitle}>Sharing Route</Text>
              <OutlineButton title={sharedRoutesLoading ? "Loading…" : "Refresh"} small onPress={() => void loadSharedRideCatalog()} disabled={sharedRoutesLoading} />
            </View>
            <Text style={s.muted}>Choose an active Admin-defined route, then select pickup and drop points from that route.</Text>

            {sharedRoutesError ? (
              <View style={s.helpBanner}>
                <AssetIcon name="route" size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={s.helpBannerTitle}>Sharing Route catalog unavailable</Text>
                  <Text style={s.helpBannerSub}>{sharedRoutesError}</Text>
                </View>
              </View>
            ) : null}

            {sharedRoutes.length === 0 && !sharedRoutesLoading && !sharedRoutesError ? (
              <Text style={s.savedSub}>No active Sharing Routes are available right now.</Text>
            ) : null}

            <View style={s.chipRow}>
              {sharedRoutes.map((route) => (
                <Pressable
                  key={route.id}
                  style={[s.chip, sharedRouteId === route.id && s.chipSelected]}
                  onPress={() => selectSharedRoute(route.id)}
                >
                  <Text style={s.chipText}>{route.name}</Text>
                </Pressable>
              ))}
            </View>

            {getSelectedSharedRoute() ? (
              <>
                <Text style={[s.sectionLabel, { marginTop: 12 }]}>Pickup Point</Text>
                <View style={s.chipRow}>
                  {getSelectedSharedRoute()!.points.map((point) => (
                    <Pressable
                      key={`pickup-${point.id}`}
                      style={[s.chip, sharedPickupPointId === point.id && s.chipSelected]}
                      onPress={() => selectSharedPickupPoint(point.id)}
                    >
                      <Text style={s.chipText}>{point.sequence}. {point.name}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[s.sectionLabel, { marginTop: 12 }]}>Drop Point</Text>
                <View style={s.chipRow}>
                  {getSelectedSharedRoute()!.points.map((point) => {
                    const pickupPoint = getSelectedSharedPickupPoint();
                    const disabled = Boolean(pickupPoint && point.sequence <= pickupPoint.sequence);
                    return (
                      <Pressable
                        key={`drop-${point.id}`}
                        style={[s.chip, sharedDropPointId === point.id && s.chipSelected, disabled && { opacity: 0.45 }]}
                        onPress={() => { if (!disabled) selectSharedDropPoint(point.id); }}
                      >
                        <Text style={s.chipText}>{point.sequence}. {point.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {getSelectedSharedPickupPoint() && getSelectedSharedDropPoint() ? (
                  <View style={s.helpBanner}>
                    <AssetIcon name="route" size={22} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.helpBannerTitle}>Authoritative Sharing Ride selection</Text>
                      <Text style={s.helpBannerSub}>
                        {getSelectedSharedPickupPoint()!.name} → {getSelectedSharedDropPoint()!.name}
                      </Text>
                      <Text style={s.helpBannerSub}>
                        {getSelectedSharedPickupPoint()!.id} → {getSelectedSharedDropPoint()!.id}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
          </Card>
        )}

        {(rideType === "SHARING_RIDE" || rideType === "INTERCITY_RIDE") && (
          <Card>
            <Text style={s.cardTitle}>Passengers</Text>
            <View style={s.chipRow}>
              {[1,2,3,4].map((n) => (
                <Pressable key={n} style={[s.chip, passengers === n && s.chipSelected]} onPress={() => setPassengers(n)}>
                  <Text style={s.chipText}>{n} passenger{n > 1 ? "s" : ""}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        <Card>
          <View style={s.sectionHeaderRow}>
            <Text style={s.cardTitle}>Schedule Ride</Text>
            <Pressable style={[s.switchPill, scheduled && s.switchPillOn]} onPress={() => setScheduled((value) => !value)}>
              <Text style={s.switchText}>{scheduled ? "SCHEDULED" : "NOW"}</Text>
            </Pressable>
          </View>
          <Text style={s.muted}>Default = current time + 5 minutes. Customer can select any future time within 72 hours.</Text>
          {scheduled ? (
            <View style={s.scheduleGrid}>
              <View style={s.scheduleDateTimeRow}>
                <TextInput style={s.scheduleDateInput} value={scheduleDate} onChangeText={setScheduleDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                <TextInput style={s.scheduleTimeInput} value={scheduleTime} onChangeText={setScheduleTime} placeholder="hh:mm" keyboardType="numbers-and-punctuation" />
              </View>
              <View style={s.schedulePeriodRow}>
                <Pressable style={[s.schedulePeriodButton, schedulePeriod === "AM" && s.chipSelected]} onPress={() => setSchedulePeriod("AM")}><Text style={s.schedulePeriodText}>AM</Text></Pressable>
                <Pressable style={[s.schedulePeriodButton, schedulePeriod === "PM" && s.chipSelected]} onPress={() => setSchedulePeriod("PM")}><Text style={s.schedulePeriodText}>PM</Text></Pressable>
              </View>
            </View>
          ) : null}
        </Card>

        {vehicleCatalog.length > 0 ? (
          <Card>
            <Text style={s.cardTitle}>Available passenger vehicle</Text>
            <Text style={s.muted}>Customer-visible options must ultimately be confirmed by backend location + eligible-driver availability.</Text>
            {eligiblePassengerVehicles(vehicleCatalog, rideType).map((vehicle) => (
              <Pressable key={vehicle.code} style={[s.profileRow, selectedPassengerCatalogCode === vehicle.code && s.modeActive]} onPress={() => { setSelectedPassengerCatalogCode(vehicle.code); if (rideType !== "CITY_RIDE") setPassengers(current => clampPassengerCount(current, maxPassengerCount(vehicle))); }}>
                <View style={{ flex: 1 }}><Text style={s.profileRowTitle}>{vehicle.name}</Text><Text style={s.savedSub}>{vehicle.categoryName} · {vehicle.seating || `${vehicle.defaultCapacity} seats`} · {vehicle.speed || "Speed n/a"}</Text></View><Text style={s.detailLine}>{selectedPassengerCatalogCode === vehicle.code ? "Selected" : `${vehicle.defaultCapacity} max`}</Text>
              </Pressable>
            ))}
          </Card>
        ) : null}

        {rideType !== "CITY_RIDE" ? (
          <Card><Text style={s.cardTitle}>Passenger count</Text><Text style={s.muted}>Maximum is determined by the selected vehicle capacity.</Text><View style={s.counterRow}> {[1,2,3,4,5,6].filter(n => n <= passengerMaximum).map((value) => <Pressable key={value} style={[s.counterButton, passengers === value && s.chipSelected]} onPress={() => setPassengers(value)}><Text style={s.counterButtonText}>{value}</Text></Pressable>)}</View></Card>
        ) : null}

        {rideType === "CITY_RIDE" ? (
          <RouteStopsEditor
            stops={stops}
            onAdd={() => openLocationPicker("stop", "rideType")}
            onRemove={(index) => setStops((current) => current.filter((_, i) => i !== index))}
            onMove={(index, direction) => setStops((current) => {
              const next = [...current];
              const target = index + direction;
              if (target < 0 || target >= next.length) return current;
              [next[index], next[target]] = [next[target], next[index]];
              return next;
            })}
          />
        ) : (
          <Card>
            <Text style={s.cardTitle}>Route Stop Behavior</Text>
            <Text style={s.muted}>For Sharing Ride and InterCity Ride, an additional route stop can be introduced automatically when another passenger joins an active journey.</Text>
          </Card>
        )}

        {rideType === "INTERCITY_RIDE" ? (
          <Card>
            <Text style={s.cardTitle}>Interchange Points</Text>
            <Text style={s.muted}>Interchange locations are included in the route stop sequence.</Text>
            {interchangePoints.map((item, index) => (
              <View key={`${item}-${index}`} style={s.savedRow}>
                <View style={{flex:1}}>
                  <Text style={s.savedTitle}>{index + 1}. {item}</Text>
                  <Text style={s.savedSub}>Interchange point</Text>
                </View>
                <OutlineButton title="Remove" small onPress={() => {
                  setInterchangePoints((current) => current.filter((_, i) => i !== index));
                  setStops((current) => {
                    const pos = current.lastIndexOf(item);
                    return pos >= 0 ? current.filter((_, i) => i !== pos) : current;
                  });
                }} />
              </View>
            ))}
            <OutlineButton title="+ Add Interchange Point" onPress={() => openLocationPicker("interchange", "rideType")} />
          </Card>
        ) : null}

        <View style={s.paymentOfferRow}>
          <SoftTile icon="wallet" title="Pay with" sub="UPI, Wallet or Cash" />
          <SoftTile icon="%" title="Have a Promo Code?" sub="Apply & Save more" />
        </View>
        <PrimaryButton title={loading ? "Checking locations…" : "Book Ride"} trailing="→" onPress={() => void calculate()} disabled={loading} />
        <BottomNav active="book" onHome={() => setScreen("home")} onRides={() => setScreen("rides")} onWallet={() => setScreen("support")} onProfile={() => setScreen("profile")} />
      </ScreenShell>
    );
  }

  if (screen === "goods") {
    return (
      <ScreenShell>
        <HeaderBar title="Choose Logistic Goods Service" onBack={goBack} right={<TopLanguage />} />
        <View style={s.rideMapTop}>
          <RideXMap pickupLat={pickupLat} pickupLng={pickupLng} dropLat={dropLat} dropLng={dropLng} pickupLabel={pickup} dropLabel={drop} showVehicles goods />
          <View style={s.routeSummary}>
            <View style={{ flex: 1 }}>
              <RoutePoint color={COLORS.red} title="Pickup" value={pickup || "Pickup location not set"} />
              <RoutePoint color={COLORS.red} title="Drop" value={drop || "Tap the map to select destination"} />
            </View>
            <View style={s.distanceBadge}>
              <Text style={s.distanceBig}>{routeDistanceKm > 0 ? `${routeDistanceKm.toFixed(1)} km` : "—"}</Text>
              <Text style={s.distanceSmall}>{routeDurationMinutes > 0 ? `${Math.round(routeDurationMinutes)} min route` : "Route unavailable"}</Text>
            </View>
          </View>
        </View>

        <View style={s.modeToggle}>
          <Pressable style={s.modeToggleItem} onPress={() => { setBookingMode("RIDE"); setScreen("rideType"); }}>
            <AssetIcon name="passengers" size={32} />
            <View><Text style={s.modeTitle}>Passenger</Text><Text style={s.modeSub}>City · Share · InterCity</Text></View>
          </Pressable>
          <Pressable style={[s.modeToggleItem, s.modeActive]}>
            <AssetIcon name={goodsType === "Logistic Parcel" ? "parcel" : "truck"} size={32} />
            <View><Text style={s.modeTitle}>{goodsType === "Logistic Parcel" ? "Logistic Parcel" : "Logistic Goods Booking"}</Text><Text style={s.modeSub}>{goodsType === "Logistic Parcel" ? "Category 3 cargo/delivery • Logistic Parcel logic" : "Category 3 cargo/delivery • Logistic Goods logic"}</Text></View>
          </Pressable>
        </View>

        {goodsType === "Logistic Parcel" ? (
          <>
            <Card><Text style={s.cardTitle}>Cargo vehicle</Text><Text style={s.muted}>Vehicle category is Category 3; booking logic remains Logistic Parcel.</Text>{eligibleLogisticVehicles(vehicleCatalog, "PARCEL").map((vehicle)=><Pressable key={vehicle.code} style={[s.profileRow, selectedLogisticCatalogCode===vehicle.code&&s.modeActive]} onPress={()=>{setSelectedLogisticCatalogCode(vehicle.code);setGoodsVehicle(vehicle.operationalVehicleType);}}><View style={{flex:1}}><Text style={s.profileRowTitle}>{vehicle.name}</Text><Text style={s.savedSub}>{vehicle.categoryName} · {vehicle.speed||"Speed n/a"} · {vehicle.payload||"Payload n/a"}</Text></View><Text style={s.detailLine}>{selectedLogisticCatalogCode===vehicle.code?"Selected":"Select"}</Text></Pressable>)}</Card>
            <Text style={s.sectionTitleLarge}>Logistic Parcel Booking</Text>
            <View style={s.chipRow}>
              <Pressable style={[s.chip, parcelServiceType === "FULL" && s.chipSelected]} onPress={() => setParcelServiceType("FULL")}><Text style={s.chipText}>City Logistic Parcel Ride</Text></Pressable>
              <Pressable style={[s.chip, parcelServiceType === "QUICK" && s.chipSelected]} onPress={() => setParcelServiceType("QUICK")}><Text style={s.chipText}>Quick Logistic Parcel</Text></Pressable>
            </View>
            {(parcelServiceType === "FULL" ? parcelRows : parcelRows.slice(0,1)).map((row, index) => (
              <Card key={index} style={{marginTop:10}}>
                <Text style={s.cardTitle}>Logistic Parcel {index + 1}</Text>
                <View style={s.twoInputRow}>
                  <TextInput style={[s.compactInput,{flex:1}]} placeholder="Weight (kg)" keyboardType="numeric" value={row.weight} onChangeText={v=>setParcelRows(rows=>rows.map((r,i)=>i===index?{...r,weight:v}:r))} />
                  <TextInput style={[s.compactInput,{flex:1}]} placeholder="Description" value={row.description} onChangeText={v=>setParcelRows(rows=>rows.map((r,i)=>i===index?{...r,description:v}:r))} />
                </View>
              </Card>
            ))}
            {parcelServiceType === "FULL" && parcelRows.length < 50 ? <OutlineButton title="+ Add Logistic Parcel Item" onPress={() => setParcelRows(rows => [...rows,{weight:"",description:""}])} /> : null}
            {parcelServiceType === "FULL" ? (
              <RouteStopsEditor
              stops={stops}
              onAdd={() => openLocationPicker("stop", "goods")}
              onRemove={(index) => setStops((current) => current.filter((_, i) => i !== index))}
              onMove={(index, direction) => setStops((current) => {
                const next = [...current];
                const target = index + direction;
                if (target < 0 || target >= next.length) return current;
                [next[index], next[target]] = [next[target], next[index]];
                return next;
              })}
            />) : null}

            <Card style={{marginTop:10}}>
              <Text style={s.cardTitle}>Logistic Parcel Image (Optional)</Text>
              {parcelImageUri ? <Image source={{uri: parcelImageUri}} style={s.profilePhotoPreview} /> : <Text style={s.muted}>Optional parcel reference photo.</Text>}
              <OutlineButton title={parcelImageUri ? "Change Photo" : "Add Photo"} onPress={() => void chooseParcelImage()} />
            </Card>
            <Text style={s.safeNote}>Passenger E-Rickshaw • Logistic Parcel service</Text>
          </>
        ) : (
          <>
            <Text style={s.sectionTitleLarge}>Logistic Goods Vehicle Booking</Text>
            <GoodsOption
              selected={goodsVehicle === "PICKUP_TRUCK"}
              icon="truck"
              title="Battery Pickup Truck"
              subtitle="Logistic Goods only • no passenger / parcel"
              meta="Dedicated goods vehicle"
              fare="Duration + distance rules"
              onPress={() => setGoodsVehicle("PICKUP_TRUCK")}
/>
            <Card style={{marginTop:10}}>
              <Text style={s.cardTitle}>Logistic Goods Details</Text>
              <View style={s.twoInputRow}>
                <TextInput style={[s.compactInput,{flex:1}]} placeholder="Estimated weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
                <TextInput style={[s.compactInput,{flex:1}]} placeholder="Description" value={goodsDescription} onChangeText={setGoodsDescription} />
              </View>
              <TextInput style={s.scheduleInput} placeholder="Duration (minutes)" keyboardType="numeric" value={durationMinutes} onChangeText={setDurationMinutes} />
            </Card>
          </>
        )}

        <Card>
          <View style={s.sectionHeaderRow}>
            <Text style={s.cardTitle}>Schedule Ride</Text>
            <Pressable style={[s.switchPill, scheduled && s.switchPillOn]} onPress={() => setScheduled((value) => !value)}>
              <Text style={s.switchText}>{scheduled ? "SCHEDULED" : "NOW"}</Text>
            </Pressable>
          </View>
          <Text style={s.muted}>Default = current time + 5 minutes. Customer can select any future time within 72 hours.</Text>
          {scheduled ? (
            <View style={s.scheduleGrid}>
              <View style={s.scheduleDateTimeRow}>
                <TextInput style={s.scheduleDateInput} value={scheduleDate} onChangeText={setScheduleDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                <TextInput style={s.scheduleTimeInput} value={scheduleTime} onChangeText={setScheduleTime} placeholder="hh:mm" keyboardType="numbers-and-punctuation" />
              </View>
              <View style={s.schedulePeriodRow}>
                <Pressable style={[s.schedulePeriodButton, schedulePeriod === "AM" && s.chipSelected]} onPress={() => setSchedulePeriod("AM")}><Text style={s.schedulePeriodText}>AM</Text></Pressable>
                <Pressable style={[s.schedulePeriodButton, schedulePeriod === "PM" && s.chipSelected]} onPress={() => setSchedulePeriod("PM")}><Text style={s.schedulePeriodText}>PM</Text></Pressable>
              </View>
            </View>
          ) : null}
        </Card>

        <Card>
          <Text style={s.cardTitle}>Delivery Note</Text>
          <TextInput style={s.input} placeholder="Optional loading / handling note" value={specialInstructions} onChangeText={setSpecialInstructions} multiline />
        </Card>

        <PrimaryButton title="Continue to Review" trailing="→" onPress={() => {
          if (!isProfileActuallyComplete()) {
            setPendingBookingTarget(goodsType === "Logistic Parcel" ? "parcel" : "goods");
            setScreen("editProfile");
            return;
          }
          if (!pickup.trim() || !drop.trim() || !goodsType.trim()) {
            setMessage("Please enter pickup, drop and service details.");
            return;
          }
          if (scheduled && !validateScheduledPickup()) return;
          setFare(0);
          setFareIsAuthoritative(false);
          setScreen("fare");
        }} />
        <View style={s.safeNoteRow}><AssetIcon name="security" size={18}/><Text style={s.safeNote}>Your goods are safe and secure with RideX</Text></View>
        <Text style={s.message}>{message}</Text>
      </ScreenShell>
    );
  }

  if (screen === "fare") {
    return (
      <ScreenShell>
        <HeaderBar title="Review & Confirm" onBack={goBack} right={<SupportPill onPress={() => setScreen("support")} />} />
        <ProgressSteps active={bookingMode === "GOODS" ? "Details" : bookingMode === "EVENT" ? "Event" : "Review"} />
        <View style={s.mapReviewTop}>
          <RideXMap
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            pickupLabel={pickup}
            dropLabel={drop}
            showVehicles={false}
            goods={bookingMode === "GOODS"}
            currentLocation={userLocation}
            routeGeometry={routeGeometry}
          />
        </View>

        <Card>
          <View style={s.sectionHeaderRow}>
            <Text style={s.cardTitle}>Location Compatibility</Text>
            <Text style={{
              fontSize: 11,
              fontWeight: "900",
              color: locationCompatibility.status === "INVALID" ? COLORS.red : locationCompatibility.status === "VALID" ? COLORS.green : COLORS.muted,
            }}>
              {locationCompatibility.status === "INVALID" ? "CHECK REQUIRED" : locationCompatibility.status === "VALID" ? "VALIDATED" : "BACKEND CHECK"}
            </Text>
          </View>
          <Text style={s.muted}>
            {locationCompatibility.pickupCity || "Pickup city resolving…"} → {locationCompatibility.dropCity || "Destination city resolving…"}
          </Text>
          <Text style={[s.muted, { marginTop: 5 }]}>
            {locationCompatibility.reason}
          </Text>
          <Text style={[s.muted, { marginTop: 5 }]}>
            Service-zone eligibility is still authoritative from the RideX backend.
          </Text>
        </Card>

        <Card>
          <View style={s.sectionHeaderRow}>
            <Text style={s.cardTitle}>Selected Vehicle</Text>
            <Pressable onPress={goBack}><Text style={s.redText}>Change</Text></Pressable>
          </View>
          {bookingMode === "GOODS" ? (
            <VehicleSummary icon="truck" title={goodsType === "Logistic Parcel" ? (selectedLogisticVehicle?.name || "Category 3 Cargo Vehicle") : (selectedLogisticVehicle?.name || "Category 3 Cargo Vehicle")} fare={fareIsAuthoritative ? `₹${fare.toFixed(2)}` : "Server calculated"} meta={goodsType === "Logistic Parcel" ? `Logistic Parcel · ${selectedLogisticVehicle?.payload || "payload by catalog"}` : `Logistic Goods · ${selectedLogisticVehicle?.payload || "payload by catalog"}`} />
          ) : bookingMode === "EVENT" ? (
            <VehicleSummary icon="ride" title={selectedEventVehicle?.name || eventDraft?.eventTitle || "Event / Sessional Ride"} fare={fareIsAuthoritative ? `₹${fare.toFixed(2)}` : "Server calculated"} meta={`${eventDraft?.startStopName || pickup} → ${eventDraft?.endStopName || drop} · Max ${passengerMaximum}`} />
          ) : (
            <VehicleSummary icon="ride" title={selectedPassengerVehicle?.name || customerRideTypeLabel(rideType)} fare={fareIsAuthoritative ? `₹${fare.toFixed(2)}` : "Server calculated"} meta={rideType === "CITY_RIDE" ? "Full Ride · Passenger count not collected" : `Capacity-based · up to ${passengerMaximum}`} />
          )}
        </Card>

        {bookingMode === "GOODS" ? (
          <Card>
            <View style={s.sectionHeaderRow}>
              <Text style={s.cardTitle}>Logistic Goods Details</Text>
              <Text style={s.muted}>Add Details </Text>
            </View>
            <View style={s.chipRow}>
              {(["SMALL","MEDIUM","LARGE"] as GoodsSize[]).map((sz) => (
                <Pressable key={sz} style={[s.chip, size === sz && s.chipSelected]} onPress={() => setSize(sz)}>
                  <Text style={s.chipText}>{sz === "SMALL" ? "Small Items" : sz === "MEDIUM" ? "Medium" : "Large"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.twoInputRow}>
              <TextInput style={[s.compactInput,{flex:1}]} placeholder="Estimated weight (kg)" keyboardType="numeric" value={weight} onChangeText={setWeight} />
              <TextInput style={[s.compactInput,{flex:1}]} placeholder="Item Description" value={goodsDescription} onChangeText={setGoodsDescription} />
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={s.cardTitle}>Ride Details</Text>
            {bookingMode === "EVENT" ? (
              <>
                <Text style={s.detailLine}>Service: Event / Sessional Ride</Text>
                <Text style={s.detailLine}>Event: {eventDraft?.eventTitle || "—"}</Text>
                <Text style={s.detailLine}>Session: {eventDraft?.sessionStartAt || "—"} → {eventDraft?.sessionEndAt || "—"}</Text>
                <Text style={s.detailLine}>Start: {eventDraft?.startStopName || pickup}</Text>
                <Text style={s.detailLine}>End: {eventDraft?.endStopName || drop}</Text>
                <Text style={s.detailLine}>Vehicle: {selectedEventVehicle?.name || "Checking availability…"}</Text>
                <Text style={s.detailLine}>Passenger capacity: {passengerMaximum}</Text>
              </>
            ) : (
              <Text style={s.detailLine}>Ride Type: {customerRideTypeLabel(rideType)}</Text>
            )}
            {(rideType !== "CITY_RIDE") && <Text style={s.detailLine}>Passengers: {passengers}</Text>}
            {scheduled && <Text style={s.detailLine}>Scheduled: {scheduleDate} {scheduleTime} {schedulePeriod}</Text>}
          </Card>
        )}

        {bookingMode === "EVENT" ? (
          <>
            <Card>
              <Text style={s.cardTitle}>Available Event Ride Vehicles</Text>
              <Text style={s.muted}>{eventAvailabilityLoading ? "Checking live vehicle availability at the selected event stop…" : eventAvailabilityMessage || "Only currently available passenger vehicle categories/models are shown."}</Text>
              <View style={{ marginTop: 10 }}>
                {eventAvailableVehicles.map((vehicle) => (
                  <Pressable key={vehicle.code} style={[s.profileRow, selectedEventVehicle?.code === vehicle.code && s.modeActive]} onPress={() => setSelectedPassengerCatalogCode(vehicle.code)}>
                    <View style={{ flex: 1 }}><Text style={s.profileRowTitle}>{vehicle.name}</Text><Text style={s.savedSub}>{vehicle.categoryName} · {vehicle.seating || `${vehicle.defaultCapacity} seats`} · {vehicle.speed || "Speed n/a"}</Text></View><Text style={s.detailLine}>{selectedEventVehicle?.code === vehicle.code ? "Selected" : `${vehicle.defaultCapacity} max`}</Text>
                  </Pressable>
                ))}
              </View>
            </Card>
            <Card>
            <Text style={s.cardTitle}>Event Passenger Count</Text>
            <Text style={s.muted}>Passenger count depends on the selected Category 1/2 vehicle capacity.</Text>
            <View style={s.counterRow}>
              {[1,2,3,4,5,6].filter(n => n <= passengerMaximum).map((value) => (
                <Pressable key={value} style={[s.counterButton, passengers === value && s.chipSelected]} onPress={() => setPassengers(value)}>
                  <Text style={s.counterButtonText}>{value}</Text>
                </Pressable>
              ))}
            </View>
            </Card>
          </>
        ) : null}

        <View style={s.actionTwoCol}>
          <SoftTile icon="schedule" title="Schedule" sub={scheduled ? `${scheduleDate} ${scheduleTime} ${schedulePeriod}` : "Now"} />
          <SoftTile icon="receipt" title="Route & Pricing" sub={fareIsAuthoritative ? "Backend calculated" : "Backend will calculate"} />
        </View>
        <Card>
          <View style={s.sectionHeaderRow}>
            <Text style={s.cardTitle}>Payment Method</Text>
            <Text style={s.muted}>Card payments unavailable</Text>
          </View>
          <View style={s.actionTwoCol}>
            {(["CASH","UPI","WALLET"] as PaymentMethod[]).map(method => (
              <Pressable key={method} style={[s.softCard, paymentMethod === method && s.chipSelected]} onPress={() => setPaymentMethod(method)}>
                <AssetIcon name={method === "CASH" ? "cash" : method === "UPI" ? "upi" : "wallet"} size={26} />
                <Text style={s.softTitle}>{method === "CASH" ? "Cash" : method === "UPI" ? "UPI" : "Wallet"}</Text>
                <Text style={s.softSub}>{method === "CASH" ? "Pay driver" : method === "UPI" ? "Online payment" : "Use balance"}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
        <Card>
          <Text style={s.cardTitle}>Promo Code</Text>
          <TextInput
            style={s.input}
            placeholder="Enter promo code"
            value={couponCode}
            onChangeText={(value) => {
              setCouponCode(value.toUpperCase());
              setCouponMessage("");
              setCouponDiscount(0);
            }}
            autoCapitalize="characters"
          />
          <Text style={s.muted}>RideX validates the promo against the backend fare when you confirm the booking.</Text>
          {couponMessage ? <Text style={couponDiscount > 0 ? s.greenText : s.redText}>{couponMessage}</Text> : null}
        </Card>

        <Card>
          <Text style={s.cardTitle}>Booking Fare</Text>
          <Text style={s.fare}>
            {fareIsAuthoritative ? `₹${fare.toFixed(2)}` : "Calculated by RideX"}
          </Text>
          <Text style={s.muted}>
            {fareIsAuthoritative
              ? "Authoritative fare returned by the RideX backend."
              : "Road route, pricing rules, Smart Pricing and any promo are evaluated by the backend at confirmation."}
          </Text>
        </Card>

        <Card>
          <Text style={s.cardTitle}>Special Instructions</Text>
          <TextInput style={s.input} placeholder="Optional note for the booking" value={specialInstructions} onChangeText={setSpecialInstructions} multiline />
        </Card>

        <PrimaryButton
          title={bookingMode === "GOODS" ? "Confirm Logistic Goods Booking" : bookingMode === "EVENT" ? "Confirm Event Booking" : "Confirm & Book Ride"}
          trailing="→"
          onPress={book}
          disabled={loading}
        />
        <Text style={s.message}>{message}</Text>
      </ScreenShell>
    );
  }

  if (screen === "qrScanner") {
    return <View style={{flex:1,backgroundColor:"#000"}}>
      <CameraView style={{flex:1}} facing="back" barcodeScannerSettings={{barcodeTypes:["qr"]}} onBarcodeScanned={async (event)=>{
        if(!qrScannerOpen) return;
        const credential = String(event.data || "");
        setQrScannerOpen(false); setScreen("confirmed"); setVerificationCredential(credential);
        try {
          const legId = activeLegId || await fetchBooking();
          if (!legId) { setMessage("Active ride leg is not available yet. Please open the QR scanner again after the ride status refreshes."); return; }
          const response=await ridexFetch(`${API}/trips/verification/verify`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({bookingId,legId,method:"QR",credential})});
          const data=await response.json();
          if (response.ok && data.success) {
            setVerificationQrVerified(true);
            setMessage("QR verified. The Driver must enter the Ride OTP before the trip can start.");
          } else {
            setMessage(data.message || "QR verification failed");
          }
          await fetchBooking();
        } catch { setMessage("QR verification unavailable"); }
      }} />
      <View style={{position:"absolute",bottom:40,left:20,right:20}}><PrimaryButton title="Close Scanner" onPress={()=>{setQrScannerOpen(false);setScreen("confirmed");}} /></View>
    </View>;
  }

  if (screen === "confirmed") {
    return (
      <ScreenShell>
        <HeaderBar title={bookingMode === "GOODS" ? "RideX Logistic Goods" : "RideX Ride"} onBack={goBack} right={<SupportPill onPress={() => setScreen("support")} />} />
        <RideXMotionSurface height={60} intensity={0.65} compact label="ACTIVE RIDE FLOW" />

        {isNoMatch ? (
          <NoMatchState
            goods={activeGoodsUsesTruck}
            pickup={pickup}
            drop={drop}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            fare={Number(fare)}
            reason={matchingReason}
            currentLocation={userLocation}
            locationLoading={locationLoading}
            onCurrentLocationPress={() => void refreshCurrentLocation(true)}
            onRefresh={() => void fetchBooking()}
            onCancel={() => void cancelActiveBooking()}
          />
        ) : isScheduledBooking ? (
          <ScheduledState
            goods={activeGoodsUsesTruck}
            pickup={pickup}
            drop={drop}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            fare={Number(fare)}
            currentLocation={userLocation}
            routeGeometry={routeGeometry}
            scheduledText={
              scheduledPickupText
                ? (() => {
                    const parsed = new Date(scheduledPickupText);
                    return Number.isNaN(parsed.getTime())
                      ? scheduledPickupText
                      : parsed.toLocaleString();
                  })()
                : `${scheduleDate} ${scheduleTime} ${schedulePeriod}`
            }
            onRefresh={() => void fetchBooking()}
          />
        ) : isSearching ? (
          <SearchState
            goods={activeGoodsUsesTruck}
            pickup={pickup}
            drop={drop}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            fare={Number(fare)}
            matchingState={matchingState}
            currentLocation={userLocation}
            locationLoading={locationLoading}
            onCurrentLocationPress={() => void refreshCurrentLocation(true)}
          />
        ) : isAssigned ? (
          <AssignedState
            goods={activeGoodsUsesTruck}
            driverId={driverId}
            distanceKm={driverDistanceKm}
            driverLocation={driverLocation}
            driverName={driverName}
            driverRating={driverRating}
            vehicleType={driverVehicleType}
            vehicleNumber={driverVehicleNumber}
            currentLocation={userLocation}
            routeGeometry={routeGeometry}
                    pickup={pickup}
            drop={drop}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            locationLoading={locationLoading}
            onCurrentLocationPress={() => void refreshCurrentLocation(false)}
            onSafety={() => { setSosConfirm(false); setScreen("safety"); }}
            onChat={() => void createSupportCase("Active Ride Support", "Customer requested support about the active ride.", "NORMAL").then(ok => { if (ok) setScreen("support"); })}
            onCancel={() => void cancelActiveBooking()}
            onCall={() => void callAssignedDriver()}
          />
        ) : isArrived ? (
          <ArrivedState
            goods={activeGoodsUsesTruck}
            driverLocation={driverLocation}
            driverId={driverId}
            currentLocation={userLocation}
            routeGeometry={routeGeometry}
            driverName={driverName}
            driverRating={driverRating}
            vehicleType={driverVehicleType}
            vehicleNumber={driverVehicleNumber}
            pickup={pickup}
            drop={drop}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            locationLoading={locationLoading}
            onCurrentLocationPress={() => void refreshCurrentLocation(false)}
            onSafety={() => { setSosConfirm(false); setScreen("safety"); }}
            onChat={() => void createSupportCase("Active Ride Support", "Customer requested support about the active ride.", "NORMAL").then(ok => { if (ok) setScreen("support"); })}
            onCancel={() => void cancelActiveBooking()}
            onCall={() => void callAssignedDriver()}
          />
        ) : isTripStarted ? (
          <TripInProgressState
            goods={activeGoodsUsesTruck}
            driverLocation={driverLocation}
            driverId={driverId}
            currentLocation={userLocation}
            routeGeometry={routeGeometry}
            driverName={driverName}
            driverRating={driverRating}
            vehicleType={driverVehicleType}
            vehicleNumber={driverVehicleNumber}
            pickup={pickup}
            drop={drop}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            locationLoading={locationLoading}
            onCurrentLocationPress={() => void refreshCurrentLocation(false)}
            onSafety={() => { setSosConfirm(false); setScreen("safety"); }}
            onChat={() => void createSupportCase("Active Ride Support", "Customer requested support about the active ride.", "NORMAL").then(ok => { if (ok) setScreen("support"); })}
            onCancel={() => void cancelActiveBooking()}
            onCall={() => void callAssignedDriver()}
          />
        ) : (
          <SearchState
            goods={activeGoodsUsesTruck}
            pickup={pickup}
            drop={drop}
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            fare={Number(fare)}
            matchingState={matchingState}
            currentLocation={userLocation}
            locationLoading={locationLoading}
            onCurrentLocationPress={() => void refreshCurrentLocation(true)}
          />
        )}

        <Card>
          <View style={s.tripInfoRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Pickup & Drop Details</Text>
              <RoutePoint color={COLORS.red} title="Pickup" value={pickup || "Pickup location not set"} />
              <RoutePoint color={COLORS.red} title="Drop" value={drop || "Tap the map to select destination"} />
            </View>
            <View style={s.distancePanel}>
              <Text style={s.distanceBig}>{routeDistanceKm > 0 ? `${routeDistanceKm.toFixed(1)} km` : "—"}</Text>
              <Text style={s.distanceSmall}>{routeDurationMinutes > 0 ? `${Math.round(routeDurationMinutes)} min route` : "Route unavailable"}</Text>
            </View>
          </View>
        </Card>

        {isArrived && !isTripStarted && (
          <Card style={s.pinCard}>
            <Text style={s.pinTitle}>Ride Verification</Text>
            <Text style={s.pinSub}>RideX requires BOTH QR and OTP verification before the Driver can start this ride leg.</Text>

            <View style={s.verificationStep}>
              <View style={s.verificationStepNumber}><Text style={s.verificationStepNumberText}>1</Text></View>
              <View style={{flex:1}}>
                <Text style={s.verificationStepTitle}>QR Verification</Text>
                <Text style={s.verificationStepSub}>Scan the backend-generated QR shown by the Driver.</Text>
              </View>
              <Text style={verificationQrVerified ? s.verificationVerified : s.verificationPending}>
                {verificationQrVerified ? "VERIFIED" : "PENDING"}
              </Text>
            </View>

            {!verificationQrVerified ? (
              <PrimaryButton title="Open QR Scanner" onPress={async()=>{ if(!cameraPermission?.granted) await requestCameraPermission(); setQrScannerOpen(true); setScreen("qrScanner"); }} />
            ) : null}

            <View style={s.verificationStep}>
              <View style={s.verificationStepNumber}><Text style={s.verificationStepNumberText}>2</Text></View>
              <View style={{flex:1}}>
                <Text style={s.verificationStepTitle}>Ride OTP</Text>
                <Text style={s.verificationStepSub}>The backend delivers the OTP to you. Show it to the Driver; the Driver enters it in the Driver App.</Text>
                {verificationOtp ? (
                  <View style={s.verificationOtpBox}>
                    <Text style={s.verificationOtpLabel}>YOUR RIDE OTP</Text>
                    <Text style={s.verificationOtp}>{verificationOtp}</Text>
                    {verificationOtpExpiresAt ? (
                      <Text style={s.verificationOtpExpiry}>Expires {new Date(verificationOtpExpiresAt).toLocaleTimeString()}</Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={s.verificationPendingText}>Waiting for the backend Ride OTP to be delivered to this customer session.</Text>
                )}
              </View>
            </View>

            <View style={s.verificationRule}>
              <Text style={s.blueInfo}>ℹ Trip status changes to STARTED only after the backend confirms both verification steps.</Text>
              <Text style={s.muted}>Verification method: {verificationMethod === "BOTH" ? "QR + OTP" : verificationMethod}</Text>
            </View>
          </Card>
        )}

        {isTripStarted && (
          <Card style={s.verifyCard}>
            <Text style={s.pinTitle}>Verify Driver & Start Trip</Text>
            <Text style={s.pinSub}>Verification completed by the RideX backend for this trip.</Text>
            <Text style={s.greenText}>✓ Trip verification complete</Text>
          </Card>
        )}

        {cancelReviewOpen ? (
          <View style={s.cancelReviewOverlay}>
            <View style={s.cancelReviewCard}>
              <Text style={s.cancelReviewTitle}>Cancel this booking?</Text>
              <Text style={s.cancelReviewSub}>Select a reason before the secure cancellation OTP step.</Text>

              <Text style={s.fieldLabel}>Reason for cancellation</Text>
              <View style={s.cancelReasonList}>
                {CUSTOMER_CANCEL_REASON_OPTIONS.map((option) => (
                  <Pressable
                    key={option.id}
                    style={[s.cancelReasonItem, selectedCancelReason === option.id && s.cancelReasonItemSelected]}
                    onPress={() => setSelectedCancelReason(option.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedCancelReason === option.id }}
                  >
                    <View style={[s.cancelReasonRadio, selectedCancelReason === option.id && s.cancelReasonRadioSelected]}>
                      {selectedCancelReason === option.id ? <View style={s.cancelReasonRadioDot} /> : null}
                    </View>
                    <Text style={[s.cancelReasonText, selectedCancelReason === option.id && s.cancelReasonTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={s.cancelFeeBox}>
                <Text style={s.cancelFeeLabel}>Cancellation charge</Text>
                {cancelFeePreviewAvailable && cancelFeePreview !== null ? (
                  <Text style={s.cancelFeeValue}>₹{cancelFeePreview.toFixed(2)}</Text>
                ) : (
                  <Text style={s.cancelFeePending}>Not provided by the current customer-cancel API contract</Text>
                )}
              </View>
              <Text style={s.cancelFeeNote}>RideX will not display a made-up fee. Any applicable charge remains backend-authoritative.</Text>

              <PrimaryButton
                title="Continue to Secure OTP"
                onPress={() => void continueCancellationToOtp()}
                disabled={loading}
              />
              <OutlineButton
                title="Keep Ride"
                onPress={() => {
                  if (loading) return;
                  setCancelReviewOpen(false);
                }}
                disabled={loading}
              />
            </View>
          </View>
        ) : null}

        {protectedOtpOpen && protectedOtpAction ? (
          <View style={s.protectedOtpOverlay}>
            <View style={s.protectedOtpCard}>
              <Text style={s.protectedOtpTitle}>{protectedOtpConfig(protectedOtpAction).title}</Text>
              <Text style={s.protectedOtpSub}>{protectedOtpConfig(protectedOtpAction).subtitle}</Text>
              <Text style={s.fieldLabel}>{protectedOtpConfig(protectedOtpAction).fieldLabel}</Text>
              <TextInput
                style={s.pinInput}
                value={protectedOtp}
                onChangeText={(value) => setProtectedOtp(value.replace(/\D/g, "").slice(0, 4))}
                keyboardType="number-pad"
                placeholder="1234"
                maxLength={4}
                autoFocus
              />
              {protectedOtpAttemptsRemaining !== null ? (
                <Text style={s.protectedOtpAttempts}>Attempts remaining: {protectedOtpAttemptsRemaining}</Text>
              ) : null}
              {protectedOtpMessage ? <Text style={s.protectedOtpMessage}>{protectedOtpMessage}</Text> : null}
              <PrimaryButton
                title={protectedOtpBusy ? "Verifying..." : protectedOtpAttemptsRemaining === 0 ? "Request New OTP" : protectedOtpConfig(protectedOtpAction).verifyTitle}
                onPress={() => protectedOtpAttemptsRemaining === 0 ? void requestProtectedOtp(protectedOtpAction, false) : void verifyProtectedOtp()}
                disabled={protectedOtpBusy}
              />
              <OutlineButton
                title={protectedOtpResendCountdown > 0 ? `Resend OTP in ${protectedOtpResendCountdown}s` : "Resend OTP"}
                onPress={() => void requestProtectedOtp(protectedOtpAction, true)}
                disabled={protectedOtpBusy || protectedOtpResendCountdown > 0}
              />
              <OutlineButton
                title="Keep Ride"
                onPress={() => {
                  if (protectedOtpBusy) return;
                  setProtectedOtpOpen(false);
                  setProtectedOtpAction(null);
                  setProtectedOtp("");
                  setProtectedOtpMessage("");
                  setProtectedOtpResendAvailableAt(null);
                  setProtectedOtpAttemptsRemaining(null);
                }}
                disabled={protectedOtpBusy}
              />
            </View>
          </View>
        ) : null}

        <View style={s.actionTwoCol}>
          <SoftTile icon="liveLocation" title="Trip Summary" sub="View ride history and receipt" onPress={()=>setScreen("rides")} />
          <SoftTile icon="safety" title="Safety Center" sub="Your safety is our priority" onPress={() => {
            setSosConfirm(false);
            setScreen("safety");
          }} />
        </View>

        {bookingStatus === "IN_PROGRESS" && (
          <PrimaryButton title={loading ? "Ending..." : "End Ride"} onPress={customerEndRide} disabled={loading} />
        )}

        <View style={s.tripBottomRow}>
          <OutlineButton title="Refresh Status" onPress={fetchBooking} />
          <OutlineButton title="Go to Home" onPress={() => setScreen("home")} />
        </View>
      </ScreenShell>
    );
  }

  if (screen === "payment") {
    return (
      <ScreenShell>
        <HeaderBar title="Trip Completed" onBack={() => setScreen("home")} right={<SupportPill onPress={() => setScreen("support")} />} />
        <View style={s.completedBanner}>
          <View style={s.completedCircle}><AssetIcon name="verified" size={38} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.completedTitle}>{bookingMode === "GOODS" ? "Logistic Goods Delivered!" : "Trip Completed!"}</Text>
            <Text style={s.completedSub}>You have reached your destination safely.</Text>
          </View>
        </View>

        <RideXMap pickupLat={pickupLat} pickupLng={pickupLng} dropLat={dropLat} dropLng={dropLng} pickupLabel={pickup} dropLabel={drop} completed />

        <Card>
          <DriverSummary driverId={driverId} goods={bookingMode === "GOODS"} driverName={driverName} driverRating={driverRating} vehicleType={driverVehicleType} vehicleNumber={driverVehicleNumber} />
        </Card>

        <Card style={s.fareReceiptCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Fare Details</Text>
            <Text style={s.detailLine}>Road distance <Text style={s.rightAmount}>{routeDistanceKm > 0 ? `${routeDistanceKm.toFixed(1)} km` : "—"}</Text></Text>
            <Text style={s.detailLine}>Route duration <Text style={s.rightAmount}>{routeDurationMinutes > 0 ? `${Math.round(routeDurationMinutes)} mins` : "—"}</Text></Text>
            <Text style={s.detailLine}>Payment method <Text style={s.rightAmount}>{paymentMethod}</Text></Text>
            <View style={s.receiptTotalRow}>
              <Text style={s.receiptTotalLabel}>Total Fare</Text>
              <Text style={s.receiptTotal}>{fareIsAuthoritative ? `₹${fare.toFixed(2)}` : "—"}</Text>
            </View>
          </View>
          <View style={s.paymentSuccess}>
            <AssetIcon name={paymentStatus === "SUCCESS" ? "verified" : paymentMethod === "CASH" ? "cash" : paymentMethod === "UPI" ? "upi" : "wallet"} size={40} />
            <Text style={s.paymentSuccessTitle}>{paymentStatus === "SUCCESS" ? "Payment Successful" : paymentMethod === "CASH" ? "Cash Collection Pending" : "Payment Pending"}</Text>
            <Text style={s.paymentSuccessSub}>{paymentMethod === "CASH" ? "Cash collection is reconciled by RideX." : `Method: ${paymentMethod}`}</Text>
            {paymentMethod === "UPI" && !RIDEX_TEST_MODE && paymentStatus !== "SUCCESS" && paymentStatus !== "FAILED" ? (
              <View style={{ marginTop: 8, alignItems: "center", width: "100%" }}>
                <Text style={s.muted}>UPI payment status: {paymentStatus || "PENDING"}</Text>
                <OutlineButton
                  title={paymentPreparing ? "Refreshing..." : "Refresh Payment Status"}
                  onPress={async () => {
                    if (!bookingId || paymentPreparing) return;
                    setPaymentPreparing(true);
                    try {
                      await refreshAuthoritativePaymentStatus();
                      setMessage("UPI payment status refreshed.");
                    } finally {
                      setPaymentPreparing(false);
                    }
                  }}
                  disabled={paymentPreparing}
                  small
                />
              </View>
            ) : null}
            {RIDEX_TEST_MODE && paymentMethod !== "CASH" && paymentStatus !== "SUCCESS" ? <OutlineButton title={paymentPreparing ? "Processing..." : paymentStatus === "UNKNOWN" ? "Check TEST Payment Status" : "Complete TEST Payment"} onPress={() => void (paymentStatus === "UNKNOWN" ? refreshAuthoritativePaymentStatus() : completeTestPayment())} disabled={paymentPreparing} small /> : null}
            <Pressable onPress={() => setScreen("rides")}><Text style={s.redText}>View Receipt </Text></Pressable>
          </View>
        </Card>

        <Card>
          <Text style={s.cardTitle}>Rate Your Driver</Text>
          <Text style={s.muted}>How was your ride with the driver?</Text>
          <View style={s.stars}>
            {[1,2,3,4,5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)}><Text style={n <= stars ? s.starActive : s.starInactive}></Text></Pressable>
            ))}
          </View>
          <TextInput
            style={s.commentInput}
            multiline
            placeholder="Write a review (optional)..."
            value={comment}
            onChangeText={setComment}
            placeholderTextColor={COLORS.muted}
          />
          <PrimaryButton title="Submit" onPress={submitRating} disabled={loading} />
        </Card>

        <View style={s.tripBottomRow}>
          <OutlineButton title="Book Another Ride" onPress={startNewBooking} />
          <PrimaryButton title="Go to Home" onPress={() => setScreen("home")} />
        </View>
        <Card style={s.greenThanks}>
          <View style={s.greenThanksRow}><AssetIcon name="verified" size={20} /><Text style={s.greenThanksTitle}>Thank you for riding with RideX!</Text></View>
          <Text style={s.muted}>Safer Cities. Happier Journeys.</Text>
        </Card>
      </ScreenShell>
    );
  }

  if (screen === "rating") {
    return (
      <ScreenShell>
        <HeaderBar title="Rate Your Driver" onBack={goBack} />
        <Card>
          <Text style={s.authTitle}>How was your ride?</Text>
          <View style={s.stars}>
            {[1,2,3,4,5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)}>
                <Text style={n <= stars ? s.starActive : s.starInactive}></Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={s.commentInput} multiline value={comment} onChangeText={setComment} placeholder="Optional comment" />
          <PrimaryButton title={loading ? "Submitting..." : "Submit Rating"} onPress={submitRating} disabled={loading} />
          <OutlineButton title="Skip for now" onPress={() => setScreen("home")} />
        </Card>
      </ScreenShell>
    );
  }

  if (screen === "notifications") {
    return (
      <ScreenShell>
        <HeaderBar
          title="Notifications"
          onBack={() => setScreen("home")}
          right={
            <OutlineButton title="Mark all read" onPress={() => void markAllNotificationsRead()} small />
          }
        />
        {!notifications.length ? (
          <Card><Text style={s.cardTitle}>No notifications</Text><Text style={s.muted}>New ride, payment and safety updates will appear here.</Text></Card>
        ) : notifications.map((item) => (
          <Pressable key={item.id} style={[s.notificationRow, !item.readAt && s.notificationUnread]} onPress={() => void markNotificationRead(item.id)}>
            <View style={s.notificationIcon}><AssetIcon name="notification" size={20} /></View>
            <View style={{flex:1}}>
              <Text style={s.notificationTitle}>{String(item.title || "RideX Update")}</Text>
              <Text style={s.notificationBody}>{String(item.message || "")}</Text>
              <Text style={s.notificationTime}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</Text>
            </View>
            {!item.readAt ? <View style={s.notificationDot} /> : null}
          </Pressable>
        ))}
      </ScreenShell>
    );
  }

  if (screen === "rides") {
    const history = customerHistory;
    return (
      <ScreenShell>
        <HeaderBar title="My Rides" onBack={() => setScreen("home")} right={<PillButton label="All Rides" />} />
        <Text style={s.authSubtitle}>Your ride history and receipts</Text>
        <View style={s.tabRow}>
          {["All Rides", "Passenger Rides", "Logistic Goods Rides"].map((tab, idx) => (
            <Pressable key={tab} style={[s.tab, idx === 0 && s.tabActive]}><Text style={idx === 0 ? s.tabActiveText : s.tabText}>{tab}</Text></Pressable>
          ))}
        </View>
        {!history.length ? <Card><Text style={s.muted}>No rides found yet.</Text></Card> : null}
        {history.map((item, i) => (
          <Card key={item.id || i} style={s.historyCard}>
            <View style={s.historyTop}>
              <Text style={s.historyDate}>{new Date(item.createdAt || Date.now()).toLocaleDateString()}</Text>
              <Text style={s.historyTime}>{new Date(item.createdAt || Date.now()).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</Text>
              <View style={[s.statusPill, String(item.status) === "CANCELLED" && s.statusCancelled]}><Text style={s.statusPillText}>{String(item.status || "NEW")}</Text></View>
            </View>
            <RoutePoint color={COLORS.green} title="" value={item.pickupAddress || "Pickup"} />
            <RoutePoint color={COLORS.red} title="" value={item.dropAddress || "Drop"} />
            <View style={s.historyBottom}>
              <View><Text style={s.historyFare}>₹{Number(item.finalFare ?? item.estimatedFare ?? 0).toFixed(2)}</Text><Text style={s.muted}>{item.rideType || item.serviceSubtype || item.bookingType || "Ride"}</Text></View>
              <View style={s.historyActions}>
                <OutlineButton title="View Details" onPress={() => { setSelectedHistoryBooking(item); setScreen("rideDetails"); }} small />
                {String(item.status) === "CANCELLED" ? <OutlineButton title="Book Again" onPress={() => setScreen("home")} small /> : <OutlineButton title="View Receipt" onPress={() => { setSelectedHistoryBooking(item); setScreen("rideDetails"); }} small />}
              </View>
            </View>
          </Card>
        ))}
        <BottomNav active="rides" onHome={() => setScreen("home")} onRides={() => setScreen("rides")} onWallet={() => setScreen("support")} onProfile={() => setScreen("profile")} />
      </ScreenShell>
    );
  }

  if (screen === "rideDetails") {
    const item = selectedHistoryBooking;
    if (!item) return <ScreenShell><HeaderBar title="Ride Details" onBack={() => setScreen("rides")} /><Card><Text style={s.muted}>Ride not found.</Text></Card></ScreenShell>;
    return (
      <ScreenShell>
        <HeaderBar title="Ride Details" onBack={() => setScreen("rides")} />
        <Card>
          <View style={s.historyTop}><Text style={s.historyDate}>{new Date(item.createdAt || Date.now()).toLocaleDateString()}</Text><View style={[s.statusPill, String(item.status) === "CANCELLED" && s.statusCancelled]}><Text style={s.statusPillText}>{String(item.status || "NEW")}</Text></View></View>
          <RoutePoint color={COLORS.green} title="Pickup" value={item.pickupAddress || "—"} />
          <RoutePoint color={COLORS.red} title="Drop" value={item.dropAddress || "—"} />
          <View style={s.receiptTotalRow}><Text style={s.receiptTotalLabel}>Fare</Text><Text style={s.receiptTotal}>₹{Number(item.finalFare ?? item.estimatedFare ?? 0).toFixed(2)}</Text></View>
          <Text style={s.muted}>Ride type: {item.rideType || item.serviceSubtype || item.bookingType || "Ride"}</Text>
          <Text style={s.muted}>Payment: {item.paymentPreference || item.payment?.method || "—"}</Text>
          {item.assignedDriver?.fullName ? <Text style={s.muted}>Driver: {item.assignedDriver.fullName}</Text> : null}
          {item.vehicle?.vehicleNumber ? <Text style={s.muted}>Vehicle: {item.vehicle.vehicleNumber}</Text> : null}
          <Text style={s.muted}>Booking ID: {item.id}</Text>
        </Card>

        <Card>
          <Text style={s.cardTitle}>Payment & Refund Details</Text>
          <Text style={s.muted}>Payment status: {String(item.payment?.status || item.paymentStatus || "—")}</Text>
          {item.payment?.id ? <Text style={s.muted}>Payment ID: {String(item.payment.id)}</Text> : null}
          {item.payment?.provider ? <Text style={s.muted}>Provider: {String(item.payment.provider)}</Text> : null}
          {item.payment?.providerPaymentId ? <Text style={s.muted}>Provider payment: {String(item.payment.providerPaymentId)}</Text> : null}
          {item.payment?.paidAt ? <Text style={s.muted}>Paid: {new Date(item.payment.paidAt).toLocaleString("en-IN")}</Text> : null}
          {Array.isArray(item.payment?.refunds) && item.payment.refunds.length ? (
            <View style={{marginTop:10}}>
              <Text style={s.profileRowTitle}>Refunds</Text>
              {item.payment.refunds.map((refund:any, index:number) => {
                const amount = Number(refund?.amount);
                const requestedAt = refund?.requestedAt ? new Date(refund.requestedAt) : null;
                const processedAt = refund?.processedAt ? new Date(refund.processedAt) : null;
                return (
                  <View key={String(refund?.id || index)} style={s.refundRow}>
                    <View style={{flex:1}}>
                      <Text style={s.profileRowTitle}>{String(refund?.status || "REFUND")}</Text>
                      <Text style={s.profileRowSub}>{refund?.reason ? String(refund.reason) : "RideX refund record"}</Text>
                      <Text style={s.profileRowSub}>Requested: {requestedAt && !Number.isNaN(requestedAt.getTime()) ? requestedAt.toLocaleString("en-IN") : "—"}</Text>
                      {processedAt && !Number.isNaN(processedAt.getTime()) ? <Text style={s.profileRowSub}>Processed: {processedAt.toLocaleString("en-IN")}</Text> : null}
                      {refund?.providerRefundId ? <Text style={s.profileRowSub}>Provider refund: {String(refund.providerRefundId)}</Text> : null}
                    </View>
                    <Text style={[s.profileRowTitle,{fontSize:13}]}>₹{Number.isFinite(amount) ? amount.toFixed(2) : "—"}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[s.muted,{marginTop:10}]}>No refund record returned for this payment.</Text>
          )}
        </Card>

        <Card>
          <Text style={s.cardTitle}>Invoice / Receipt</Text>
          <Text style={s.muted}>Ride receipt details are shown above. A downloadable invoice requires a verified backend invoice/document endpoint; none is present in the supplied Customer backend contract.</Text>
        </Card>

        <PrimaryButton title="Book Again" onPress={() => setScreen("home")} />
      </ScreenShell>
    );
  }

  if (screen === "wallet") {
    return (
      <ScreenShell>
        <HeaderBar title="RideX Wallet" onBack={() => setScreen("profile")} right={<SupportPill onPress={() => setScreen("support")} />} />
        <RideXMotionSurface height={56} intensity={0.5} compact muted label="SECURE WALLET FLOW" />
        <View style={s.walletCard}>
          <View style={s.walletIcon}><AssetIcon name="wallet" size={26}/></View>
          <View style={{flex:1}}>
            <Text style={s.walletLabel}>Available Balance</Text>
            <Text style={s.walletAmount}>{walletBalance === null ? "—" : `₹${walletBalance.toFixed(2)}`}</Text>
          </View>
          <OutlineButton title="Refresh" onPress={() => void loadWalletBalance()} small />
        </View>
        <Card>
          <Text style={s.cardTitle}>Wallet & Payments</Text>
          <Text style={s.muted}>Use your RideX Wallet for eligible bookings. Cash and UPI remain available at booking time.</Text>
          <View style={{marginTop:12}}>
            {(["WALLET", "UPI", "CASH"] as PaymentMethod[]).map((method) => (
              <Pressable key={method} style={s.profileRow} onPress={() => { setPaymentMethod(method); setMessage(`${method === "WALLET" ? "Wallet" : method === "UPI" ? "UPI" : "Cash"} selected for the next booking.`); setScreen("home"); }}>
                <AssetIcon name={method === "WALLET" ? "wallet" : method === "UPI" ? "upi" : "cash"} size={22} />
                <View style={{flex:1, marginLeft:10}}>
                  <Text style={s.profileRowTitle}>{method === "WALLET" ? "Wallet" : method === "UPI" ? "UPI" : "Cash"}</Text>
                  <Text style={s.profileRowSub}>{paymentMethod === method ? "Selected" : "Available"}</Text>
                </View>
                <AssetIcon name="chevron_right" size={16} />
              </Pressable>
            ))}
          </View>
        </Card>

        <Card>
          <View style={s.sectionHeaderRow}>
            <Text style={s.cardTitle}>Wallet Transactions</Text>
            <OutlineButton title="Refresh" onPress={() => void loadWalletBalance()} small />
          </View>
          <View style={s.walletFilterRow}>
            {(["ALL", "CREDIT", "DEBIT", "REFUND"] as const).map((filter) => (
              <Pressable key={filter} onPress={() => setWalletFilter(filter)} style={[s.walletFilterChip, walletFilter === filter && s.walletFilterChipActive]}>
                <Text style={[s.walletFilterText, walletFilter === filter && s.walletFilterTextActive]}>{filter === "ALL" ? "All" : filter === "CREDIT" ? "Credits" : filter === "DEBIT" ? "Debits" : "Refunds"}</Text>
              </Pressable>
            ))}
          </View>
          {(() => {
            const normalized = walletTransactions.map((tx: any) => ({ ...tx, __amount: Number(tx?.amount), __type: String(tx?.type || "TRANSACTION").toUpperCase() }));
            const refunds = normalized.filter((tx: any) => tx.__type.includes("REFUND"));
            const refundTotal = refunds.reduce((sum: number, tx: any) => sum + (Number.isFinite(tx.__amount) ? Math.abs(tx.__amount) : 0), 0);
            const filtered = normalized.filter((tx: any) => {
              if (walletFilter === "ALL") return true;
              if (walletFilter === "REFUND") return tx.__type.includes("REFUND");
              if (walletFilter === "CREDIT") return !tx.__type.includes("REFUND") && (tx.__amount >= 0 || tx.__type.includes("CREDIT"));
              return !tx.__type.includes("REFUND") && (tx.__amount < 0 || tx.__type.includes("DEBIT") || tx.__type.includes("PAYMENT"));
            });
            return <>
              <View style={s.refundSummaryCard}>
                <View style={{flex:1}}><Text style={s.profileRowTitle}>Refunds & reversals</Text><Text style={s.profileRowSub}>Backend-authoritative refund records returned for this wallet</Text></View>
                <Text style={s.refundSummaryAmount}>₹{refundTotal.toFixed(2)}</Text>
              </View>
              {filtered.length ? filtered.slice(0, 30).map((tx: any, index: number) => {
            const amount = Number(tx?.amount);
            const type = String(tx?.type || "TRANSACTION").replaceAll("_", " ");
            const status = String(tx?.status || "PENDING").replaceAll("_", " ");
            const dateValue = tx?.createdAt ? new Date(tx.createdAt) : null;
            const dateText = dateValue && !Number.isNaN(dateValue.getTime()) ? dateValue.toLocaleString("en-IN") : "—";
            return (
              <View key={String(tx?.id || tx?.referenceId || index)} style={s.profileRow}>
                <View style={[s.walletIcon,{width:38,height:38,borderRadius:19}]}>
                  <AssetIcon name={Number.isFinite(amount) && amount >= 0 ? "wallet" : "payments"} size={20} />
                </View>
                <View style={{flex:1,marginLeft:10}}>
                  <Text style={s.profileRowTitle}>{type}</Text>
                  <Text style={s.profileRowSub}>{tx?.description ? String(tx.description) : String(tx?.referenceId || "RideX wallet transaction")}</Text>
                  <Text style={s.profileRowSub}>{dateText} • {status}</Text>
                </View>
                <Text style={[s.profileRowTitle,{fontSize:13}]}>
                  {Number.isFinite(amount) ? `₹${amount.toFixed(2)}` : "—"}
                </Text>
              </View>
              );
              }) : (
                <View style={{paddingTop:10}}>
                  <Text style={s.muted}>No {walletFilter === "ALL" ? "wallet" : walletFilter.toLowerCase()} transactions were returned by the current backend wallet response.</Text>
                </View>
              )}
            </>;
          })()}
        </Card>

        <Card style={s.softCard}>
          <Text style={s.cardTitle}>Add Money / Top-up</Text>
          <Text style={s.muted}>The current supplied backend does not expose a customer wallet top-up route contract. No fake top-up or local balance mutation is enabled.</Text>
        </Card>

        <Card>
          <Text style={s.cardTitle}>Wallet Security</Text>
          <Text style={s.muted}>Wallet balance and transaction state are read from the authenticated RideX backend. Card payment is not enabled.</Text>
        </Card>
      </ScreenShell>
    );
  }

  if (screen === "profile") {
    return (
      <ScreenShell>
        <HeaderBar title="My Profile" onBack={() => setScreen("home")} />
        <Card style={s.profileCard}>
          <View style={s.profileTop}>
            <View style={s.profilePhotoWrap}>
              {profilePhotoUri ? <Image source={{uri: profilePhotoUri}} style={s.profilePhoto} /> : <View style={s.avatar}><Text style={s.avatarText}>{profileAvatarKey || "A"}</Text></View>}
            </View>
            <View style={{flex:1}}>
              <Text style={s.profileName}>{customerFullName || "RideX Customer"}</Text>
              <Text style={s.profileLine}>+91 {mobile} ✓</Text>
              <Text style={s.profileLine}>{customerEmail || "Add your email"}</Text>
              <Text style={s.profileLine}>{profileCity || "City not set"}{profileState ? `, ${profileState}` : ""}</Text>
            </View>
            <OutlineButton title="Edit Profile" onPress={() => setScreen("editProfile")} small />
          </View>
          <View style={s.memberPill}><Text>RideX Member</Text><Text>{profileNeedsCompletion ? "Profile incomplete" : "Account verified"}</Text></View>
        </Card>

        <View style={s.walletCard}>
          <View style={s.walletIcon}><AssetIcon name="wallet" size={24}/></View>
          <View style={{flex:1}}>
            <Text style={s.walletLabel}>Wallet Balance</Text>
            <Text style={s.walletAmount}>{walletBalance === null ? "—" : `₹${walletBalance.toFixed(2)}`}</Text>
          </View>
          <OutlineButton title="Refresh" onPress={() => void loadWalletBalance()} small />
        </View>

        <Card>
          {[
            ["profile","Personal Information","Name, address, email and verified mobile"],
            ["pickup","Saved Addresses","Home, Work and other locations"],
            ["wallet","Payment Methods","Cash, UPI and Wallet"],
            ["rupee","Wallet","Wallet balance and payments"],
            ["rating","Subscription / Pass",subscriptionActive ? `${subscriptionPlan} • Active until ${subscriptionExpiry}` : "RideX subscription plans"],
            ["safety","Insurance / Claim","Demo mode only"],
            ["notification","Notifications","RideX alerts and updates"],
            ["gallery","Gallery","Saved photos"],
            ["promo","Offers & Rewards","RideX promotions"],
            ["schedule","My Rides","Ride history"],
            ["notification","Help & Support","Support cases and help"],
            ["settings","Settings","App preferences"],
            ["safety","Privacy & Security","Account/session security"],
          ].map(([icon,title,sub]) => (
            <Pressable key={title} style={s.profileRow} onPress={() => {
              if (title === "Personal Information") setScreen("editProfile");
              else if (title === "Saved Addresses") openLocationPicker("profileAddress", "profile");
              else if (title === "Wallet") setScreen("wallet");
              else if (title === "Subscription / Pass") setUtilityScreen("subscription");
              else if (title === "Insurance / Claim") setUtilityScreen("insurance");
              else if (title === "Notifications") setScreen("notifications");
              else if (title === "Gallery") setScreen("gallery");
              else if (title === "My Rides") setScreen("rides");
              else if (title === "Help & Support") setScreen("support");
              else if (title === "Offers & Rewards") Alert.alert("RideX Offers","Offers are validated by the RideX backend during booking review.");
              else if (title === "Settings") Alert.alert("RideX Settings","Local preferences stay on the device; sensitive account controls stay backend-authoritative.");
              else if (title === "Privacy & Security") Alert.alert("Privacy & Security","RideX authentication and sensitive account state are protected by the RideX backend.");
              else if (title === "Payment Methods") Alert.alert("Payment Methods","Cash, UPI and Wallet are supported. Card payment is not enabled.");
            }}>
              <Text style={s.profileRowIcon}>{icon}</Text>
              <View style={{flex:1}}><Text style={s.profileRowTitle}>{title}</Text><Text style={s.profileRowSub}>{sub}</Text></View>
              <AssetIcon name="chevron_right" size={16}/>
            </Pressable>
          ))}
          <Pressable style={s.profileRow} onPress={() => void logoutCustomer()}>
            <Text style={[s.profileRowIcon,{color:COLORS.red}]}></Text>
            <Text style={[s.profileRowTitle,{color:COLORS.red}]}>Logout</Text>
            <AssetIcon name="chevron_right" size={16}/>
          </Pressable>
        </Card>
        <BottomNav active="profile" onHome={() => setScreen("home")} onRides={() => setScreen("rides")} onWallet={() => setScreen("support")} onProfile={() => setScreen("profile")} />
      </ScreenShell>
    );
  }
  if (screen === "editProfile") {
    return (
      <ScreenShell>
        <HeaderBar title="Complete Profile" onBack={() => {
          if (profileNeedsCompletion) {
            setMessage("Please complete your profile before continuing.");
            return;
          }
          if (pendingBookingTarget) { setPendingBookingTarget(null); setScreen("home"); }
          else setScreen("profile");
        }} />
        <Text style={s.authSubtitle}>Complete the required profile before booking.</Text>

        <Card>
          <Text style={s.cardTitle}>Profile Photo</Text>
          <View style={{alignItems:"center",marginVertical:12}}>
            {profilePhotoUri ? <Image source={{uri: profilePhotoUri}} style={s.profilePhotoLarge} /> : <View style={s.avatarLarge}><Text style={s.avatarTextLarge}>{profileAvatarKey || "A"}</Text></View>}
          </View>
          <View style={s.actionTwoCol}>
            <OutlineButton title="Select / Import Photo" onPress={() => void chooseProfilePhoto()} />
            <OutlineButton title="Use Avatar" onPress={() => { setProfilePhotoUri(""); if (!profileAvatarKey) setProfileAvatarKey("A"); }} />
          </View>
          <View style={s.chipRow}>
            {["A","B","C","D","E","F"].map((key) => <Pressable key={key} style={[s.chip, profileAvatarKey === key && !profilePhotoUri && s.chipSelected]} onPress={() => chooseBuiltInAvatar(key)}><Text style={s.chipText}>Avatar {key}</Text></Pressable>)}
          </View>
        </Card>

        <Card>
          <Text style={s.fieldLabel}>Full Name *</Text>
          <TextInput value={customerFullName} onChangeText={setCustomerFullName} style={s.input} placeholder="City name" />
          <Text style={s.fieldLabel}>Verified Mobile</Text>
          <View style={[s.input,{justifyContent:"center",backgroundColor:"#F4F5F7"}]}><Text style={s.muted}>+91 {mobile} ✓ Verified</Text></View>
          <Text style={s.fieldLabel}>Email (Optional)</Text>
          <TextInput value={customerEmail} onChangeText={setCustomerEmail} style={s.input} autoCapitalize="none" keyboardType="email-address" placeholder="Email address" />
        </Card>

        <Card>
          <View style={s.sectionHeaderRow}>
            <Text style={s.cardTitle}>Address *</Text>
            <OutlineButton title="Auto Capture GPS" onPress={() => void captureProfileGpsAddress()} small />
          </View>
          <TextInput value={profileAddress} onChangeText={setProfileAddress} style={s.input} placeholder="City Address" />
          <Text style={s.fieldLabel}>State *</Text><TextInput value={profileState} onChangeText={setProfileState} style={s.input} placeholder="State" />
          <Text style={s.fieldLabel}>City *</Text><TextInput value={profileCity} onChangeText={setProfileCity} style={s.input} placeholder="City" />
          <Text style={s.fieldLabel}>Town *</Text><TextInput value={profileTown} onChangeText={setProfileTown} style={s.input} placeholder="Town" />
          <Text style={s.fieldLabel}>Near By *</Text><TextInput value={profileNearBy} onChangeText={setProfileNearBy} style={s.input} placeholder="Nearby landmark / place" />
          <OutlineButton title="Choose Address on Map" onPress={() => openLocationPicker("profileAddress","editProfile")} />
        </Card>

        <PrimaryButton title={profileSaving ? "Saving..." : pendingBookingTarget ? "Save & Continue Booking" : "Save Profile"} onPress={() => void saveCustomerProfile()} disabled={profileSaving} />
        <Text style={s.muted}>Email is optional. Verified mobile remains read-only. Address details are required for booking.</Text>
        {!!message && <Text style={s.message}>{message}</Text>}
      </ScreenShell>
    );
  }

  if (utilityScreen === "subscription") {
    const plans = [
      {id:"RideX Basic",price:99,days:30,benefits:["Member fare offers","Priority offer visibility"]},
      {id:"RideX Plus",price:199,days:30,benefits:["Member fare offers","Priority offer visibility","Monthly booking benefit"]},
      {id:"RideX Max",price:499,days:90,benefits:["Extended validity","Member fare offers","Priority offer visibility"]},
    ];
    return (
      <ScreenShell>
        <HeaderBar title="Subscription / Pass" onBack={() => setUtilityScreen(null)} />
        <Card><Text style={s.cardTitle}>RideX Subscription</Text><Text style={s.muted}>RideX-owned subscription behavior. No external company's code, credential, API secret or payment token is used.</Text></Card>
        {subscriptionActive ? <Card style={s.softGreenCard}><Text style={s.cardTitle}>Active Pass</Text><Text style={s.fare}>{subscriptionPlan}</Text><Text style={s.muted}>Valid until {subscriptionExpiry}</Text></Card> : null}
        {plans.map((plan) => <Card key={plan.id}><Text style={s.cardTitle}>{plan.id}</Text><Text style={s.fare}>₹{plan.price}</Text><Text style={s.muted}>{plan.days} days</Text>{plan.benefits.map((benefit)=><Text key={benefit} style={s.detailLine}>• {benefit}</Text>)}<PrimaryButton title="Activate Pass" onPress={async()=>{if(!customerId){setMessage("Please login first.");return;}try{setLoading(true);const plansResponse=await ridexFetch(`${API}/customer/${encodeURIComponent(customerId)}/subscriptions/plans`);const plansData=await plansResponse.json().catch(()=>({}));const serverPlan=(Array.isArray(plansData?.data)?plansData.data:[]).find((p:any)=>String(p.id||p.code||p.name)===plan.id);const orderResponse=await ridexFetch(`${API}/customer/${encodeURIComponent(customerId)}/subscriptions/order`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({planCode:String(serverPlan?.code||serverPlan?.id||plan.id),planId:String(serverPlan?.id||plan.id),testMode:RIDEX_TEST_MODE})});const orderData=await orderResponse.json().catch(()=>({}));if(!orderResponse.ok||orderData?.success===false) throw new Error(String(orderData?.message||"Unable to create subscription order"));const orderId=String(orderData?.data?.orderId||orderData?.data?.id||"");if(orderId && RIDEX_TEST_MODE){const verifyResponse=await ridexFetch(`${API}/customer/${encodeURIComponent(customerId)}/subscriptions/verify`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscriptionId:String(orderData?.data?.subscriptionId||""),orderId,paymentId:`TEST-SUB-PAY-${Date.now()}`,signature:"TEST",mode:"TEST",planCode:String(serverPlan?.code||serverPlan?.id||plan.id),testMode:true})});const verifyData=await verifyResponse.json().catch(()=>({}));if(!verifyResponse.ok||verifyData?.success===false) throw new Error(String(verifyData?.message||"Subscription verification failed"));const sub=verifyData?.data?.subscription||verifyData?.data;setSubscriptionActive(true);setSubscriptionPlan(String(sub?.planCode||sub?.planName||plan.id));setSubscriptionExpiry(String(sub?.expiresAt||new Date(Date.now()+plan.days*86400000).toISOString()));setMessage(`${plan.id} activated in RideX TEST mode.`);} else {setMessage(`Order ${orderId||"created"}. Complete the configured payment checkout to activate this pass.`);} }catch(error){setMessage(error instanceof Error?error.message:"Unable to activate subscription");}finally{setLoading(false);}}}/></Card>)}
        <Text style={s.muted}>Subscription state is backend-authoritative. TEST mode can verify a test order automatically; LIVE mode requires the configured payment checkout before activation.</Text>
        <Text style={s.message}>{message}</Text>
      </ScreenShell>
    );
  }

  if (utilityScreen === "insurance") {
    return (
      <ScreenShell>
        <HeaderBar title="Insurance / Claim" onBack={() => setUtilityScreen(null)} />
        <Card style={s.softBlueCard}><Text style={s.cardTitle}>DEMO MODE ONLY</Text><Text style={s.muted}>No real insurer, policy, external claim provider, payment obligation or company integration is used.</Text></Card>
        {insuranceDemoClaim ? (
          <Card><Text style={s.cardTitle}>Demo Claim</Text><Text style={s.detailLine}>Claim ID: {insuranceDemoClaim.id}</Text><Text style={s.detailLine}>Reason: {insuranceDemoClaim.reason}</Text><Text style={s.detailLine}>Status: {insuranceDemoClaim.status}</Text><OutlineButton title="Reset Demo Claim" onPress={async()=>{setInsuranceDemoClaim(null);if(customerId)await AsyncStorage.removeItem(`${CUSTOMER_INSURANCE_DEMO_KEY_PREFIX}${customerId}`);}}/></Card>
        ) : (
          <Card><Text style={s.cardTitle}>Create Demo Claim</Text>{["Accident","Vehicle damage","Medical support","Other"].map((reason)=><Pressable key={reason} style={s.profileRow} onPress={async()=>{if(!customerId){setMessage("Please login first.");return;}const claim={id:`DEMO-${Date.now()}`,reason,status:"DEMO_SUBMITTED",createdAt:new Date().toISOString()};setInsuranceDemoClaim(claim);await AsyncStorage.setItem(`${CUSTOMER_INSURANCE_DEMO_KEY_PREFIX}${customerId}`,JSON.stringify(claim));}}><Text style={s.profileRowIcon}>•</Text><Text style={s.profileRowTitle}>{reason}</Text><AssetIcon name="chevron_right" size={16}/></Pressable>)}</Card>
        )}
        <Text style={s.message}>{message}</Text>
      </ScreenShell>
    );
  }

  if (screen === "support") {
    return (
      <ScreenShell>
        <HeaderBar title="Help & Support" onBack={() => setScreen("home")} right={<PillButton label=" Emergency" onPress={() => { setSosConfirm(false); setScreen("safety"); }} />} />
        <Text style={s.authSubtitle}>We are here to help you, always.</Text>
        {supportCases.length > 0 ? (
          <Card>
            <View style={s.sectionHeaderRow}>
              <View style={{flex:1}}><Text style={s.cardTitle}>Support History</Text><Text style={s.muted}>{supportCases.length} conversation{supportCases.length === 1 ? "" : "s"}</Text></View>
              <OutlineButton title={supportHistoryOpen ? "Hide" : "Show"} small onPress={() => setSupportHistoryOpen(v => !v)} />
            </View>
            {supportHistoryOpen ? supportCases.slice(0, 10).map((item) => (
              <Pressable key={item.id} style={[s.supportCaseRow, selectedSupportCase?.id === item.id && s.chipSelected]} onPress={() => void openSupportCase(item.id)}>
                <View style={{flex:1}}><Text style={s.profileRowTitle} numberOfLines={1}>{item.subject || "Support Case"}</Text><Text style={s.profileRowSub}>{String(item.status || "OPEN")} • {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ""}</Text></View>
                <AssetIcon name="chevron_right" size={16} />
              </Pressable>
            )) : null}
          </Card>
        ) : null}
        {selectedSupportCase ? (
          <Card>
            <View style={s.sectionHeaderRow}><Text style={s.cardTitle}>{selectedSupportCase.subject || "Support"}</Text><OutlineButton title="Close" onPress={() => setSelectedSupportCase(null)} small /></View>
            <ScrollView style={s.supportMessageList} nestedScrollEnabled>
              {(selectedSupportCase.messages || []).map((item:any) => (
                <View key={item.id} style={[s.supportMessageBubble, item.senderType === "CUSTOMER" && s.supportMessageMine]}>
                  <RideXMarkdown text={item.message || ""} mine={item.senderType === "CUSTOMER"} />
                  {item.createdAt ? <Text style={s.supportMessageTime}>{new Date(item.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</Text> : null}
                  {item.attachmentUrl ? <Pressable onPress={() => void openSupportAttachment(selectedSupportCase.id, item.id)}><Text style={s.redText}>View attachment</Text></Pressable> : null}
                </View>
              ))}
            </ScrollView>
            <TextInput
              style={[s.commentInput, { minHeight: 48, height: supportComposerHeight, maxHeight: 150, textAlignVertical: "top" }]}
              value={supportDraft}
              onChangeText={setSupportDraft}
              placeholder="Write to RideX Support…"
              multiline
              onContentSizeChange={(event) => setSupportComposerHeight(Math.max(48, Math.min(150, event.nativeEvent.contentSize.height + 12)))}
            />
            <View style={s.actionTwoCol}>
              <OutlineButton title={supportAttachment ? "Attachment selected" : "Attach Image"} onPress={() => void chooseSupportAttachment()} small />
              <PrimaryButton title={supportBusy ? "Sending..." : "Send"} onPress={() => void sendSupportMessage()} disabled={supportBusy || (!supportDraft.trim() && !supportAttachment)} small />
            </View>
          </Card>
        ) : null}
        <Card style={s.safetyHero}>
          <View style={s.safetyHeroIcon}><AssetIcon name="safety" size={44}/></View>
          <View style={{ flex: 1 }}>
            <Text style={s.safetyHeroTitle}>Safety Center</Text>
            <Text style={s.safetyHeroSub}>Your safety is our top priority</Text>
          </View>
          <VehicleIllustration kind="E_RICKSHAW" compact />
        </Card>

        <View style={s.supportGrid}>
          <SupportTile icon="liveChat" title="Live Chat" sub="Chat with our support team" onPress={() => void createSupportCase("Live Chat", "Customer requested live support chat.", "NORMAL")} />
          <SupportTile icon="phone" title="Call Support" sub={RIDEX_OPTIONAL_CONFIG.supportPhone ? "Call RideX Support" : "Create a support case"} onPress={() => void callSupport()} />
          <SupportTile icon="email" title="Email Us" sub={RIDEX_OPTIONAL_CONFIG.supportEmail || "Create a support case"} onPress={() => void emailSupport()} />
          <SupportTile icon="receipt" title="Report an Issue" sub="Tell us your problem" onPress={() => void createSupportCase("Customer Issue", "Customer reported an issue from the Help & Support screen.", "HIGH")} />
        </View>

        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitleLarge}>Frequently Asked Questions</Text>
          <Pressable onPress={() => void createSupportCase("Help Center", "Customer requested the full RideX Help Center / FAQ list.", "NORMAL")}>
            <Text style={s.redText}>View All </Text>
          </Pressable>
        </View>
        {[
          ["ride", "Booking & Rides", "How to book a ride, cancel a ride, modify booking"],
          ["wallet", "Payments & Refunds", "UPI, Wallet, refunds and invoices"],
          ["parcel", "Logistic Goods & Logistic Parcel", "Booking, pricing, tracking and delivery issues"],
          ["profile", "Account & Profile", "Phone number, email, KYC and account settings"],
          ["settings", "App & Technical Issues", "App not working, location, OTP, and more"],
          ["safety", "Safety & Security", "Safety features, emergency, and reports"],
          ["rating", "Offers & Rewards", "Coupons, cashback and promotions"],
        ].map(([icon,title,sub]) => (
          <Pressable
            key={title}
            style={s.faqRow}
            onPress={() => {
              Alert.alert(title, sub, [
                { text: "Close", style: "cancel" },
                {
                  text: "Contact Support",
                  onPress: () => {
                    void createSupportCase(
                      title,
                      `${sub}. Customer opened this Help Center category.`,
                      "NORMAL"
                    );
                  },
                },
              ]);
            }}>
            <View style={s.faqIcon}><LegacyIcon glyph={icon} size={22}/></View>
            <View style={{flex:1}}><Text style={s.profileRowTitle}>{title}</Text><Text style={s.profileRowSub}>{sub}</Text></View>
            <AssetIcon name="chevron_right" size={16} />
          </Pressable>
        ))}

        <View style={s.actionTwoCol}>
          <SoftTile icon="notification" title="Chat on WhatsApp" sub="Get quick support on WhatsApp" onPress={() => void openWhatsAppSupport()} />
          <SoftTile icon="phone" title="Request a Callback" sub="We'll call you back" onPress={() => void createSupportCase("Callback Request", "Customer requested a support callback.", "NORMAL")} />
        </View>
        <Pressable style={s.emergencyStrip} onPress={() => {
          setSosConfirm(false);
          setScreen("safety");
        }}>
          <AssetIcon name="sos" size={44} />
          <View style={{flex:1}}>
            <Text style={s.emergencyTitle}>Emergency SOS</Text>
            <Text style={s.emergencySub}>Get immediate help in case of an emergency</Text>
          </View>
          <Text style={s.emergencyCall}>Tap to Call</Text>
        </Pressable>

        <BottomNav active="support" onHome={() => setScreen("home")} onRides={() => setScreen("rides")} onWallet={() => setScreen("support")} onProfile={() => setScreen("profile")} />
      </ScreenShell>
    );
  }

  if (screen === "safety") {
    return (
      <ScreenShell>
        <HeaderBar title="Safety Center" onBack={goBack} />
        <Card style={s.safetyCard}>
          <View style={s.inlineTitle}><AssetIcon name="sos" size={28}/><Text style={s.authTitle}>RideX Safety</Text></View>
          <Text style={s.message}>Use SOS only for a real safety emergency. SOS requires confirmation before it is sent.</Text>
          <Text style={s.sectionLabel}>Emergency Contacts</Text>
          {emergencyContacts.length === 0 ? (
            <Text style={s.muted}>No RideX emergency contacts saved yet.</Text>
          ) : (
            emergencyContacts.map((contact: any) => (
              <View key={String(contact.id)} style={s.supportCaseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.profileRowTitle}>{String(contact.name || "Emergency contact")}{contact.isPrimary ? "  •  Primary" : ""}</Text>
                  <Text style={s.profileRowSub}>{String(contact.relation || "Emergency contact")} • {String(contact.mobile || "Mobile protected")}</Text>
                </View>
                <OutlineButton title="Delete" onPress={() => void deleteEmergencyContact(String(contact.id))} small disabled={loading} />
              </View>
            ))
          )}
          <TextInput style={s.input} placeholder="Contact name" value={emergencyName} onChangeText={setEmergencyName} />
          <TextInput style={s.input} placeholder="Relation (optional)" value={emergencyRelation} onChangeText={setEmergencyRelation} />
          <TextInput style={s.input} placeholder="Contact mobile" keyboardType="phone-pad" value={emergencyMobile} onChangeText={setEmergencyMobile} />
          <View style={s.actionTwoCol}>
            <OutlineButton title="Save Contact" onPress={saveEmergencyContact} disabled={loading} />
            <OutlineButton title="Call Contact" onPress={callEmergencyContact} disabled={!emergencyMobile.trim() || loading} />
          </View>
          <Text style={s.muted}>RideX stores emergency contacts in the protected backend. Stored numbers are masked when returned to the app.</Text>
          <Text style={s.sectionLabel}>Reason</Text>
          <View style={s.chipRow}>
            {["Unsafe situation","Accident","Medical emergency","Harassment","Vehicle breakdown","Other"].map((reason) => (
              <Pressable key={reason} style={[s.chip, sosReason === reason && s.chipSelected]} onPress={() => setSosReason(reason)}>
                <Text style={s.chipText}>{reason}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[s.confirmBox, sosConfirm && s.confirmBoxSelected]} onPress={() => setSosConfirm(v => !v)}>
            <Text>{sosConfirm ? "☑" : "☐"} I confirm that I need RideX Safety assistance.</Text>
          </Pressable>
          <PrimaryButton title={loading ? "Sending SOS..." : "SEND SOS"} onPress={triggerSos} disabled={loading} />
          <Text style={s.muted}>SOS sends the active booking context and latest available location to RideX Safety. For immediate danger, use your device emergency services.</Text>
          <Text style={s.message}>{message}</Text>
        </Card>
      </ScreenShell>
    );
  }

  if (screen === "gallery") {
    return (
      <ScreenShell>
        <HeaderBar title="RideX Gallery" onBack={goBack} />
        <Text style={s.muted}>Saved photos are securely synced to your RideX account and cached locally for continuity.</Text>
        <View style={s.actionTwoCol}>
          <PrimaryButton title="Camera" onPress={openCamera} />
          <OutlineButton title="Choose Photos" onPress={chooseFromGallery} />
        </View>
        {galleryPhotos.length === 0 ? (
          <Card><Text style={s.cardTitle}>No photos yet</Text><Text style={s.muted}>Use Camera or Choose Photos.</Text></Card>
        ) : (
          <View style={s.photoGrid}>
            {galleryPhotos.map((photo) => (
              <View key={photo.id} style={s.photoCard}>
                <Image source={{uri: photo.uri}} style={s.photo} />
                <Pressable style={s.photoRemove} onPress={() => removePhoto(photo)}><Text style={s.redText}>Remove</Text></Pressable>
              </View>
            ))}
          </View>
        )}
      </ScreenShell>
    );
  }

  if (screen === "display") {
    return <UntouchableDisplayScreen audience="Customer" onClose={() => setScreen("home")} remoteAsset={customerDisplayAsset} remoteAssetSource={customerDisplayAssetSource} />;
  }

  if (screen === "rebook") {
    return (
      <ScreenShell>
        <HeaderBar title="Ride Cancelled" onBack={goBack} />
        <Card>
          <Text style={s.authTitle}>Booking cancelled</Text>
          <Text style={s.muted}>The previous booking was cancelled. You can try booking again.</Text>
          <PrimaryButton title="YES — Book Ride Again" onPress={rebook} disabled={loading} />
          <OutlineButton title="NO — Back to Home" onPress={() => setScreen("home")} />
        </Card>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <HeaderBar title="RideX" onBack={() => setScreen("home")} />
      <Card><Text style={s.authTitle}>RideX</Text><Text style={s.muted}>Something went wrong.</Text></Card>
    </ScreenShell>
  );
}


function BottomNav({active,onHome,onRides,onWallet,onProfile}:{active:"home"|"rides"|"book"|"support"|"profile";onHome:()=>void;onRides:()=>void;onWallet:()=>void;onProfile:()=>void}) {
  const items = [
    ["home","home","Home",onHome],
    ["rides","history","My Rides",onRides],
    ["book","ride","Book Ride",onHome],
    ["support","support","Support",onWallet],
    ["profile","profile","Profile",onProfile],
  ] as const;
  return <View style={s.bottomNav}>{items.map(([key,icon,label,fn])=><Pressable key={key} style={[s.navItem,active===key&&s.navActive]} onPress={fn}><AssetIcon name={icon} size={24}/><Text style={active===key?s.navActiveText:s.navLabel}>{label}</Text></Pressable>)}</View>;
}

// RideX Customer visual tokens: a light SaaS surface system with a strong
// brand red, calm navy typography and clear semantic states.
// Business logic and API contracts intentionally remain unchanged.
const COLORS = {
  red: "#E11D48",
  darkRed: "#BE123C",
  black: "#0F172A",
  text: "#334155",
  muted: "#64748B",
  line: "#E5E7EB",
  bg: "#F8FAFC",
  softRed: "#FFF1F2",
  softGreen: "#ECFDF3",
  green: "#10B981",
  softBlue: "#EFF6FF",
  blue: "#3B82F6",
  mapBg: "#F1F5F9",
};

function ScreenShell({children, scroll=true}:{children:React.ReactNode;scroll?:boolean}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[s.scrollShell, { paddingBottom: 96 + ANDROID_BOTTOM_INSET }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      nestedScrollEnabled
      automaticallyAdjustKeyboardInsets
    >
      {children}
    </ScrollView>
  ) : children;
  return (
    <SafeAreaView
      style={[
        s.shell,
        {
          paddingTop: ANDROID_TOP_INSET,
          paddingBottom: ANDROID_BOTTOM_INSET,
        },
      ]}
    >
      {content}
    </SafeAreaView>
  );
}

function Card({children, style}:{children:React.ReactNode;style?:any}) {
  return <View style={[s.card, style]}>{children}</View>;
}


function BrandLogo({large=false}:{large?:boolean}) {
  return (
    <View style={large ? s.logoWrapLarge : s.logoWrap}>
      {CUSTOMER_ASSETS.logo ? (
        <Image source={CUSTOMER_ASSETS.logo} resizeMode="contain" style={large ? s.logoImageLarge : s.logoImage} />
      ) : (
        <Text style={large ? s.logoFallbackLarge : s.logoFallback}>RideX</Text>
      )}
    </View>
  );
}

function TopLanguage() {
  return (
    <View style={s.languagePill}><AssetIcon name="language" size={16}/><Text style={s.languageText}>English</Text><AssetIcon name="chevron_down" size={12}/></View>
  );
}

function AuthHeader({onBack}:{onBack?:()=>void}) {
  return <View style={s.authHeader}>
    {onBack ? <Pressable onPress={onBack} style={s.headerBack}><AssetIcon name="back" size={20}/></Pressable> : <View style={s.headerBackSpacer}/>}
    <TopLanguage />
  </View>;
}

function HeaderBar({title,onBack,right}:{title:string;onBack?:()=>void;right?:React.ReactNode}) {
  return (
    <View style={s.headerBar}>
      {onBack ? <Pressable style={s.headerBackCircle} onPress={onBack}><AssetIcon name="back" size={20}/></Pressable> : <View style={s.headerBackCircle}/>}
      <View style={s.headerBrand}><BrandLogo /></View>
      {right || <View style={s.headerBackCircle}/>}
    </View>
  );
}

function SupportPill({onPress}:{onPress?:()=>void}) {
  return <Pressable style={s.supportPill} onPress={onPress}><AssetIcon name="support" size={18}/><Text style={s.supportPillText}>Help</Text></Pressable>;
}

function PrimaryButton({title,onPress,trailing,disabled=false,small=false}:{title:string;onPress:()=>void;trailing?:string;disabled?:boolean;small?:boolean}) {
  return <Pressable disabled={disabled} onPress={onPress} style={[s.primaryBtn,small&&s.primaryBtnSmall,disabled&&s.primaryDisabled]}>
    <Text style={[s.primaryBtnText,small&&s.primaryBtnTextSmall]}>{title}</Text>
    {trailing ? <View style={s.btnArrow}><Text style={s.btnArrowText}>{trailing}</Text></View> : null}
  </Pressable>;
}
function OutlineButton({title,onPress,small=false,disabled=false}:{title:string;onPress:()=>void;small?:boolean;disabled?:boolean}) {
  return <Pressable onPress={onPress} disabled={disabled} style={[s.outlineBtn,small&&s.outlineBtnSmall,disabled&&s.disabledButton]}><Text style={[s.outlineBtnText,small&&s.outlineBtnTextSmall,disabled&&s.disabledText]}>{title}</Text></Pressable>;
}
function PillButton({label,red=false,onPress}:{label:string;red?:boolean;onPress?:()=>void}) {
  const content = <Text style={[s.pillButtonText,red&&s.pillButtonTextRed]}>{label}</Text>;
  if (onPress) {
    return <Pressable onPress={onPress} style={[s.pillButton,red&&s.pillButtonRed]}>{content}</Pressable>;
  }
  return <View style={[s.pillButton,red&&s.pillButtonRed]}>{content}</View>;
}
function SocialButton({label}:{label:string}) {
  return <View style={s.socialCircle}><Text style={s.socialCircleText}>{label}</Text></View>;
}
function FeatureItem({icon,title,sub}:{icon:string;title:string;sub?:string}) {
  return <View style={s.featureItem}><View style={s.featureIcon}><AssetIcon name={icon} size={25}/></View><Text style={s.featureTitle}>{title}</Text>{sub ? <Text style={s.featureSub}>{sub}</Text> : null}</View>;
}
function RoutePoint({color,title,value,active=false,onPress}:{color:string;title:string;value:string;active?:boolean;onPress?:()=>void}) {
  const content = <><View style={[s.routeDot,{borderColor:color,backgroundColor:color==="#2F80ED"?"#EAF4FF":"#FFF"}]}><View style={[s.routeDotInner,{backgroundColor:color}]}/></View><View style={{flex:1}}><Text style={s.routeTitle}>{title}</Text><Text style={s.routeValue}>{value}</Text></View></>;
  if (onPress) {
    return <Pressable onPress={onPress} style={s.routePoint} accessibilityRole="button">{content}</Pressable>;
  }
  return <View style={s.routePoint}>{content}</View>;
}
function RideChoice({selected,icon,title,price,onPress}:{selected:boolean;icon:string;title:string;price:string;onPress:()=>void}) {
  return <Pressable onPress={onPress} style={[s.rideChoice,selected&&s.rideChoiceSelected]}><View style={s.rideChoiceIcon}><LegacyIcon glyph={icon} size={34}/></View><Text style={s.rideChoiceTitle}>{title}</Text><Text style={s.rideChoicePrice}>{price}</Text><Text style={s.infoCircle}>i</Text></Pressable>;
}
function RideOption({
  selected,
  icon,
  title,
  subtitle,
  meta,
  fare,
  onPress,
}: {
  selected: boolean;
  icon: string;
  title: string;
  subtitle: string;
  meta: string;
  fare: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.rideOption, selected && s.rideOptionSelected]}
    >
      <View style={s.rideOptionIcon}>
        <LegacyIcon glyph={icon} size={52} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.rideOptionTitle}>{title}</Text>
        <Text style={s.rideOptionSub}>{subtitle}</Text>

        <View style={s.iconMetaRow}>
          <LegacyIcon glyph="👤" size={14} />
          <Text style={s.rideOptionMeta}>{meta}</Text>
          <Text style={s.metaDot}>•</Text>
          <LegacyIcon glyph="🍃" size={14} />
          <Text style={s.rideOptionMeta}>Eco Friendly</Text>
        </View>
      </View>

      <View style={s.rideOptionRight}>
        <Text style={s.rideOptionFare}>{fare}</Text>
        <View
          style={[
            s.checkCircle,
            selected && s.checkCircleSelected,
          ]}
        >
          <Text>{selected ? "✓" : ""}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function GoodsOption({
  selected,
  icon,
  title,
  subtitle,
  meta,
  fare,
  onPress,
}: {
  selected: boolean;
  icon: string;
  title: string;
  subtitle: string;
  meta: string;
  fare: string;
  onPress: () => void;
}) {
  const vehicleKind =
    icon === "truck" || title.includes("Truck")
      ? "PICKUP_TRUCK"
      : "E_RICKSHAW";

  const isParcel = title.includes("Logistic Parcel");

  return (
    <Pressable
      onPress={onPress}
      style={[s.goodsOption, selected && s.goodsOptionSelected]}
    >
      <View style={s.goodsIcon}>
        {isParcel ? (
          <AssetIcon name="parcelSet" size={56} />
        ) : (
          <VehicleIllustration kind={vehicleKind} compact />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.rideOptionTitle}>{title}</Text>
        <Text style={s.rideOptionSub}>{subtitle}</Text>
        <View style={s.iconMetaRow}>
          <LegacyIcon glyph="wallet" size={14} />
          <Text style={s.rideOptionMeta}>{meta}</Text>
          <Text style={s.metaDot}>·</Text>
          <LegacyIcon glyph="verified" size={14} />
          <Text style={s.rideOptionMeta}>Best for short distance</Text>
        </View>
      </View>

      <View style={s.rideOptionRight}>
        <Text style={s.rideOptionFare}>{fare}</Text>
        <View
          style={[
            s.checkCircle,
            selected && s.checkCircleSelected,
          ]}
        >
          <Text>{selected ? "✓" : ""}</Text>
        </View>
      </View>
    </Pressable>
  );
}
function VehicleSummary({icon,title,fare,meta}:{icon:"E_RICKSHAW"|"PICKUP_TRUCK";title:string;fare:string;meta:string}) {
  return <View style={s.vehicleSummary}><VehicleIllustration kind={icon} compact/><View style={{flex:1}}><Text style={s.cardTitle}>{title}</Text><Text style={s.muted}>{meta}</Text></View><Text style={s.fareSmall}>{fare}</Text></View>;
}
function SoftTile({icon,title,sub,onPress}:{icon:string;title:string;sub:string;onPress?:()=>void}) {
  return <Pressable onPress={onPress} style={s.softTile}><View style={s.softTileIcon}><LegacyIcon glyph={icon} size={24}/></View><View style={{flex:1}}><Text style={s.softTitle}>{title}</Text><Text style={s.softSub}>{sub}</Text></View><AssetIcon name="chevron_right" size={16} /></Pressable>;
}
function ProgressSteps({active}:{active:string}) {
  const steps=["Details","Review","Payment","Confirm"];
  const icons = ["pickup","ride","paymentCard","check"] as const;
  return <View style={s.progressRow}>{steps.map((step,i)=><React.Fragment key={step}><View style={s.progressItem}><View style={[s.progressCircle,step===active&&s.progressActive]}><AssetIcon name={icons[i]} size={15}/></View><Text style={[s.progressLabel,step===active&&s.progressLabelActive]}>{step}</Text></View>{i<steps.length-1?<View style={s.progressLine}/>:null}</React.Fragment>)}</View>;
}
function RouteStopsEditor({stops,onAdd,onRemove,onMove}:{stops:string[];onAdd:()=>void;onRemove:(index:number)=>void;onMove:(index:number,direction:number)=>void}) {
  return (
    <Card>
      <View style={s.sectionHeaderRow}>
        <View style={{flex:1}}>
          <Text style={s.cardTitle}>Route Stops</Text>
          <Text style={s.muted}>Multiple customer-selected locations. Basic wait time per stop: 5 minutes.</Text>
        </View>
        <OutlineButton title="+ Add Stop" onPress={onAdd} small />
      </View>
      {stops.length===0 ? (
        <Text style={s.savedSub}>No stops selected.</Text>
      ) : (
        stops.map((stop,index)=>(
          <View key={`${stop}-${index}`} style={s.savedRow}>
            <View style={{flex:1}}>
              <Text style={s.savedTitle}>{index+1}. {stop}</Text>
              <Text style={s.savedSub}>Basic wait time: 5 minutes</Text>
            </View>
            <View style={{flexDirection:"row",gap:4}}>
              <OutlineButton title="↑" onPress={()=>onMove(index,-1)} small disabled={index===0}/>
              <OutlineButton title="↓" onPress={()=>onMove(index,1)} small disabled={index===stops.length-1}/>
              <OutlineButton title="×" onPress={()=>onRemove(index)} small/>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

function SearchState({
  goods,
  pickup,
  drop,
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  fare,
  matchingState,
  currentLocation,
  locationLoading,
  onCurrentLocationPress,
}: {
  goods: boolean;
  pickup: string;
  drop: string;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  fare: number;
  matchingState: CustomerMatchingState;
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    recordedAt?: string;
  } | null;
  locationLoading: boolean;
  onCurrentLocationPress?: () => void;
}) {
  const offered = matchingState === "OFFERED";

  return (
    <>
      <View style={s.stateHeader}>
        <View style={s.stateIcon}>
          <Text>{goods ? "truck" : "ride"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.stateTitle}>
            {offered
              ? "Driver Offer Sent"
              : `Finding a Driver for Your ${goods ? "Logistic Goods" : "Ride"}`}
          </Text>
          <Text style={s.stateSub}>
            {offered
              ? "A nearby eligible driver has received your ride request. Waiting for acceptance."
              : "Please wait, RideX is matching your booking with an eligible driver."}
          </Text>
        </View>
      </View>

      <RideXMap
        pickupLat={pickupLat}
        pickupLng={pickupLng}
        dropLat={dropLat}
        dropLng={dropLng}
        pickupLabel={pickup || "Pickup Location"}
        dropLabel={drop || "Drop Location"}
        searching
        goods={goods}
        currentLocation={currentLocation}
        locationLoading={locationLoading}
        onCurrentLocationPress={onCurrentLocationPress}
      />

      <Card>
        <View style={s.stepTrack}>
          {[
            "Booking created",
            offered ? "Driver offer sent" : "Finding eligible driver",
            "Driver acceptance",
            "Driver en route",
          ].map((label, index) => {
            const active = offered ? index <= 1 : index === 0;
            return (
              <View style={s.stepNode} key={label}>
                <View style={[s.trackCircle, active && s.trackCircleActive]}>
                  <Text>{active ? "pickup" : " "}</Text>
                </View>
                <Text style={s.trackText}>{label}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Card>
        <VehicleSummary
          icon={goods ? "PICKUP_TRUCK" : "E_RICKSHAW"}
          title={goods ? "Battery Pickup Truck · Logistic Goods" : "E-Rickshaw · Passenger / Logistic Parcel"}
          fare={`₹${fare}`}
          meta={goods ? "Logistic Goods service" : "Passenger / Logistic Parcel service"}
        />
        <Text style={s.muted}>
          {offered
            ? "RideX is waiting for the offered driver to accept. Driver details appear only after backend assignment."
            : "RideX is matching your booking with an eligible verified driver."}
        </Text>
      </Card>
    </>
  );
}

function NoMatchState({
  goods,
  pickup,
  drop,
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  fare,
  reason,
  currentLocation,
  locationLoading,
  onCurrentLocationPress,
  onRefresh,
  onCancel,
}: {
  goods: boolean;
  pickup: string;
  drop: string;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  fare: number;
  reason: string;
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    recordedAt?: string;
  } | null;
  locationLoading: boolean;
  onCurrentLocationPress?: () => void;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <View style={s.noMatchBanner}>
        <View style={s.noMatchIcon}>
          <Text style={s.noMatchIconText}>!</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.noMatchTitle}>No driver available right now</Text>
          <Text style={s.noMatchSub}>
            {customerMatchingReasonText(reason)}
          </Text>
        </View>
      </View>

      <RideXMap
        pickupLat={pickupLat}
        pickupLng={pickupLng}
        dropLat={dropLat}
        dropLng={dropLng}
        pickupLabel={pickup || "Pickup Location"}
        dropLabel={drop || "Drop Location"}
        goods={goods}
        currentLocation={currentLocation}
        locationLoading={locationLoading}
        onCurrentLocationPress={onCurrentLocationPress}
      />

      <Card>
        <Text style={s.cardTitle}>Booking remains protected</Text>
        <Text style={s.muted}>
          The backend did not assign a driver. RideX will not silently switch
          this booking to an unrelated driver pool or treat an offered driver
          as already assigned.
        </Text>

        <View style={s.noMatchReasonBox}>
          <Text style={s.noMatchReasonLabel}>Matching result</Text>
          <Text style={s.noMatchReasonValue}>
            {String(reason || "NO_ELIGIBLE_DRIVER")}
          </Text>
        </View>
      </Card>

      <Card>
        <VehicleSummary
          icon={goods ? "PICKUP_TRUCK" : "E_RICKSHAW"}
          title={goods ? "Battery Pickup Truck · Logistic Goods" : "E-Rickshaw · Passenger / Logistic Parcel"}
          fare={`₹${fare}`}
          meta={goods ? "Logistic Goods service" : "Passenger / Logistic Parcel service"}
        />

        <View style={s.actionTwoCol}>
          <OutlineButton title="Refresh Status" onPress={onRefresh} />
          <OutlineButton title="Cancel Booking" onPress={onCancel} />
        </View>

        <Text style={s.message}>
          Refresh checks the authoritative backend state; it does not fabricate
          or force a new driver assignment.
        </Text>
      </Card>
    </>
  );
}

function ScheduledState({
  goods,
  pickup,
  drop,
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  fare,
  currentLocation,
  routeGeometry,
  scheduledText,
  onRefresh,
}: {
  goods: boolean;
  pickup: string;
  drop: string;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  fare: number;
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    recordedAt?: string;
  } | null;
  routeGeometry?: number[][] | null;
  scheduledText: string;
  onRefresh: () => void;
}) {
  return (
    <>
      <View style={s.scheduledBanner}>
        <View style={s.scheduledIcon}>
          <Text style={s.scheduledIconText}></Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.scheduledTitle}>
            {goods ? "Scheduled Logistic Goods Booking" : "Scheduled Ride Confirmed"}
          </Text>
          <Text style={s.scheduledSub}>
            Your booking is scheduled with RideX. Matching begins according to
            the backend booking lifecycle.
          </Text>
        </View>
      </View>

      <RideXMap
        pickupLat={pickupLat}
        pickupLng={pickupLng}
        dropLat={dropLat}
        dropLng={dropLng}
        pickupLabel={pickup || "Pickup Location"}
        dropLabel={drop || "Destination"}
        goods={goods}
        currentLocation={currentLocation}
        routeGeometry={routeGeometry}
      />

      <Card>
        <Text style={s.cardTitle}>Scheduled pickup</Text>
        <Text style={s.scheduledTime}>
          {scheduledText || "Scheduled by RideX"}
        </Text>

        <View style={s.tripInfoRow}>
          <View style={{ flex: 1 }}>
            <RoutePoint
              color={COLORS.red}
              title="Pickup"
              value={pickup || "—"}
            />
            <RoutePoint
              color={COLORS.red}
              title="Drop"
              value={drop || "—"}
            />
          </View>
          <View style={s.distancePanel}>
            <Text style={s.distanceBig}>
              {fare > 0 ? `₹${fare.toFixed(2)}` : "—"}
            </Text>
            <Text style={s.distanceSmall}>Authoritative fare</Text>
          </View>
        </View>

        <OutlineButton title="Refresh Status" onPress={onRefresh} />
      </Card>
    </>
  );
}

function AssignedState({goods,driverId,distanceKm,pickup,drop,pickupLat,pickupLng,dropLat,dropLng,driverLocation,currentLocation,routeGeometry,driverName,driverRating,vehicleType,vehicleNumber,etaMinutes,locationLoading,onCurrentLocationPress,onChat,onCancel,onCall,onSafety}:{goods:boolean;driverId:string;distanceKm:number|null;pickup:string;drop:string;pickupLat:number;pickupLng:number;dropLat:number;dropLng:number;driverLocation:{latitude:number;longitude:number;recordedAt?:string}|null;currentLocation?:{latitude:number;longitude:number;accuracy?:number|null;recordedAt?:string}|null;routeGeometry?:number[][]|null;driverName?:string;driverRating?:number|null;vehicleType?:string;vehicleNumber?:string;etaMinutes?:number;locationLoading:boolean;onCurrentLocationPress?:()=>void;onChat:()=>void;onCancel:()=>void;onCall:()=>void;onSafety:()=>void}) {
  const hasBackendEta =
    Number.isFinite(Number(etaMinutes)) && Number(etaMinutes) >= 0;
  const hasDriverDistance =
    typeof distanceKm === "number" && Number.isFinite(distanceKm) && distanceKm >= 0;

  return <><View style={s.stateBanner}><View style={s.stateIcon}><Text>{goods?"truck":"ride"}</Text></View><View style={{flex:1}}><Text style={s.stateTitle}>Driver Assigned!</Text><Text style={s.stateSub}>Your driver is on the way to pick you up.</Text></View><View style={s.etaBox}><Text style={s.etaBig}>{hasBackendEta ? `${Math.round(Number(etaMinutes))} min` : "—"}</Text><Text style={s.etaSmall}>{hasDriverDistance ? `${distanceKm.toFixed(1)} km away` : "Driver distance unavailable"}</Text></View></View><RideXMap pickupLat={pickupLat} pickupLng={pickupLng} dropLat={dropLat} dropLng={dropLng} pickupLabel={pickup||"Your Pickup Location"} dropLabel={drop || "Destination"} driver goods={goods} driverLocation={driverLocation} currentLocation={currentLocation} routeGeometry={routeGeometry} locationLoading={locationLoading} onCurrentLocationPress={onCurrentLocationPress}/><Card><DriverSummary driverId={driverId} goods={goods} driverName={driverName} driverRating={driverRating} vehicleType={vehicleType} vehicleNumber={vehicleNumber}/><View style={s.driverActions}><Pressable style={s.callBtn} onPress={onCall}><Text style={s.callBtnText}>Call</Text></Pressable><OutlineButton title="Support Chat" onPress={onChat}/><Pressable style={s.sosQuick} onPress={onSafety}><Text style={s.sosQuickText}> SOS</Text></Pressable><OutlineButton title="✕ Cancel" onPress={onCancel}/></View><StatusTimeline status="assigned"/></Card></>;
}
function ArrivedState({goods,driverLocation,driverId,pickup,drop,pickupLat,pickupLng,dropLat,dropLng,currentLocation,routeGeometry,driverName,driverRating,vehicleType,vehicleNumber,etaMinutes,locationLoading,onCurrentLocationPress,onChat,onCancel,onCall,onSafety}:{goods:boolean;driverLocation:{latitude:number;longitude:number;recordedAt?:string}|null;driverId?:string;pickup:string;drop:string;pickupLat:number;pickupLng:number;dropLat:number;dropLng:number;currentLocation?:{latitude:number;longitude:number;accuracy?:number|null;recordedAt?:string}|null;routeGeometry?:number[][]|null;driverName?:string;driverRating?:number|null;vehicleType?:string;vehicleNumber?:string;etaMinutes?:number;locationLoading:boolean;onCurrentLocationPress?:()=>void;onChat:()=>void;onCancel:()=>void;onCall:()=>void;onSafety:()=>void}) {
  return <><View style={s.arrivedBanner}><View style={s.arrivedIcon}><Text>✓</Text></View><View style={{flex:1}}><Text style={s.stateTitle}>Driver has arrived!</Text><Text style={s.stateSub}>Your driver is waiting at the pickup location.</Text></View><View style={s.etaBoxGreen}><Text style={s.etaGreenBig}>Ready</Text><Text style={s.etaSmall}>At pickup location</Text></View></View><RideXMap pickupLat={pickupLat} pickupLng={pickupLng} dropLat={dropLat} dropLng={dropLng} pickupLabel="Pickup Location" dropLabel={drop || "Destination"} arrived driver goods={goods} driverLocation={driverLocation} currentLocation={currentLocation} routeGeometry={routeGeometry} locationLoading={locationLoading} onCurrentLocationPress={onCurrentLocationPress}/><Card><DriverSummary driverId={driverId||""} goods={goods} driverName={driverName} driverRating={driverRating} vehicleType={vehicleType} vehicleNumber={vehicleNumber}/><View style={s.driverActions}><Pressable style={s.callBtn} onPress={onCall}><Text style={s.callBtnText}>Call</Text></Pressable><OutlineButton title="Support Chat" onPress={onChat}/><Pressable style={s.sosQuick} onPress={onSafety}><Text style={s.sosQuickText}> SOS</Text></Pressable><OutlineButton title="✕ Cancel" onPress={onCancel}/></View><StatusTimeline status="arrived"/></Card></>;
}
function TripInProgressState({goods,driverLocation,driverId,pickup,drop,pickupLat,pickupLng,dropLat,dropLng,currentLocation,routeGeometry,routeDistanceKm,driverName,driverRating,vehicleType,vehicleNumber,locationLoading,onCurrentLocationPress,onChat,onCancel,onCall,onSafety}:{goods:boolean;driverLocation:{latitude:number;longitude:number;recordedAt?:string}|null;driverId?:string;pickup:string;drop:string;pickupLat:number;pickupLng:number;dropLat:number;dropLng:number;currentLocation?:{latitude:number;longitude:number;accuracy?:number|null;recordedAt?:string}|null;routeGeometry?:number[][]|null;routeDistanceKm?:number|null;driverName?:string;driverRating?:number|null;vehicleType?:string;vehicleNumber?:string;locationLoading:boolean;onCurrentLocationPress?:()=>void;onChat:()=>void;onCancel:()=>void;onCall:()=>void;onSafety:()=>void}) {
  return <><View style={s.startedBanner}><View style={s.stateIcon}><Text>✓</Text></View><View style={{flex:1}}><Text style={s.stateTitle}>Trip Started!</Text><Text style={s.stateSub}>Your {goods?"goods":"driver"} are on the way to the destination.</Text></View><View style={s.etaBox}><Text style={s.etaBig}>{routeDistanceKm && routeDistanceKm > 0 ? `${routeDistanceKm.toFixed(1)} km` : "—"}</Text><Text style={s.etaSmall}>backend route</Text></View></View><RideXMap pickupLat={pickupLat} pickupLng={pickupLng} dropLat={dropLat} dropLng={dropLng} pickupLabel={pickup||"Pickup"} dropLabel={drop || "Destination"} inProgress driver goods={goods} driverLocation={driverLocation} currentLocation={currentLocation} routeGeometry={routeGeometry} locationLoading={locationLoading} onCurrentLocationPress={onCurrentLocationPress}/><Card><DriverSummary driverId={driverId||""} goods={goods} driverName={driverName} driverRating={driverRating} vehicleType={vehicleType} vehicleNumber={vehicleNumber}/><View style={s.driverActions}><Pressable style={s.callBtn} onPress={onCall}><Text style={s.callBtnText}>Call</Text></Pressable><OutlineButton title="Support Chat" onPress={onChat}/><Pressable style={s.sosQuick} onPress={onSafety}><Text style={s.sosQuickText}> SOS</Text></Pressable><OutlineButton title="✕ Cancel" onPress={onCancel}/></View><StatusTimeline status="started"/></Card></>;
}
function StatusTimeline({status}:{status:"assigned"|"arrived"|"started"}) {
  const labels = ["Driver Assigned","On the way","Arrived","Trip Started","Trip Completed"];
  const active = status === "assigned" ? 0 : status === "arrived" ? 2 : 3;
  return <View style={s.timeline}>{labels.map((label,i)=><View key={label} style={s.timelineItem}><View style={[s.timelineDot,i<=active&&s.timelineDotActive]}><Text>{i<active?"check":""}</Text></View><Text style={[s.timelineLabel,i<=active&&s.timelineLabelActive]}>{label}</Text></View>)}</View>;
}
function DriverSummary({driverId,goods,driverName,driverRating,vehicleType,vehicleNumber}:{driverId:string;goods:boolean;driverName?:string;driverRating?:number|null;vehicleType?:string;vehicleNumber?:string}) {
  const normalizedVehicle = String(vehicleType || "").toUpperCase();
  const kind = normalizedVehicle === "PICKUP_TRUCK" ? "PICKUP_TRUCK" : normalizedVehicle === "E_RICKSHAW" ? "E_RICKSHAW" : null;
  const name = driverName?.trim() || "Driver";
  const rating = Number.isFinite(Number(driverRating)) ? Number(driverRating).toFixed(1) : null;
  const vehicleLabel = kind === "PICKUP_TRUCK" ? "Battery Pickup Truck" : kind === "E_RICKSHAW" ? "E-Rickshaw" : "Vehicle details unavailable";
  return <View style={s.driverSummary}><View style={s.avatarDriver}><Text style={s.avatarDriverText}>{name.slice(0,2).toUpperCase()}</Text></View><View style={{flex:1}}><Text style={s.driverName}>{name} {rating ? <AssetIcon name="rating" size={14} /> : null} {rating || ""}</Text><Text style={s.driverVehicle}>{vehicleLabel}{vehicleNumber ? `  •  ${vehicleNumber}` : ""}</Text></View>{kind ? <VehicleIllustration kind={kind} compact/> : null}</View>;
}
function VehicleIllustration({kind,large=false,compact=false,hero=false}:{kind:"E_RICKSHAW"|"PICKUP_TRUCK";large?:boolean;compact?:boolean;hero?:boolean}) {
  const source = kind === "PICKUP_TRUCK" ? CUSTOMER_ASSETS.pickupTruck : CUSTOMER_ASSETS.eRickshaw;
  return (
    <View style={[s.vehicleIllustration, large && s.vehicleLarge, compact && s.vehicleCompact, hero && s.vehicleHero]}>
      {source ? (
        <Image
          source={source}
          resizeMode="contain"
          style={s.vehicleImage}
        />
      ) : (
        <AssetIcon name={kind === "PICKUP_TRUCK" ? "truck" : "ride"} size={42} />
      )}
    </View>
  );
}
function RideXMap({
  pickupLabel,
  dropLabel,
  showVehicles = false,
  driver = false,
  arrived = false,
  inProgress = false,
  completed = false,
  searching = false,
  goods = false,
  compact = false,
  pickupLat: pickupLatitude,
  pickupLng: pickupLongitude,
  dropLat: dropLatitude,
  dropLng: dropLongitude,
  driverLocation = null,
  currentLocation = null,
  onCurrentLocationPress,
  onMapPress,
  locationLoading = false,
  routeGeometry = null,
}: {
  pickupLabel: string;
  dropLabel: string;
  showVehicles?: boolean;
  driver?: boolean;
  arrived?: boolean;
  inProgress?: boolean;
  completed?: boolean;
  searching?: boolean;
  goods?: boolean;
  compact?: boolean;
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
  driverLocation?: { latitude: number; longitude: number; recordedAt?: string } | null;
  currentLocation?: { latitude: number; longitude: number; accuracy?: number | null; recordedAt?: string } | null;
  onCurrentLocationPress?: () => void;
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  locationLoading?: boolean;
  routeGeometry?: number[][] | null;
}) {
  const mapRef = useRef<MapView | null>(null);

  const pickupCandidate = {
    latitude: Number(pickupLatitude),
    longitude: Number(pickupLongitude),
  };
  const dropCandidate = {
    latitude: Number(dropLatitude),
    longitude: Number(dropLongitude),
  };

  const hasRealPickup =
    Number.isFinite(pickupCandidate.latitude) &&
    Number.isFinite(pickupCandidate.longitude);

  const hasRealDrop =
    Number.isFinite(dropCandidate.latitude) &&
    Number.isFinite(dropCandidate.longitude);

  const pickup = hasRealPickup ? pickupCandidate : null;
  const drop = hasRealDrop ? dropCandidate : null;

  const geometryPoints = useMemo(
    () =>
      Array.isArray(routeGeometry)
        ? routeGeometry
            .map((pair) => ({
              latitude: Number(pair?.[1]),
              longitude: Number(pair?.[0]),
            }))
            .filter(
              (point) =>
                Number.isFinite(point.latitude) &&
                Number.isFinite(point.longitude),
            )
        : [],
    [routeGeometry],
  );

  const center = currentLocation
    ? {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      }
    : pickup
      ? pickup
      : drop
        ? drop
        : {
            latitude: 20.5937,
            longitude: 78.9629,
          };

  const points = [pickup, drop].filter(
    (point): point is { latitude: number; longitude: number } => Boolean(point),
  );

  const mapFitPoints = useMemo(() => {
    const routeBase =
      geometryPoints.length >= 2
        ? geometryPoints
        : points;

    const combined = [
      ...routeBase,
      ...(pickup ? [pickup] : []),
      ...(drop ? [drop] : []),
      ...(currentLocation
        ? [{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }]
        : []),
    ];

    const seen = new Set<string>();
    return combined.filter((point) => {
      const key = `${point.latitude.toFixed(6)}:${point.longitude.toFixed(6)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [
    geometryPoints,
    pickup?.latitude,
    pickup?.longitude,
    drop?.latitude,
    drop?.longitude,
    currentLocation?.latitude,
    currentLocation?.longitude,
  ]);

  const singlePointDelta = compact ? 0.025 : 0.035;
  const latitudeDelta =
    points.length >= 2
      ? Math.max(
          0.02,
          Math.abs(points[0].latitude - points[1].latitude) * 1.8 + 0.018,
        )
      : singlePointDelta;
  const longitudeDelta =
    points.length >= 2
      ? Math.max(
          0.02,
          Math.abs(points[0].longitude - points[1].longitude) * 1.8 + 0.018,
        )
      : singlePointDelta;

  useEffect(() => {
    if (!mapRef.current) return;

    if (mapFitPoints.length >= 2) {
      mapRef.current.fitToCoordinates(mapFitPoints, {
        edgePadding: { top: 90, right: 70, bottom: 120, left: 70 },
        animated: true,
      });
      return;
    }

    if (currentLocation || pickup || drop) {
      mapRef.current.animateToRegion(
        {
          ...center,
          latitudeDelta: compact ? 0.02 : 0.03,
          longitudeDelta: compact ? 0.02 : 0.03,
        },
        450,
      );
    }
  }, [
    mapFitPoints,
    center.latitude,
    center.longitude,
    pickup?.latitude,
    pickup?.longitude,
    drop?.latitude,
    drop?.longitude,
    compact,
  ]);

  return (
    <View style={[s.rideMapCard, compact && s.rideMapCardCompact]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          ...center,
          latitudeDelta,
          longitudeDelta,
        }}
        mapType="standard"
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        showsBuildings={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        showsUserLocation={Boolean(currentLocation)}
        showsMyLocationButton={false}
        loadingEnabled
        zoomEnabled
        rotateEnabled
        scrollEnabled
        pitchEnabled
        moveOnMarkerPress
        onPress={onMapPress ? (event) => onMapPress(event.nativeEvent.coordinate) : undefined}
      >
        {pickup ? (
          <Marker
            coordinate={pickup}
            title={pickupLabel || "Pickup location"}
            description="RideX pickup location"
            pinColor="#F31B2D"
          />
        ) : null}

        {Array.isArray(routeGeometry) && routeGeometry.length >= 2 ? (
          <Polyline
            coordinates={routeGeometry.map((pair) => ({ latitude: Number(pair?.[1]), longitude: Number(pair?.[0]) })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))}
            strokeWidth={4}
            strokeColor="#F31B2D"
          />
        ) : null}

        {drop ? (
          <Marker
            coordinate={drop}
            title={dropLabel || "Destination"}
            description="RideX destination"
            pinColor={completed ? "#18A957" : "#F31B2D"}
          />
        ) : null}

        {driver && driverLocation ? (
          <Marker
            coordinate={{
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            title="RideX Driver"
            description={inProgress ? "Driver location" : "Driver is on the way"}
          >
            <View style={s.googleDriverMarkerWrap}>
              <View style={s.googleDriverPulse} />
              <Text style={[s.googleDriverMarker, { textAlign: "center", textAlignVertical: "center" }]}>{goods ? "🚚" : "🛺"}</Text>
            </View>
          </Marker>
        ) : null}
      </MapView>

      {searching ? (
        <View style={s.searchBubble}>
          <Text style={s.mapBubbleTitle}>Looking for nearby drivers...</Text>
          <Text style={s.muted}>RideX is matching your booking</Text>
        </View>
      ) : null}

      {onCurrentLocationPress ? (
        <View style={s.mapControlCol}>
          <Pressable
            style={[s.mapControl, locationLoading && s.mapControlDisabled]}
            onPress={onCurrentLocationPress}
            disabled={locationLoading}
            accessibilityRole="button"
            accessibilityLabel="Use current location"
          >
            <AssetIcon name={locationLoading ? "clock" : "recenter"} size={20} />
          </Pressable>

        </View>
      ) : null}

      {arrived ? (
        <View style={s.mapBubble}>
          <Text style={s.mapBubbleTitle}>Your driver has arrived</Text>
          <Text style={s.muted}>at the pickup location</Text>
        </View>
      ) : null}
      {completed ? (
        <View style={s.mapBubbleGreen}>
          <Text style={s.mapBubbleTitle}>Trip completed successfully</Text>
        </View>
      ) : null}
      {inProgress ? (
        <View style={s.mapBubbleBlue}>
          <Text style={s.mapBubbleTitle}>On the way to destination</Text>
        </View>
      ) : null}
    </View>
  );
}

function getStatusTheme(status:string,mode:BookingMode){return status==="COMPLETED"?COLORS.green:mode==="GOODS"?COLORS.red:COLORS.red;}
function StatCard({icon,value,label}:{icon:string;value:string;label:string}){return <View style={s.statCard}><Text style={s.statIcon}>{icon}</Text><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>}
function SupportTile({icon,title,sub,onPress}:{icon:string;title:string;sub:string;onPress?:()=>void}){return <Pressable style={s.supportTile} onPress={onPress}><View style={s.supportTileIcon}><AssetIcon name={icon} size={22}/></View><Text style={s.supportTileTitle}>{title}</Text><Text style={s.supportTileSub}>{sub}</Text></Pressable>}


const s = StyleSheet.create({
  heroFallback:{alignItems:"center",justifyContent:"center",padding:18},
  heroFallbackText:{fontSize:34,fontWeight:"900",color:COLORS.red,letterSpacing:2},
  logoFallback:{fontSize:18,fontWeight:"900",color:COLORS.red},
  logoFallbackLarge:{fontSize:34,fontWeight:"900",color:COLORS.red},
  vehicleFallbackText:{fontSize:54},

  shell:{flex:1,backgroundColor:COLORS.bg},
  scrollShell:{paddingHorizontal:0,paddingTop:0,paddingBottom:96},
  welcomeHero:{paddingHorizontal:16,paddingTop:12,paddingBottom:22},
  welcomeHeroImageWrap:{width:"100%",height:200,borderRadius:24,overflow:"hidden",marginTop:10,marginBottom:14,backgroundColor:"#FFFFFF",alignSelf:"center"},
  dynamicHomeAsset:{width:"100%",height:"100%"},
  welcomeHeroImage:{width:"100%",height:"100%",backgroundColor:"#FFFFFF"},
  logoWrapLarge:{alignItems:"center",marginTop:12},
  logoWrap:{alignItems:"center"},
  logoTextLarge:{fontSize:58,fontWeight:"900",color:COLORS.black,letterSpacing:-5},
  logoText:{fontSize:32,fontWeight:"900",color:COLORS.black,letterSpacing:-3},
  logoX:{color:COLORS.red},
  logoTaglineLarge:{fontSize:19,fontWeight:"800",color:COLORS.black,marginTop:-4},
  logoImage:{width:120,height:36},
  logoImageLarge:{width:230,height:66},
  logoTagline:{fontSize:10,fontWeight:"800",color:COLORS.black,marginTop:-2},
  tagline:{fontSize:22,fontWeight:"800",textAlign:"center",marginTop:2},
  heroSubline:{fontSize:10,letterSpacing:1.5,textAlign:"center",color:COLORS.text,marginVertical:9},
  languagePill:{backgroundColor:"#fff",borderWidth:1,borderColor:COLORS.line,borderRadius:24,paddingHorizontal:16,paddingVertical:10,alignSelf:"flex-end"},
  languageText:{fontWeight:"700",color:COLORS.black},
  cityScene:{height:300,borderRadius:28,overflow:"hidden",backgroundColor:"#EAF1F7",position:"relative",marginVertical:6},
  cityBackdropSmall:{position:"absolute",left:0,right:0,top:0,bottom:0,backgroundColor:"#EAF1F7"},
  sun:{position:"absolute",width:100,height:100,borderRadius:50,backgroundColor:"#FFE38C",top:52,right:55},
  cityTower:{position:"absolute",bottom:62,width:46,backgroundColor:"#AFC5D7",borderTopLeftRadius:4,borderTopRightRadius:4},
  roadStrip:{position:"absolute",left:0,right:0,bottom:0,height:60,backgroundColor:"#626D78"},
  heroScript:{position:"absolute",left:18,top:52,color:COLORS.red,fontSize:31,fontWeight:"800",fontStyle:"italic",lineHeight:32},
  serviceMiniRow:{flexDirection:"row",gap:7,marginTop:12},
  serviceMiniCard:{flex:1,borderWidth:1,borderColor:COLORS.line,backgroundColor:"#fff",borderRadius:18,padding:10,alignItems:"center",minHeight:88,shadowColor:"#0F172A",shadowOpacity:0.04,shadowRadius:10,shadowOffset:{width:0,height:3},elevation:2},
  serviceMiniIcon:{width:36,height:36,borderRadius:18,backgroundColor:"#F7F9FC",alignItems:"center",justifyContent:"center"},
  serviceMiniTitle:{fontWeight:"800",fontSize:12,marginTop:3},
  serviceMiniSub:{fontSize:9,color:COLORS.muted,textAlign:"center"},
  authHero:{paddingTop:6},
  authScene:{height:170,marginTop:4,overflow:"hidden",backgroundColor:"#EEF3F7",position:"relative"},
  authSceneImage:{position:"absolute",left:0,top:0,width:"100%",height:"100%"},
  authSceneShade:{position:"absolute",left:0,right:0,top:0,bottom:0,backgroundColor:"rgba(255,255,255,.06)"},
  heroScriptSmall:{position:"absolute",left:18,top:34,color:COLORS.red,fontSize:24,fontWeight:"800",fontStyle:"italic",lineHeight:25,zIndex:2},
  authCard:{marginTop:-4,borderTopLeftRadius:30,borderTopRightRadius:30,padding:20,backgroundColor:"#fff",shadowColor:"#0F172A",shadowOpacity:0.05,shadowRadius:18,shadowOffset:{width:0,height:-4},elevation:4},
  authTitle:{fontSize:30,fontWeight:"900",color:COLORS.black,textAlign:"center"},
  authSubtitle:{fontSize:16,color:COLORS.muted,textAlign:"center",marginTop:4,marginBottom:14},
  authHeader:{padding:14,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  headerBack:{width:44,height:44,borderRadius:22,backgroundColor:"#fff",borderWidth:1,borderColor:COLORS.line,alignItems:"center",justifyContent:"center"},
  headerBackSpacer:{width:44},
  headerBackText:{fontSize:30,color:COLORS.black,lineHeight:32},
  phoneInput:{height:56,borderRadius:16,borderWidth:1,borderColor:"#CBD5E1",flexDirection:"row",alignItems:"center",paddingHorizontal:14,marginVertical:10,backgroundColor:"#FFFFFF"},
  flag:{fontSize:23},
  countryCode:{fontWeight:"800",marginLeft:8},
  verticalLine:{height:30,width:1,backgroundColor:COLORS.line,marginHorizontal:10},
  phoneTextInput:{flex:1,fontSize:17,color:COLORS.black},
  primaryBtn:{minHeight:54,borderRadius:16,backgroundColor:COLORS.red,alignItems:"center",justifyContent:"center",paddingHorizontal:20,marginVertical:7,flexDirection:"row",position:"relative",shadowColor:COLORS.red,shadowOpacity:0.18,shadowRadius:10,shadowOffset:{width:0,height:5},elevation:3},
  primaryBtnSmall:{minHeight:44,borderRadius:14,paddingHorizontal:14},
  primaryDisabled:{opacity:.6},
  primaryBtnText:{color:"#fff",fontSize:18,fontWeight:"900"},
  primaryBtnTextSmall:{fontSize:14},
  btnArrow:{position:"absolute",right:12,width:38,height:38,borderRadius:19,backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},
  btnArrowText:{fontSize:24,color:COLORS.red,fontWeight:"900"},
  outlineBtn:{minHeight:52,borderRadius:16,borderWidth:1.5,borderColor:COLORS.red,alignItems:"center",justifyContent:"center",paddingHorizontal:16,marginVertical:7,backgroundColor:"#fff"},
  outlineBtnSmall:{minHeight:42,borderRadius:13,borderWidth:1},
  outlineBtnText:{color:COLORS.red,fontSize:16,fontWeight:"800"},
  outlineBtnTextSmall:{fontSize:13},
  dividerWithText:{flexDirection:"row",alignItems:"center",gap:10,marginVertical:12},
  dividerLine:{height:1,flex:1,backgroundColor:COLORS.line},
  muted:{color:COLORS.muted,fontSize:12},
  socialRow:{flexDirection:"row",justifyContent:"center",gap:18},
  socialLabelRow:{flexDirection:"row",justifyContent:"center",gap:28,marginBottom:14},
  socialCircle:{width:54,height:54,borderRadius:27,borderWidth:1,borderColor:COLORS.line,alignItems:"center",justifyContent:"center",backgroundColor:"#fff"},
  socialCircleText:{fontSize:22,fontWeight:"900"},
  socialLabel:{textAlign:"center",fontSize:11,marginTop:4},
  otpMobile:{textAlign:"center",fontSize:22,fontWeight:"900",color:COLORS.red,marginTop:8,marginBottom:14},
  otpInput:{alignSelf:"center",width:"72%",borderWidth:2,borderColor:"#FFD0D4",borderRadius:18,backgroundColor:"#FFF8F8",paddingVertical:14,fontSize:30,fontWeight:"900",color:COLORS.black,letterSpacing:12},
  otpHint:{textAlign:"center",color:COLORS.muted,fontSize:13,marginTop:8,marginBottom:8},
  otpAttempts:{textAlign:"center",color:COLORS.red,fontSize:13,fontWeight:"900",marginTop:8,marginBottom:4},
  featureRibbon:{backgroundColor:COLORS.softRed,borderRadius:20,padding:12,marginVertical:14,flexDirection:"row"},
  featureItem:{flex:1,alignItems:"center"},
  featureIcon:{width:38,height:38,borderRadius:19,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",marginBottom:4},
  featureTitle:{fontSize:11,fontWeight:"800",textAlign:"center"},
  featureSub:{fontSize:10,textAlign:"center",color:COLORS.text},
  terms:{fontSize:11,color:COLORS.muted,textAlign:"center",marginTop:10},
  redText:{color:COLORS.red,fontWeight:"800"},
  message:{fontSize:12,textAlign:"center",marginTop:10,color:COLORS.red},
  homeTopHero:{backgroundColor:"#F4F7FA",paddingBottom:2},
  homeTopRow:{paddingHorizontal:14,paddingTop:8,paddingBottom:4,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  homeRightActions:{flexDirection:"row",alignItems:"center",gap:5,flexShrink:1},
  iconButton:{width:42,height:42,borderRadius:21,borderWidth:1,borderColor:COLORS.line,backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},
  iconGlyph:{fontSize:22},
  locationPill:{borderWidth:1,borderColor:COLORS.line,backgroundColor:"#fff",borderRadius:20,paddingHorizontal:10,paddingVertical:8,flexDirection:"row",alignItems:"center",gap:5,flexShrink:1},
  locationPin:{color:COLORS.red,fontSize:15},
  locationPillText:{fontWeight:"800",fontSize:13},
  bellButton:{width:40,height:40,borderRadius:20,backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},
  bell:{fontSize:25},
  homeHeroVisual:{height:220,position:"relative",overflow:"hidden",alignItems:"center"},
  homeScript:{position:"absolute",left:26,top:30,color:COLORS.red,fontSize:28,fontWeight:"900",fontStyle:"italic",lineHeight:31,zIndex:2},
  promiseRow:{position:"absolute",bottom:7,left:10,right:10,flexDirection:"row",backgroundColor:"rgba(255,255,255,.92)",borderRadius:18,padding:8},
  homeContent:{paddingHorizontal:14,paddingTop:8,paddingBottom:12},
  sectionTitleLarge:{fontSize:19,fontWeight:"800",color:COLORS.black,marginVertical:8,letterSpacing:-0.25},
  card:{backgroundColor:"#fff",borderWidth:1,borderColor:COLORS.line,borderRadius:20,padding:14,marginVertical:7,shadowColor:"#0F172A",shadowOpacity:0.045,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:2},
  sectionHeaderRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  routeInputCard:{borderRadius:16,borderWidth:1,borderColor:"#E2E8F0",padding:10,marginTop:8,backgroundColor:"#FFFFFF"},
  routePoint:{flexDirection:"row",alignItems:"center",paddingVertical:6,gap:10},
  routeDot:{width:18,height:18,borderRadius:9,borderWidth:2,alignItems:"center",justifyContent:"center"},
  routeDotInner:{width:8,height:8,borderRadius:4},
  routeTitle:{fontSize:12,color:COLORS.muted},
  routeValue:{fontSize:14,fontWeight:"700",marginTop:1},
  cardTitle:{fontSize:16,fontWeight:"800",color:COLORS.black,letterSpacing:-0.2},
  rideMapCard:{height:230,borderRadius:18,overflow:"hidden",backgroundColor:"#EDF3EA",position:"relative",borderWidth:1,borderColor:"#E2E8F0"},
  rideMapCardCompact:{height:190},
  mapWater:{position:"absolute",top:0,right:-60,width:190,height:"100%",backgroundColor:"#BDE0F4",transform:[{rotate:"8deg"}]},
  mapStreet:{position:"absolute",left:-20,right:-20,height:4,backgroundColor:"#E8C86B",opacity:.75},
  mapStreetHorizontal:{position:"absolute",top:42,bottom:-20,width:3,backgroundColor:"#fff",opacity:.85,transform:[{rotate:"15deg"}]},
  mapCity:{position:"absolute",left:"43%",top:"45%",fontSize:23,fontWeight:"900",color:"#234"},
  mapLandmark:{position:"absolute",right:12,top:18,color:"#075BD4",fontWeight:"800"},
  mapPark:{position:"absolute",right:15,top:128,color:"#1A9A5B",fontWeight:"800"},
  mapVehicle:{position:"absolute",fontSize:22},
  mapDriver:{left:"42%",top:"50%",fontSize:32},
  searchBubble:{position:"absolute",left:"33%",top:"42%",padding:10,backgroundColor:"#fff",borderRadius:16,borderWidth:1,borderColor:COLORS.line},
  mapPin:{position:"absolute",width:34,height:34,borderRadius:17,backgroundColor:"#fff",borderWidth:5,borderColor:COLORS.red,alignItems:"center",justifyContent:"center"},
  mapPickup:{left:40,bottom:44},
  mapDrop:{right:62,top:68},
  mapPinText:{color:COLORS.red},
  routeLine:{position:"absolute",height:5,left:54,right:90,bottom:57,backgroundColor:COLORS.red,transform:[{rotate:"-12deg"}],borderRadius:5},
  mapLabelPickup:{position:"absolute",left:15,bottom:85,paddingHorizontal:9,paddingVertical:6,borderRadius:12,backgroundColor:"#fff",borderWidth:1,borderColor:COLORS.line},
  mapLabelDrop:{position:"absolute",right:8,top:38,paddingHorizontal:9,paddingVertical:6,borderRadius:12,backgroundColor:"#fff",borderWidth:1,borderColor:COLORS.line},
  mapLabelTitle:{fontSize:11,fontWeight:"800"},
  mapControlCol:{position:"absolute",right:8,bottom:14,gap:7},
  mapControl:{width:38,height:38,borderRadius:19,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:COLORS.line},
  mapControlDisabled:{opacity:.6},
  mapControlActive:{backgroundColor:"#F4F7F5",borderColor:COLORS.green},
  mapLayerMenu:{position:"absolute",right:46,bottom:0,minWidth:112,padding:6,borderRadius:14,backgroundColor:"#fff",borderWidth:1,borderColor:COLORS.line,shadowColor:"#000",shadowOpacity:.08,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:4},
  mapLayerOption:{paddingHorizontal:10,paddingVertical:9,borderRadius:10},
  mapLayerOptionActive:{backgroundColor:"#EAF8F1"},
  mapLayerOptionText:{fontSize:12,fontWeight:"800",color:COLORS.black},
  mapCenterButtonText:{fontSize:20,color:COLORS.black,fontWeight:"800"},
  mapCenterButtonLoading:{opacity:.6},
  mapBubble:{position:"absolute",left:"27%",top:"46%",backgroundColor:"#fff",padding:10,borderRadius:15,borderWidth:1,borderColor:COLORS.line},
  mapBubbleGreen:{position:"absolute"},
  mapBubbleBlue:{position:"absolute",left:"35%",top:"36%",backgroundColor:COLORS.softBlue,padding:10,borderRadius:15},
  quickPlacesRow:{flexDirection:"row",gap:6,marginVertical:8},
  quickPlace:{flex:1,alignItems:"center",padding:8,borderRadius:16,borderWidth:1,borderColor:COLORS.line,backgroundColor:"#fff",minWidth:70},
  quickPlaceIcon:{fontSize:20},
  quickPlaceTitle:{fontSize:10,fontWeight:"800",textAlign:"center"},
  quickPlaceSub:{fontSize:9,color:COLORS.muted},
  rideChoiceRow:{flexDirection:"row",gap:7},
  rideChoiceScroll:{gap:7,paddingVertical:2,paddingRight:8},
  rideChoice:{width:154,minHeight:118,borderRadius:16,borderWidth:1,borderColor:COLORS.line,padding:9,backgroundColor:"#fff",position:"relative"},
  rideChoiceSelected:{borderColor:COLORS.red,backgroundColor:"#FFF7F7"},
  rideChoiceIcon:{width:42,height:42,alignItems:"center",justifyContent:"center",marginBottom:4},
  rideChoiceTitle:{fontSize:12,fontWeight:"900"},
  rideChoicePrice:{fontSize:11,color:COLORS.muted,marginTop:3},
  infoCircle:{position:"absolute",right:8,bottom:8,width:20,height:20,borderRadius:10,borderWidth:1,borderColor:COLORS.line,textAlign:"center",lineHeight:18,color:COLORS.muted},
  actionTwoCol:{flexDirection:"row",gap:7},
  softCard:{flex:1,backgroundColor:COLORS.softRed,borderRadius:17,padding:11,flexDirection:"row",alignItems:"center",gap:8},
  softIcon:{fontSize:26,color:COLORS.red},
  softTitle:{fontSize:12,fontWeight:"800",color:COLORS.black},
  softSub:{fontSize:10,color:COLORS.muted},
  chevron:{fontSize:24,color:COLORS.black},
  bottomNav:{position:"relative",marginTop:8,borderTopWidth:1,borderColor:COLORS.line,backgroundColor:"#fff",flexDirection:"row",paddingTop:8},
  navItem:{flex:1,alignItems:"center",padding:6,borderRadius:14},
  navActive:{backgroundColor:COLORS.softRed},
  navIcon:{fontSize:22},
  navLabel:{fontSize:10,color:COLORS.text},
  navActiveText:{fontSize:10,fontWeight:"900",color:COLORS.red},
  headerBar:{height:68,paddingHorizontal:10,flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:"#fff",borderBottomWidth:1,borderBottomColor:COLORS.line},
  headerBackCircle:{width:42,height:42,borderRadius:21,backgroundColor:"#fff",borderWidth:1,borderColor:COLORS.line,alignItems:"center",justifyContent:"center"},
  headerBrand:{flex:1,alignItems:"center"},
  supportPill:{flexDirection:"row",alignItems:"center",gap:5,borderRadius:20,borderWidth:1,borderColor:COLORS.line,paddingHorizontal:12,paddingVertical:8,backgroundColor:"#fff"},
  supportPillIcon:{fontSize:18},
  supportPillText:{fontWeight:"800"},
  mapLargeWrap:{padding:8,backgroundColor:COLORS.mapBg,position:"relative"},
  mapTopInputs:{position:"absolute",left:18,right:18,top:18,backgroundColor:"#fff",borderRadius:18,padding:9,borderWidth:1,borderColor:COLORS.line},
  mapCenterButton:{position:"absolute",right:18,bottom:58,width:44,height:44,borderRadius:22,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:COLORS.line},
  pillButton:{borderRadius:18,paddingHorizontal:12,paddingVertical:8,borderWidth:1,borderColor:COLORS.line,backgroundColor:"#fff"},
  pillButtonRed:{borderColor:COLORS.red,backgroundColor:COLORS.red},
  pillButtonText:{fontSize:12,fontWeight:"800"},
  pillButtonTextRed:{color:"#fff"},
  input:{borderWidth:1,borderColor:COLORS.line,borderRadius:13,paddingHorizontal:12,paddingVertical:12,fontSize:15,marginVertical:6},
  compactInput:{borderWidth:1,borderColor:COLORS.line,borderRadius:13,paddingHorizontal:12,paddingVertical:11,fontSize:14,flex:1},
  locationFormRow:{gap:7},
  helpBanner:{marginTop:10,padding:12,borderRadius:18,backgroundColor:COLORS.softRed,flexDirection:"row",alignItems:"center",gap:8},
  helpBannerIcon:{fontSize:30},
  helpBannerTitle:{fontWeight:"900"},
  helpBannerSub:{fontSize:11,color:COLORS.muted},
  safeNote:{textAlign:"center",color:COLORS.text,fontSize:12,marginVertical:9},
  sectionLabel:{fontSize:15,fontWeight:"900",marginTop:10,marginBottom:6},
  chipRow:{flexDirection:"row",flexWrap:"wrap",gap:8},
  chip:{borderWidth:1,borderColor:COLORS.line,borderRadius:18,paddingHorizontal:12,paddingVertical:9,backgroundColor:"#fff"},
  chipSelected:{borderColor:COLORS.red,backgroundColor:COLORS.softRed},
  chipText:{fontSize:12,fontWeight:"700"},
  savedRow:{flexDirection:"row",alignItems:"center",gap:10,borderBottomWidth:1,borderBottomColor:COLORS.line,paddingVertical:12},
  savedIcon:{color:COLORS.red,fontSize:18},
  savedTitle:{fontWeight:"800"},
  savedSub:{fontSize:11,color:COLORS.muted},
  rideMapTop:{backgroundColor:COLORS.mapBg,padding:8},
  routeSummary:{marginTop:7,padding:10,borderRadius:18,borderWidth:1,borderColor:COLORS.line,backgroundColor:"#fff",flexDirection:"row"},
  distanceBadge:{width:84,alignItems:"center",justifyContent:"center",borderLeftWidth:1,borderColor:COLORS.line},
  distanceBig:{fontSize:20,fontWeight:"900"},
  distanceSmall:{fontSize:10,color:COLORS.muted},
  modeToggle:{flexDirection:"row",gap:8,padding:10},
  modeToggleItem:{flex:1,borderRadius:16,borderWidth:1,borderColor:COLORS.line,padding:11,flexDirection:"row",gap:8,alignItems:"center"},
  modeActive:{borderColor:COLORS.red,backgroundColor:COLORS.softRed},
  modeIcon:{fontSize:25},
  modeTitle:{fontSize:13,fontWeight:"900"},
  modeSub:{fontSize:10,color:COLORS.muted},
  rideOption:{borderWidth:1,borderColor:COLORS.line,borderRadius:19,padding:11,flexDirection:"row",alignItems:"center",gap:10,marginBottom:8,backgroundColor:"#fff"},
  rideOptionSelected:{borderColor:COLORS.red,backgroundColor:"#FFF8F8"},
  rideOptionIcon:{width:68,height:58,borderRadius:14,backgroundColor:"#F6F7F9",alignItems:"center",justifyContent:"center"},
  rideOptionIconText:{fontSize:34},
  rideOptionTitle:{fontSize:16,fontWeight:"900"},
  rideOptionSub:{fontSize:12,color:COLORS.muted},
  rideOptionMeta:{fontSize:10,color:COLORS.muted,marginTop:5},
  iconMetaRow:{flexDirection:"row",alignItems:"center",gap:4,marginTop:5,flexWrap:"wrap"},
  metaDot:{fontSize:10,color:COLORS.muted},
  rideOptionRight:{alignItems:"flex-end",gap:8},
  rideOptionFare:{fontSize:16,fontWeight:"900"},
  checkCircle:{width:25,height:25,borderRadius:13,borderWidth:1,borderColor:"#D2D8E2",alignItems:"center",justifyContent:"center"},
  checkCircleSelected:{backgroundColor:COLORS.red,borderColor:COLORS.red},
  goodsOption:{borderWidth:1,borderColor:COLORS.line,borderRadius:19,padding:11,flexDirection:"row",alignItems:"center",gap:10,marginBottom:8,backgroundColor:"#fff"},
  goodsOptionSelected:{borderColor:COLORS.red,backgroundColor:"#FFF8F8"},
  goodsIcon:{width:78,height:62,borderRadius:14,backgroundColor:"#F6F7F9",alignItems:"center",justifyContent:"center"},
  scheduleDateTimeRow:{flexDirection:"row",gap:8,width:"100%"},
  scheduleDateInput:{borderWidth:1,borderColor:COLORS.line,borderRadius:13,paddingHorizontal:12,paddingVertical:11,flex:1,minWidth:0,height:52},
  scheduleTimeInput:{borderWidth:1,borderColor:COLORS.line,borderRadius:13,paddingHorizontal:12,paddingVertical:11,flex:1,minWidth:0,height:52},
  schedulePeriodRow:{flexDirection:"row",gap:8,width:"100%"},
  schedulePeriodButton:{borderWidth:1,borderColor:COLORS.line,borderRadius:13,minHeight:50,flex:1,alignItems:"center",justifyContent:"center"},
  schedulePeriodText:{fontWeight:"800"},
  scheduleGrid:{flexDirection:"row",gap:7,flexWrap:"wrap",marginTop:8},
  scheduleInput:{borderWidth:1,borderColor:COLORS.line,borderRadius:13,padding:10,flex:1,minWidth:120},
  centerPill:{alignItems:"center",justifyContent:"center",minWidth:70},
  switchPill:{borderRadius:20,paddingHorizontal:13,paddingVertical:8,backgroundColor:"#EEF1F5"},
  switchPillOn:{backgroundColor:COLORS.softGreen},
  switchText:{fontWeight:"900"},
  paymentOfferRow:{flexDirection:"row",gap:7,marginVertical:5},
  progressRow:{flexDirection:"row",alignItems:"center",paddingHorizontal:12,paddingVertical:10},
  progressItem:{alignItems:"center",width:62},
  progressCircle:{width:30,height:30,borderRadius:15,backgroundColor:"#E7EBF0",alignItems:"center",justifyContent:"center"},
  progressActive:{backgroundColor:COLORS.red},
  progressLabel:{fontSize:10,color:COLORS.muted,marginTop:4},
  progressLabelActive:{color:COLORS.red,fontWeight:"800"},
  progressLine:{height:2,backgroundColor:"#CBD1DA",flex:1,marginTop:-18},
  mapReviewTop:{paddingHorizontal:8},
  vehicleSummary:{flexDirection:"row",alignItems:"center",gap:10},
  vehicleImage:{width:"100%",height:"100%"},
  mapVehicleImage:{position:"absolute",width:82,height:52},
  mapDriverImage:{width:110,height:70},
  vehicleIllustration:{width:150,height:95,position:"relative",alignSelf:"center"},
  vehicleHero:{width:190,height:115,marginTop:2,alignSelf:"center"},
  vehicleLarge:{width:"82%",maxWidth:320,height:170},
  vehicleCompact:{width:88,height:60,marginLeft:"auto"},
  vehicleRoof:{position:"absolute",left:26,right:20,top:18,height:14,borderRadius:9},
  vehicleCab:{position:"absolute",left:34,right:24,top:28,bottom:18,borderRadius:15,borderWidth:3,borderColor:"#111",backgroundColor:"#FFF4F2"},
  vehicleWindow:{position:"absolute",left:8,right:8,top:6,height:26,borderRadius:9,borderWidth:2,borderColor:"#111",backgroundColor:"#CFE7F6"},
  vehicleSeat:{position:"absolute",left:20,right:24,bottom:12,height:10,borderRadius:5,backgroundColor:"#8B4A32"},
  vehiclePanel:{position:"absolute",right:8,bottom:18,width:48,height:30,borderRadius:7,backgroundColor:COLORS.red,alignItems:"center",justifyContent:"center"},
  vehicleBrand:{color:"#fff",fontWeight:"900",fontSize:11},
  wheelLeft:{position:"absolute",left:28,bottom:0,width:26,height:26,borderRadius:13,backgroundColor:"#111",borderWidth:5,borderColor:"#DCE2E7"},
  wheelRight:{position:"absolute",right:24,bottom:0,width:26,height:26,borderRadius:13,backgroundColor:"#111",borderWidth:5,borderColor:"#DCE2E7"},
  vehicleBumper:{position:"absolute",left:18,right:14,bottom:12,height:4,backgroundColor:"#111",borderRadius:3},
  twoInputRow:{flexDirection:"row",gap:8,marginTop:8},
  fareHighlight:{backgroundColor:"#FFF8F8",borderColor:"#FFD0D4"},
  fareLabel:{fontSize:13,color:COLORS.muted},
  fare:{fontSize:34,fontWeight:"900",color:COLORS.black,marginTop:3},
  fareSmall:{fontSize:17,fontWeight:"900"},
  fareReceiptCard:{flexDirection:"row",gap:12},
  rightAmount:{position:"absolute",right:0},
  receiptTotalRow:{flexDirection:"row",justifyContent:"space-between",marginTop:10,paddingTop:10,borderTopWidth:1,borderColor:COLORS.line},
  receiptTotalLabel:{fontWeight:"900"},
  receiptTotal:{fontSize:20,fontWeight:"900",color:COLORS.green},
  paymentSuccess:{flex:1,backgroundColor:COLORS.softGreen,borderRadius:15,padding:12,alignItems:"center",justifyContent:"center"},
  completedBanner:{padding:14,backgroundColor:COLORS.softGreen,borderRadius:18,margin:10,flexDirection:"row",alignItems:"center",gap:12},
  completedCircle:{width:56,height:56,borderRadius:28,backgroundColor:COLORS.green,alignItems:"center",justifyContent:"center"},
  completedCheck:{color:"#fff",fontSize:32,fontWeight:"900"},
  completedTitle:{fontSize:22,fontWeight:"900"},
  completedSub:{fontSize:12,color:COLORS.muted},
  completedCheckSmall:{fontSize:26,color:COLORS.green},
  paymentSuccessTitle:{fontSize:12,fontWeight:"900",textAlign:"center",marginTop:4},
  paymentSuccessSub:{fontSize:11,color:COLORS.muted,textAlign:"center",marginBottom:4},
  stars:{flexDirection:"row",justifyContent:"center",gap:4,marginVertical:12},
  starActive:{fontSize:33,color:"#FFC107"},
  starInactive:{fontSize:33,color:"#CBD0D8"},
  commentInput:{borderWidth:1,borderColor:COLORS.line,borderRadius:14,minHeight:88,padding:12,textAlignVertical:"top",marginTop:7},
  greenThanks:{backgroundColor:COLORS.softGreen,borderColor:"#BDE5CC"},
  greenThanksTitle:{fontSize:15,fontWeight:"900",color:COLORS.green},
  tripBottomRow:{flexDirection:"row",gap:8},
  noMatchBanner:{padding:14,backgroundColor:"#FFF4F5",borderWidth:1,borderColor:"#FFD5DA",borderRadius:16,flexDirection:"row",alignItems:"center",gap:10},
  noMatchIcon:{width:54,height:54,borderRadius:27,backgroundColor:"#FFF",borderWidth:2,borderColor:COLORS.red,alignItems:"center",justifyContent:"center"},
  noMatchIconText:{fontSize:28,fontWeight:"900",color:COLORS.red},
  noMatchTitle:{fontSize:19,fontWeight:"900",color:COLORS.text},
  noMatchSub:{fontSize:12,color:COLORS.muted,marginTop:3},
  noMatchReasonBox:{marginTop:12,padding:12,borderRadius:12,backgroundColor:"#F7F8FA",borderWidth:1,borderColor:COLORS.line},
  noMatchReasonLabel:{fontSize:10,textTransform:"uppercase",letterSpacing:0.6,color:COLORS.muted,fontWeight:"800"},
  noMatchReasonValue:{fontSize:12,color:COLORS.text,fontWeight:"800",marginTop:4},
  scheduledBanner:{padding:14,backgroundColor:COLORS.softGreen,borderWidth:1,borderColor:"#C7EAD4",borderRadius:16,flexDirection:"row",alignItems:"center",gap:10},
  scheduledIcon:{width:54,height:54,borderRadius:27,backgroundColor:COLORS.green,alignItems:"center",justifyContent:"center"},
  scheduledIconText:{fontSize:27,fontWeight:"900",color:"#FFF"},
  scheduledTitle:{fontSize:19,fontWeight:"900",color:COLORS.text},
  scheduledSub:{fontSize:12,color:COLORS.muted,marginTop:3},
  scheduledTime:{fontSize:20,fontWeight:"900",color:COLORS.green,marginTop:8,marginBottom:12},
  stateHeader:{padding:14,backgroundColor:"#FFF2F3",flexDirection:"row",alignItems:"center",gap:10},
  stateBanner:{padding:14,backgroundColor:"#FFF2F3",flexDirection:"row",alignItems:"center",gap:10},
  stateIcon:{width:54,height:54,borderRadius:27,backgroundColor:COLORS.red,alignItems:"center",justifyContent:"center"},
  stateTitle:{fontSize:19,fontWeight:"900"},
  stateSub:{fontSize:12,color:COLORS.muted,marginTop:2},
  etaBox:{backgroundColor:"#FFE7EA",borderRadius:14,padding:8,alignItems:"center",minWidth:82},
  etaBig:{fontSize:18,fontWeight:"900",color:COLORS.red},
  etaSmall:{fontSize:9,color:COLORS.muted},
  arrivedBanner:{padding:14,backgroundColor:COLORS.softGreen,flexDirection:"row",alignItems:"center",gap:10},
  arrivedIcon:{width:54,height:54,borderRadius:27,backgroundColor:COLORS.green,alignItems:"center",justifyContent:"center"},
  etaBoxGreen:{backgroundColor:"#DFF3E7",borderRadius:14,padding:8,alignItems:"center",minWidth:82},
  etaGreenBig:{fontSize:18,fontWeight:"900",color:COLORS.green},
  startedBanner:{padding:14,backgroundColor:COLORS.softGreen,flexDirection:"row",alignItems:"center",gap:10},
  driverSummary:{flexDirection:"row",alignItems:"center",gap:10},
  avatarDriver:{width:60,height:60,borderRadius:30,backgroundColor:"#D7DEE8",alignItems:"center",justifyContent:"center"},
  avatarDriverText:{fontSize:22,fontWeight:"900"},
  driverName:{fontSize:15,fontWeight:"900"},
  starInline:{color:"#FFC107"},
  driverVehicle:{fontSize:12,color:COLORS.muted,marginTop:3},
  driverStatus:{fontSize:11,color:COLORS.green,marginTop:3},
  driverActions:{flexDirection:"row",gap:7,marginTop:10,flexWrap:"wrap"},
  callBtn:{flex:1,minWidth:80,minHeight:42,borderRadius:15,backgroundColor:COLORS.green,alignItems:"center",justifyContent:"center"},
  callBtnText:{color:"#fff",fontWeight:"900"},
  sosQuick:{flex:1,minWidth:80,minHeight:42,borderRadius:15,backgroundColor:COLORS.red,alignItems:"center",justifyContent:"center"},
  sosQuickText:{color:"#fff",fontWeight:"900"},
  timeline:{flexDirection:"row",marginTop:16,paddingTop:10,borderTopWidth:1,borderColor:COLORS.line},
  timelineItem:{flex:1,alignItems:"center"},
  timelineDot:{width:27,height:27,borderRadius:14,backgroundColor:"#D5DAE2",alignItems:"center",justifyContent:"center"},
  timelineDotActive:{backgroundColor:COLORS.red},
  timelineLabel:{fontSize:9,color:COLORS.muted,textAlign:"center",marginTop:4},
  timelineLabelActive:{color:COLORS.red,fontWeight:"800"},
  pinCard:{backgroundColor:"#FFF5F6",borderColor:"#FFD9DD"},
  pinTitle:{fontSize:16,fontWeight:"900"},
  pinSub:{fontSize:12,color:COLORS.muted,marginTop:4},
  pinBoxes:{flexDirection:"row",gap:8,marginTop:10},
  pinBox:{flex:1,height:48,borderRadius:10,borderWidth:1,borderColor:"#DDE2EA",backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},
  pinDash:{fontSize:25,color:"#ADB6C3"},
  pinNumber:{fontSize:18,fontWeight:"900"},
  blueInfo:{marginTop:10,color:COLORS.blue,fontSize:11},
  verifyCard:{backgroundColor:COLORS.softBlue,borderColor:"#D0E4FB"},
  verificationStep:{marginTop:12,padding:12,borderRadius:14,borderWidth:1,borderColor:"#E5E7EB",backgroundColor:"#FFFFFF",flexDirection:"row",alignItems:"flex-start",gap:10},
  verificationStepNumber:{width:28,height:28,borderRadius:14,backgroundColor:COLORS.softRed,alignItems:"center",justifyContent:"center"},
  verificationStepNumberText:{fontSize:13,fontWeight:"900",color:COLORS.red},
  verificationStepTitle:{fontSize:14,fontWeight:"900",color:COLORS.text},
  verificationStepSub:{fontSize:11,color:COLORS.muted,marginTop:3,lineHeight:16},
  verificationVerified:{fontSize:9,fontWeight:"900",color:COLORS.green,letterSpacing:0.4},
  verificationPending:{fontSize:9,fontWeight:"900",color:"#F59E0B",letterSpacing:0.4},
  verificationOtpBox:{marginTop:10,padding:12,borderRadius:12,borderWidth:1,borderColor:"#FFD9DD",backgroundColor:COLORS.softRed,alignItems:"center"},
  verificationOtpLabel:{fontSize:9,fontWeight:"900",color:COLORS.muted,letterSpacing:1},
  verificationOtp:{fontSize:28,fontWeight:"900",letterSpacing:6,color:COLORS.red,marginTop:4},
  verificationOtpExpiry:{fontSize:10,color:COLORS.muted,marginTop:4},
  verificationPendingText:{fontSize:10,color:COLORS.muted,marginTop:8,lineHeight:15},
  verificationRule:{marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:"#F1F5F9"},
  greenText:{color:COLORS.green,fontWeight:"900",marginTop:8},
  profileCard:{backgroundColor:COLORS.softRed,borderColor:"#FFE0E3"},
  profileTop:{flexDirection:"row",gap:12,alignItems:"center"},
  profilePhotoWrap:{width:72,height:72,borderRadius:36,overflow:"hidden",alignItems:"center",justifyContent:"center",marginRight:10},
  profilePhoto:{width:72,height:72,borderRadius:36},
  profilePhotoLarge:{width:120,height:120,borderRadius:60,alignSelf:"center"},
  profilePhotoPreview:{width:120,height:120,borderRadius:16,alignSelf:"center",marginVertical:8},
  avatarLarge:{width:120,height:120,borderRadius:60,backgroundColor:"#FFE4E8",alignItems:"center",justifyContent:"center",alignSelf:"center"},
  avatarTextLarge:{fontSize:42,fontWeight:"900",color:"#BE123C"},
  softGreenCard:{backgroundColor:"#ECFDF3",borderColor:"#A7F3D0"},
  softBlueCard:{backgroundColor:"#EFF6FF",borderColor:"#BFDBFE"},
  avatar:{width:78,height:78,borderRadius:39,backgroundColor:"#DCE3EC",alignItems:"center",justifyContent:"center",borderWidth:3,borderColor:"#fff"},
  avatarText:{fontSize:28,fontWeight:"900"},
  profileName:{fontSize:20,fontWeight:"900"},
  profileLine:{fontSize:12,color:COLORS.text,marginTop:2},
  memberPill:{marginTop:12,backgroundColor:"#FFFBE6",borderRadius:13,padding:9,flexDirection:"row",justifyContent:"space-between"},
  walletCard:{marginVertical:7,backgroundColor:COLORS.softGreen,borderRadius:20,padding:14,flexDirection:"row",alignItems:"center",gap:10},
  walletIcon:{width:48,height:48,borderRadius:24,backgroundColor:COLORS.green,alignItems:"center",justifyContent:"center"},
  walletLabel:{fontSize:12,fontWeight:"700"},
  walletFilterRow:{flexDirection:"row",gap:7,marginTop:12,marginBottom:4,flexWrap:"wrap"},
  walletFilterChip:{paddingHorizontal:11,paddingVertical:7,borderRadius:999,borderWidth:1,borderColor:COLORS.line,backgroundColor:"#fff"},
  walletFilterChipActive:{borderColor:COLORS.red,backgroundColor:"#FFF6F7"},
  walletFilterText:{fontSize:11,fontWeight:"800",color:COLORS.muted},
  walletFilterTextActive:{color:COLORS.red},
  refundSummaryCard:{marginTop:12,padding:12,borderRadius:15,borderWidth:1,borderColor:"#DDE7F2",backgroundColor:"#F8FAFC",flexDirection:"row",alignItems:"center",gap:12},
  refundSummaryAmount:{fontSize:16,fontWeight:"900",color:COLORS.red},
  walletAmount:{fontSize:26,fontWeight:"900"},
  refundRow:{flexDirection:"row",alignItems:"flex-start",paddingVertical:10,borderTopWidth:1,borderTopColor:COLORS.line},
  statsRow:{flexDirection:"row",gap:7,marginBottom:7},
  statCard:{flex:1,backgroundColor:"#F7F9FC",borderRadius:16,padding:10,alignItems:"center",borderWidth:1,borderColor:COLORS.line},
  statIcon:{fontSize:22},
  statValue:{fontSize:19,fontWeight:"900"},
  statLabel:{fontSize:10,color:COLORS.muted,textAlign:"center"},
  profileRow:{flexDirection:"row",alignItems:"center",gap:12,paddingVertical:13,borderBottomWidth:1,borderBottomColor:COLORS.line},
  profileRowIcon:{fontSize:23,width:30,textAlign:"center"},
  profileRowTitle:{fontSize:14,fontWeight:"800"},
  profileRowSub:{fontSize:11,color:COLORS.muted,marginTop:2},
  supportGrid:{flexDirection:"row",flexWrap:"wrap",gap:7,padding:10},
  supportTile:{width:"48%",borderWidth:1,borderColor:COLORS.line,borderRadius:17,padding:12,backgroundColor:"#fff"},
  supportTileIcon:{width:42,height:42,borderRadius:21,backgroundColor:COLORS.softGreen,alignItems:"center",justifyContent:"center"},
  supportTileTitle:{fontSize:13,fontWeight:"900",marginTop:7},
  supportTileSub:{fontSize:10,color:COLORS.muted},
  safetyHero:{backgroundColor:COLORS.softRed,flexDirection:"row",alignItems:"center",gap:10},
  safetyHeroIcon:{width:52,height:52,alignItems:"center",justifyContent:"center"},
  safetyHeroTitle:{fontSize:19,fontWeight:"900"},
  safetyHeroSub:{fontSize:11,color:COLORS.muted},
  faqRow:{flexDirection:"row",alignItems:"center",padding:12,borderRadius:16,borderWidth:1,borderColor:COLORS.line,marginVertical:4,backgroundColor:"#fff"},
  faqIcon:{width:34,height:34,borderRadius:17,backgroundColor:"#F4F5F7",alignItems:"center",justifyContent:"center"},
  emergencyStrip:{margin:10,padding:12,borderRadius:17,backgroundColor:COLORS.softRed,borderWidth:1,borderColor:"#FFD6DA",flexDirection:"row",alignItems:"center",gap:9},
  emergencyIcon:{width:44,height:44,borderRadius:22,backgroundColor:COLORS.red,color:"#fff",textAlign:"center",textAlignVertical:"center",fontWeight:"900",paddingTop:13},
  emergencyTitle:{fontSize:13,fontWeight:"900",color:COLORS.red},
  emergencySub:{fontSize:10,color:COLORS.muted},
  emergencyCall:{color:"#fff",backgroundColor:COLORS.red,paddingHorizontal:12,paddingVertical:9,borderRadius:12,fontWeight:"900"},
  safetyCard:{paddingBottom:18},
  confirmBox:{padding:13,borderWidth:1,borderColor:COLORS.line,borderRadius:14,marginVertical:10,backgroundColor:"#fff"},
  confirmBoxSelected:{borderColor:COLORS.red,backgroundColor:COLORS.softRed},
  photoGrid:{flexDirection:"row",flexWrap:"wrap",gap:8},
  photoCard:{width:"48%",borderRadius:16,borderWidth:1,borderColor:COLORS.line,overflow:"hidden"},
  photo:{width:"100%",height:140},
  photoRemove:{padding:9,alignItems:"center"},
  historyCard:{padding:11},
  historyTop:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:6},
  historyDate:{fontWeight:"800",flex:1},
  historyTime:{color:COLORS.muted,fontSize:11},
  statusPill:{paddingHorizontal:8,paddingVertical:5,borderRadius:9,backgroundColor:"#DDF3E5"},
  statusCancelled:{backgroundColor:"#E9ECF1"},
  statusPillText:{fontSize:10,fontWeight:"900",color:COLORS.green},
  historyBottom:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:8},
  historyFare:{fontSize:18,fontWeight:"900"},
  historyActions:{flexDirection:"row",gap:6,flexShrink:1,flexWrap:"wrap",justifyContent:"flex-end"},
  tabRow:{flexDirection:"row",gap:7,padding:10},
  tab:{flex:1,padding:10,borderRadius:14,backgroundColor:"#F1F3F6",alignItems:"center"},
  tabActive:{backgroundColor:COLORS.red},
  tabText:{fontSize:11,color:COLORS.text},
  tabActiveText:{fontSize:11,color:"#fff",fontWeight:"900"},
  googleMapVehicleMarker:{width:52,height:34},
  googleDriverMarker:{width:86,height:56},
  googleDriverMarkerWrap:{width:90,height:72,alignItems:"center",justifyContent:"center"},
  googleDriverPulse:{position:"absolute",width:64,height:64,borderRadius:32,backgroundColor:"rgba(243,27,45,.14)",borderWidth:2,borderColor:"rgba(243,27,45,.28)"},
  googleCurrentLocationMarker:{width:28,height:28,borderRadius:14,backgroundColor:"rgba(47,128,237,.22)",alignItems:"center",justifyContent:"center"},
  googleCurrentLocationDot:{width:13,height:13,borderRadius:7,backgroundColor:COLORS.blue,borderWidth:2,borderColor:"#fff"},
  googleMapTopShade:{position:"absolute",left:0,right:0,top:0,height:18,backgroundColor:"rgba(255,255,255,.12)"},
  mapBubbleTitle:{fontSize:12,fontWeight:"900",color:COLORS.black},
  scheduleGridDummy:{},
  paymentSuccessTitleDummy:{},
  photoRemoveDummy:{},
  stateIconDummy:{},
  stateHeaderTextDummy:{},
  tripInfoRow:{flexDirection:"row",gap:8},
  distancePanel:{width:95,alignItems:"center",justifyContent:"center",backgroundColor:"#F6F8FA",borderRadius:14},
  detailLine:{fontSize:12,color:COLORS.text,marginTop:5},
  pinCardSpacing:{marginTop:8},
  cancelReviewOverlay:{position:"absolute",left:0,right:0,top:0,bottom:0,zIndex:49,backgroundColor:"rgba(15,23,42,.42)",justifyContent:"center",padding:16},
  cancelReviewCard:{backgroundColor:"#fff",borderRadius:22,borderWidth:1,borderColor:"#FFD9DD",padding:18,shadowColor:"#0F172A",shadowOpacity:0.12,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:8},
  cancelReviewTitle:{fontSize:19,fontWeight:"900",color:COLORS.text},
  cancelReviewSub:{fontSize:12,color:COLORS.muted,lineHeight:17,marginTop:5,marginBottom:12},
  cancelReasonList:{gap:7,marginBottom:12},
  cancelReasonItem:{minHeight:44,borderWidth:1,borderColor:COLORS.line,borderRadius:13,paddingHorizontal:12,flexDirection:"row",alignItems:"center",backgroundColor:"#fff"},
  cancelReasonItemSelected:{borderColor:"#F4A0AA",backgroundColor:"#FFF6F7"},
  cancelReasonRadio:{width:20,height:20,borderRadius:10,borderWidth:2,borderColor:"#CBD5E1",alignItems:"center",justifyContent:"center",marginRight:10},
  cancelReasonRadioSelected:{borderColor:COLORS.red},
  cancelReasonRadioDot:{width:10,height:10,borderRadius:5,backgroundColor:COLORS.red},
  cancelReasonText:{flex:1,fontSize:12,fontWeight:"700",color:COLORS.text},
  cancelReasonTextSelected:{fontWeight:"900"},
  cancelFeeBox:{marginTop:2,borderWidth:1,borderColor:COLORS.line,borderRadius:14,padding:12,backgroundColor:"#F8FAFC",flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},
  cancelFeeLabel:{fontSize:12,fontWeight:"900",color:COLORS.text},
  cancelFeeValue:{fontSize:17,fontWeight:"900",color:COLORS.red},
  cancelFeePending:{flex:1,fontSize:10,fontWeight:"700",color:COLORS.muted,textAlign:"right"},
  cancelFeeNote:{fontSize:10,color:COLORS.muted,lineHeight:15,marginTop:6,marginBottom:10},

  protectedOtpOverlay:{position:"absolute",left:0,right:0,top:0,bottom:0,zIndex:50,backgroundColor:"rgba(15,23,42,.42)",justifyContent:"center",padding:16},
  protectedOtpCard:{backgroundColor:"#fff",borderRadius:22,borderWidth:1,borderColor:"#FFD9DD",padding:18,shadowColor:"#0F172A",shadowOpacity:0.12,shadowRadius:18,shadowOffset:{width:0,height:8},elevation:8},
  protectedOtpTitle:{fontSize:19,fontWeight:"900",color:COLORS.text},
  protectedOtpSub:{fontSize:12,color:COLORS.muted,lineHeight:17,marginTop:5,marginBottom:7},
  protectedOtpMessage:{fontSize:11,color:COLORS.text,lineHeight:16,marginVertical:7},
  protectedOtpAttempts:{fontSize:13,fontWeight:"900",color:COLORS.red,marginTop:6,marginBottom:4},
  safeNoteRow:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,marginVertical:6},
  pinInput:{borderWidth:1,borderColor:"#FFD0D4",borderRadius:14,backgroundColor:"#fff",paddingHorizontal:12,paddingVertical:11,fontSize:18,letterSpacing:5,textAlign:"center",marginTop:10},
  greenThanksRow:{flexDirection:"row",alignItems:"center",gap:7},
  fieldLabel:{fontSize:12,fontWeight:"800",color:COLORS.text,marginTop:8},
  inlineTitle:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:8},
  authNote:{fontSize:11,lineHeight:17,color:COLORS.muted,textAlign:"center",marginTop:6,marginBottom:8},
  softTile:{flex:1,minHeight:72,borderWidth:1,borderColor:COLORS.line,borderRadius:17,backgroundColor:"#fff",padding:10,flexDirection:"row",alignItems:"center",gap:8},
  softTileIcon:{width:38,height:38,borderRadius:19,backgroundColor:COLORS.softRed,alignItems:"center",justifyContent:"center"},
  stepTrack:{flexDirection:"row",justifyContent:"space-between",gap:6,paddingVertical:10},
  stepNode:{flex:1,alignItems:"center"},
  trackCircle:{width:26,height:26,borderRadius:13,backgroundColor:"#E2E6EC",alignItems:"center",justifyContent:"center"},
  trackCircleActive:{backgroundColor:COLORS.softRed,borderWidth:1,borderColor:COLORS.red},
  trackText:{fontSize:9,color:COLORS.muted,textAlign:"center",marginTop:4},
  notificationBadge:{position:"absolute",top:-2,right:-2,minWidth:18,height:18,borderRadius:9,backgroundColor:COLORS.red,alignItems:"center",justifyContent:"center",paddingHorizontal:3},
  notificationBadgeText:{color:"#fff",fontSize:9,fontWeight:"900"},
  notificationRow:{flexDirection:"row",alignItems:"flex-start",gap:10,padding:13,borderRadius:16,borderWidth:1,borderColor:COLORS.line,backgroundColor:"#fff",marginBottom:7},
  notificationUnread:{borderColor:"#FFD7DB",backgroundColor:"#FFF8F8"},
  notificationIcon:{width:38,height:38,borderRadius:19,backgroundColor:COLORS.softRed,alignItems:"center",justifyContent:"center"},
  notificationTitle:{fontSize:13,fontWeight:"900"},
  notificationBody:{fontSize:11,color:COLORS.text,marginTop:2,lineHeight:16},
  notificationTime:{fontSize:9,color:COLORS.muted,marginTop:5},
  notificationDot:{width:8,height:8,borderRadius:4,backgroundColor:COLORS.red,marginTop:7},
  supportCaseRow:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:11,borderBottomWidth:1,borderBottomColor:COLORS.line},
  supportMessageList:{maxHeight:260,marginTop:7},
  supportMessageBubble:{alignSelf:"flex-start",maxWidth:"86%",padding:10,borderRadius:15,backgroundColor:"#F2F4F7",marginVertical:3},
  supportMessageMine:{alignSelf:"flex-end",backgroundColor:COLORS.softRed},
  supportMessageText:{fontSize:12,color:COLORS.text},
  supportMessageTime:{fontSize:9,color:COLORS.muted,marginTop:3},
  disabledButton:{opacity:0.45},
  disabledText:{color:COLORS.muted}
});
