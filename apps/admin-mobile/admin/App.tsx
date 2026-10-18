import type { AdminScreen } from "../navigation/routes";
import React, { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { startRideXPushLifecycle } from "../shared/notifications/lifecycle";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getSecureToken, setSecureToken, removeSecureToken } from "../shared/security/secureTokenStorage";
import MapView, { Marker, Polyline } from "react-native-maps";
import AssetIcon from "./components/AssetIcon";
import { ADMIN_THEME } from "./shared/theme";
import { createRideXFetch, getRideXApiUrl } from "../shared/api/client";
import { getCachedRideXAssetManifest, syncRideXAssetCache } from "../shared/assets/cache";
import { openRideXEventStream, type RideXStreamEvent } from "../shared/realtime/client";
import RideXMotionSurface, { computeOperationalDriftScore } from "../shared/ui/RideXMotionSurface";
import { OperationsCatalogPanel } from "./panels/OperationsCatalogPanels";
import { RideXButtonPixelLoader } from "../shared/ui/RideXPixelLoader";
import { useRideXLocale, RideXLanguageToggle } from "../shared/localization";

const API = getRideXApiUrl();
const ADMIN_AUTH_TOKEN_KEY = "ridex_admin_auth_token_v1";
const ADMIN_SESSION_KEY = "ridex_admin_session_v1";
const ADMIN_USER_KEY = "ridex_admin_user_v1";
const TEST_MODE = String(process.env.EXPO_PUBLIC_RIDEX_TEST_MODE ?? "false").toLowerCase() === "true";
const ADMIN_LOGIN_PURPOSE = "ADMIN.AUTH.LOGIN";

const WEB_ADMIN_COLORS = {
  bg: "#F5F7FB",
  surface: "#FFFFFF",
  surfaceSoft: "#F8FAFC",
  border: "#E5E9F2",
  borderStrong: "#D7DEEB",
  text: "#172033",
  ink: "#0F172A",
  muted: "#697386",
  muted2: "#94A3B8",
  primary: "#E11D48",
  primaryDark: "#BE123C",
  primarySoft: "#FFF1F2",
  success: "#15803D",
  successSoft: "#ECFDF3",
  warning: "#B45309",
  warningSoft: "#FFF7ED",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  info: "#0369A1",
  infoSoft: "#EFF6FF",
};

const PANEL_META: Record<string, { title: string; subtitle: string; group: string }> = {
  dashboard: { title: "Dashboard", subtitle: "RideX Admin Command Center", group: "Dashboard" },
  live: { title: "Live Operations", subtitle: "Realtime drivers, rides, GPS and SOS context", group: "Operations" },
  matching: { title: "Matching Operations", subtitle: "Current ride and driver eligibility telemetry", group: "Operations" },
  "matching-config": { title: "Matching Configuration", subtitle: "Route, driver, radius, ETA and fallback rules", group: "Operations" },
  drivers: { title: "Drivers / KYC", subtitle: "Driver approval, documents and operational status", group: "Drivers & Vehicles" },
  vehicles: { title: "Vehicles", subtitle: "Vehicle readiness and eligibility", group: "Drivers & Vehicles" },
  vehicleCatalog: { title: "Vehicle Catalog", subtitle: "Authoritative Category 1/2/3 catalog, capacity and eligibility", group: "Drivers & Vehicles" },
  gateway: { title: "Gateway Management", subtitle: "Gateway identity, heartbeat and delivery health", group: "Platform" },
  availability: { title: "Location Availability", subtitle: "Location + vehicle + driver availability for customer visibility", group: "Operations" },
  routes: { title: "Driver Working Routes", subtitle: "Approved driver routes and review lifecycle", group: "Locations & Routes" },
  locations: { title: "Location Master", subtitle: "Reusable city locations, GPS and site evidence", group: "Locations & Routes" },
  "route-builder": { title: "Route Builder", subtitle: "Ordered stops, coverage and route activation", group: "Locations & Routes" },
  customers: { title: "Customers", subtitle: "Customer records and operational history", group: "Rides & Services" },
  bookings: { title: "Bookings", subtitle: "Booking, leg and ride operations", group: "Rides & Services" },
  payments: { title: "Payments", subtitle: "Payment states, refunds and transactions", group: "Finance" },
  finance: { title: "Driver Settlements", subtitle: "Earnings, payouts and settlement visibility", group: "Finance" },
  events: { title: "Events / Sessions", subtitle: "Fixed-stop event ride planning and publish lifecycle", group: "Rides & Services" },
  promotions: { title: "Promotions", subtitle: "Coupons and promotion controls", group: "Finance" },
  pricing: { title: "Pricing", subtitle: "Ride, shared, connecting, parcel, goods and event pricing", group: "Finance" },
  zones: { title: "City Zones", subtitle: "Service areas and connection points", group: "Finance" },
  safety: { title: "Safety / SOS", subtitle: "Safety incidents and emergency operations", group: "Safety & Support" },
  support: { title: "Support", subtitle: "Cases, messages and resolution", group: "Safety & Support" },
  notifications: { title: "Notifications", subtitle: "Customer / Driver broadcasts and alerts", group: "Safety & Support" },
  reports: { title: "Reports & Analytics", subtitle: "Deterministic operational summaries", group: "Reports & Security" },
  admins: { title: "Admin Users", subtitle: "Authorized Admin lifecycle and administration", group: "Reports & Security" },
  roles: { title: "Roles / Permissions", subtitle: "RBAC assignment and access visibility", group: "Reports & Security" },
  audit: { title: "Audit Logs", subtitle: "Security and administrative audit trail", group: "Reports & Security" },
  settings: { title: "Settings / Security", subtitle: "Protected configuration and secure settings", group: "Reports & Security" },
  presence: { title: "Admin Presence", subtitle: "Admin sessions and online/offline status", group: "Reports & Security" },
  "otp-security": { title: "OTP Security", subtitle: "Purpose codes, delivery, attempts, resend and history", group: "Reports & Security" },
  platform: { title: "TEST / LIVE", subtitle: "Release, environment and promotion controls", group: "Platform" },
  "test-data": { title: "TEST Data Lab", subtitle: "Isolated TEST records only", group: "Platform" },
};

const MOBILE_NAV_GROUPS: Array<{ label: string; items: Panel[] }> = [
  { label: "Dashboard", items: ["dashboard"] },
  { label: "Operations", items: ["live", "matching", "matching-config", "availability"] },
  { label: "Rides & Services", items: ["customers", "bookings", "events"] },
  { label: "Drivers & Vehicles", items: ["drivers", "vehicles", "vehicleCatalog"] },
  { label: "Locations & Routes", items: ["locations", "route-builder", "routes"] },
  { label: "Finance", items: ["finance", "payments", "pricing", "promotions", "zones"] },
  { label: "Safety & Support", items: ["safety", "support", "notifications"] },
  { label: "Reports & Security", items: ["reports", "admins", "roles", "audit", "settings", "presence", "otp-security"] },
  { label: "Platform", items: ["platform", "test-data", "gateway"] },
];

type Screen = AdminScreen | "registration";

const ADMIN_REGISTRATION_ROLES = [
  "OPERATIONS",
  "FINANCE",
  "SAFETY",
  "SUPPORT",
  "VERIFICATION_KYC",
] as const;
type Panel = AdminScreen;
type AnyRecord = Record<string, any>;

type Dashboard = {
  role?: string;
  customers?: number;
  drivers?: number;
  activeDrivers?: number;
  bookings?: number;
  completed?: number;
  ongoing?: number;
  cancelled?: number;
  sos?: number;
  vehicles?: number;
  pendingKyc?: number;
  pendingAdmins?: number;
  openSupport?: number;
  payments?: number;
};

const ROLE_PANEL_ACCESS: Record<string, Panel[]> = {
  SUPER_ADMIN: [
    "dashboard", "live", "drivers", "vehicles", "vehicleCatalog", "routes", "availability", "locations", "route-builder", "matching-config", "customers", "bookings",
    "matching", "payments", "finance", "events", "promotions", "pricing", "zones",
    "safety", "support", "notifications", "reports", "admins", "roles", "audit",
    "settings", "platform", "test-data", "otp-security", "presence",
  ],
  OPERATIONS: [
    "dashboard", "live", "drivers", "vehicles", "vehicleCatalog", "routes", "availability", "locations", "route-builder", "matching-config", "customers", "bookings",
    "matching", "events", "zones", "promotions", "notifications", "reports",
  ],
  FINANCE: ["dashboard", "finance", "payments", "pricing", "reports"],
  SAFETY: ["dashboard", "live", "drivers", "customers", "bookings", "safety", "notifications", "reports"],
  SUPPORT: ["dashboard", "customers", "drivers", "bookings", "support", "notifications", "reports"],
  VERIFICATION_KYC: ["dashboard", "drivers", "vehicles", "vehicleCatalog", "customers", "reports"],
};

const PANEL_PERMISSION_MODULE: Partial<Record<Panel, string>> = {
  dashboard: "dashboard",
  live: "drivers",
  drivers: "drivers",
  vehicles: "drivers",
  vehicleCatalog: "drivers",
  gateway: "platform",
  availability: "bookings",
  routes: "drivers",
  locations: "drivers",
  "route-builder": "drivers",
  "matching-config": "bookings",
  customers: "customers",
  bookings: "bookings",
  matching: "bookings",
  payments: "payments",
  finance: "payouts",
  events: "events",
  promotions: "promotions",
  pricing: "pricing",
  zones: "zones",
  safety: "safety",
  support: "support",
  notifications: "notifications",
  reports: "reports",
  admins: "admins",
  roles: "roles",
  audit: "audit",
  settings: "settings",
  platform: "platform",
  "test-data": "test-data",
  "otp-security": "security",
  presence: "adminPresence",
};

const adminFetch = createRideXFetch({ tokenKey: ADMIN_AUTH_TOKEN_KEY, apiUrl: API });

function apiPath(path: string) {
  return `${API}/${path.replace(/^\/+/, "")}`;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

function cleanError(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

function extractAdminRecords(body: AnyRecord): AnyRecord[] {
  const data = body?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.admins)) return data.admins;
  if (Array.isArray(data?.drivers)) return data.drivers;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function Button({ title, onPress, secondary = false, danger = false, disabled = false, loading = false }: { title: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      style={[styles.button, secondary && styles.buttonSecondary, danger && styles.buttonDanger, (disabled || loading) && styles.disabled]}
      onPress={onPress}
    >
      {loading ? <RideXButtonPixelLoader /> : <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text>}
    </Pressable>
  );
}

function AdminBrandLogo({ large = false, small = false, compact = false }: { large?: boolean; small?: boolean; compact?: boolean }) {
  return <View style={[styles.adminBrandLogo, large && styles.adminBrandLogoLarge, small && styles.adminBrandLogoSmall, compact && styles.adminBrandLogoCompact]}><Text style={styles.adminBrandRide}>Ride</Text><Text style={styles.adminBrandX}>X</Text></View>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType = "default", multiline = false, secureTextEntry = false, autoCapitalize = "sentences" }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: any; multiline?: boolean; secureTextEntry?: boolean; autoCapitalize?: "none" | "sentences" | "words" | "characters" }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8b96a8"
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

function StatCard({ label, value, tone = "green" }: { label: string; value: number | undefined; tone?: "green" | "blue" | "orange" | "red" }) {
  const displayValue = typeof value === "number" && Number.isFinite(value) ? value : "—";
  return <View style={[styles.statCard, tone === "blue" && styles.blue, tone === "orange" && styles.orange, tone === "red" && styles.red]}><Text style={styles.statValue}>{displayValue}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function ModuleCard({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return <Pressable style={styles.moduleCard} onPress={onPress}><View style={styles.moduleIcon}><AssetIcon name={icon} size={24} /></View><View style={{ flex: 1 }}><Text style={styles.moduleTitle}>{title}</Text><Text style={styles.moduleSubtitle}>{subtitle}</Text></View><AssetIcon name="chevron_right" size={18} /></Pressable>;
}

function RowCard({ item, onPress }: { item: AnyRecord; onPress?: () => void }) {
  const title = String(item.fullName || item.name || item.code || item.subject || item.id || "Record");
  const subtitle = [item.id, item.status, item.driverStatus, item.verificationStatus, item.paymentStatus, item.createdAt].filter(Boolean).join(" • ");
  const body = Object.entries(item).filter(([k]) => !["id", "createdAt", "updatedAt"].includes(k)).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v).slice(0, 90) : String(v)}`).join("\n");
  return <Pressable style={styles.rowCard} onPress={onPress}><Text style={styles.rowTitle}>{title}</Text>{subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}{body ? <Text style={styles.rowBody}>{body}</Text> : null}</Pressable>;
}

export default function AdminApp({ onBackToCustomer }: { onBackToCustomer?: () => void } = {}) {
  const { t } = useRideXLocale();
  const [screen, setScreen] = useState<Screen>("login");
  const [panel, setPanel] = useState<Panel>("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpResendAfterSeconds, setOtpResendAfterSeconds] = useState(0);

  // Self-registration (account remains PENDING until approved).
  const [registrationName, setRegistrationName] = useState("");
  const [registrationMobile, setRegistrationMobile] = useState("");
  const [registrationEmail, setRegistrationEmail] = useState("");
  const [registrationRole, setRegistrationRole] = useState<(typeof ADMIN_REGISTRATION_ROLES)[number]>("OPERATIONS");
  const [registrationWorkingLocation, setRegistrationWorkingLocation] = useState("");
  const [registrationDepartment, setRegistrationDepartment] = useState("");
  const [registrationOperatingRegion, setRegistrationOperatingRegion] = useState("");
  const [registrationWorkAddress, setRegistrationWorkAddress] = useState("");
  const [registrationAccessReason, setRegistrationAccessReason] = useState("");
  const [registrationOtp, setRegistrationOtp] = useState("");
  const [registrationOtpSent, setRegistrationOtpSent] = useState(false);
  const [registrationOtpResendAfterSeconds, setRegistrationOtpResendAfterSeconds] = useState(0);
  const [otpAttemptsRemaining, setOtpAttemptsRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [adminName, setAdminName] = useState("RideX Admin");
  const [adminId, setAdminId] = useState("");

  useEffect(() => {
    let active = true;
    if (!adminId) return () => { active = false; };
    void (async () => {
      await getCachedRideXAssetManifest("ADMIN", "SHARED", adminId);
      try {
        const token = String(await getSecureToken(ADMIN_AUTH_TOKEN_KEY) || "");
        await syncRideXAssetCache("ADMIN", "SHARED", adminId, adminFetch, token);
      } catch (error) {
        if (active) console.warn("ADMIN ASSET CACHE SYNC:", error);
      }
    })();
    return () => { active = false; };
  }, [adminId]);

  // Admin push lifecycle: refresh/touch the registered device after authentication and on app resume.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    if (adminId) {
      void getSecureToken(ADMIN_AUTH_TOKEN_KEY).then((token) => {
        if (cancelled || !token) return;
        stop = startRideXPushLifecycle({ api: API, authToken: token, appVersion: String(process.env.EXPO_PUBLIC_APP_VERSION ?? ''), deviceName: `RideX Admin ${adminId}` });
      });
    }
    return () => { cancelled = true; stop?.(); };
  }, [adminId]);
  const [adminRole, setAdminRole] = useState("OPERATIONS");
  const [adminLevel, setAdminLevel] = useState("");
  const [adminStateId, setAdminStateId] = useState("");
  const [adminCityId, setAdminCityId] = useState("");
  const [adminPermissions, setAdminPermissions] = useState<Array<{ id: string; module: string; action: string }>>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [records, setRecords] = useState<AnyRecord[]>([]);
  const [selected, setSelected] = useState<AnyRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [presenceRecords, setPresenceRecords] = useState<AnyRecord[]>([]);

  const [broadcastAudience, setBroadcastAudience] = useState("ALL");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");

  const [promotion, setPromotion] = useState({ code: "", description: "", discountType: "FIXED", discountValue: "", maxDiscount: "", minFare: "", validFrom: "", validUntil: "", rideScope: "ALL" });
  const [eventForm, setEventForm] = useState({ id: "", name: "", description: "", startsAt: "", endsAt: "", stopsJson: "", sessionsJson: "" });
  const [pricing, setPricing] = useState({ name: "", serviceType: "", bookingType: "", rideType: "", vehicleType: "", baseFare: "", perKm: "", perMinute: "", waitingPerMinute: "", weightPerKg: "", multiplier: "1", minFare: "", maxFare: "", priority: "0" });
  const [zone, setZone] = useState({ name: "", city: "", centerLat: "", centerLng: "", radiusKm: "", connectionPoint: "true" });
  const [adminForm, setAdminForm] = useState({ name: "", mobile: "", email: "", role: "OPERATIONS", workingLocation: "", department: "", operatingRegion: "", workAddress: "", accessReason: "" });
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [configStatus, setConfigStatus] = useState<AnyRecord[]>([]);
  const [otpConfigs, setOtpConfigs] = useState<AnyRecord[]>([]);
  const [otpSelectedPurpose, setOtpSelectedPurpose] = useState("");
  const [otpHistory, setOtpHistory] = useState<AnyRecord[]>([]);
  const [otpDraft, setOtpDraft] = useState<AnyRecord>({ purposeCode: "", purposeCategory: "AUTH", deliveryMethod: "PROVIDER_OTP", expirySeconds: "300", wrongAttemptLimit: "5", resendIntervalSeconds: "60", maximumResends: "5", cooldownSeconds: "300", notificationRetryCount: "3", notificationRetryIntervalSeconds: "30", active: true });
  const [otpCreateForm, setOtpCreateForm] = useState<AnyRecord>({ purposeCode: "", purposeCategory: "AUTH", deliveryMethod: "PROVIDER_OTP" });
  const [otpDeleteConfirmation, setOtpDeleteConfirmation] = useState("");
  const [routeDriverId, setRouteDriverId] = useState("");
  const [routeRecords, setRouteRecords] = useState<AnyRecord[]>([]);
  const [routeMeta, setRouteMeta] = useState<AnyRecord | null>(null);
  const [routeForm, setRouteForm] = useState<AnyRecord>({ name: "", sequence: "", startLat: "", startLng: "", endLat: "", endLng: "", active: true });
  const [locationCity, setLocationCity] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationType, setLocationType] = useState("LANDMARK");
  const [locationZone, setLocationZone] = useState("");
  const [locationPickupRadiusM, setLocationPickupRadiusM] = useState("300");
  const [locationDropRadiusM, setLocationDropRadiusM] = useState("500");
  const [locationPickupAllowed, setLocationPickupAllowed] = useState(true);
  const [locationDropAllowed, setLocationDropAllowed] = useState(true);
  const [locationPhotoUri, setLocationPhotoUri] = useState("");
  const [locationCoordinate, setLocationCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationRecords, setLocationRecords] = useState<AnyRecord[]>([]);
  const [locationSearch, setLocationSearch] = useState("");
  const [routeBuilderCity, setRouteBuilderCity] = useState("");
  const [routeBuilderName, setRouteBuilderName] = useState("");
  const [routeBuilderServiceType, setRouteBuilderServiceType] = useState("PASSENGER");
  const [routeBuilderVehicleType, setRouteBuilderVehicleType] = useState("E_RICKSHAW");
  const [routeBuilderMode, setRouteBuilderMode] = useState("HYBRID");
  const [routeBuilderCoverageZones, setRouteBuilderCoverageZones] = useState("");
  const [routeBuilderLocationSearch, setRouteBuilderLocationSearch] = useState("");
  const [routeBuilderStartId, setRouteBuilderStartId] = useState("");
  const [routeBuilderEndId, setRouteBuilderEndId] = useState("");
  const [routeBuilderStopIds, setRouteBuilderStopIds] = useState<string[]>([]);
  const [routeBuilderDriverIds, setRouteBuilderDriverIds] = useState<string[]>([]);
  const [routeBuilderLocations, setRouteBuilderLocations] = useState<AnyRecord[]>([]);
  const [routeBuilderDrivers, setRouteBuilderDrivers] = useState<AnyRecord[]>([]);
  const [routeBuilderRecords, setRouteBuilderRecords] = useState<AnyRecord[]>([]);
  const [routeBuilderRules, setRouteBuilderRules] = useState({ pickupRadiusM: "300", dropRadiusM: "500", maxPickupDistanceKm: "5", maxDetourKm: "3", maxEtaMinutes: "12", gpsFreshnessSeconds: "60", offerTimeoutSeconds: "300", retryCount: "2" });
  const [matchingConfig, setMatchingConfig] = useState({ mode: "HYBRID", pickupRadiusM: "300", dropRadiusM: "500", maxPickupDistanceKm: "5", maxDetourKm: "3", maxEtaMinutes: "12", gpsFreshnessSeconds: "60", offerTimeoutSeconds: "300", retryCount: "2", fallbackEnabled: true, onlineOnly: true, preferExactRoute: true });
  const [matchingConfigService, setMatchingConfigService] = useState("DEFAULT");
  const [releaseForm, setReleaseForm] = useState({ version: "", sourceLabel: "", checksum: "", notes: "", releaseId: "", testerMobile: "", passed: "0", failed: "0", errors: "0" });
  const [mergeForm, setMergeForm] = useState({ name: "Manual data merge", sourceScope: "HISTORICAL_CURRENT", sourceQuery: "", derivativeData: "", id: "", approved: "true" });
  const [confirmation, setConfirmation] = useState("");
  const [testEntity, setTestEntity] = useState("bookings");
  const [testId, setTestId] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeEvents, setRealtimeEvents] = useState<RideXStreamEvent[]>([]);
  const realtimeCleanupRef = React.useRef<(() => void) | null>(null);

  useEffect(() => { void restoreAdminSession(); }, []);

  useEffect(() => {
    if (screen !== "dashboard") return;
    void loadDashboard();
  }, [screen]);

  useEffect(() => {
    if (screen !== "dashboard") return;
    const timer = setInterval(() => { void loadDashboard(); }, 15000);
    return () => clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== "otp" || otpResendAfterSeconds <= 0) return;
    const timer = setTimeout(() => {
      setOtpResendAfterSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [screen, otpResendAfterSeconds]);

  useEffect(() => {
    if (screen !== "registration" || !registrationOtpSent || registrationOtpResendAfterSeconds <= 0) return;
    const timer = setTimeout(() => {
      setRegistrationOtpResendAfterSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [screen, registrationOtpSent, registrationOtpResendAfterSeconds]);

  useEffect(() => {
    if (!adminId) {
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
      setRealtimeConnected(false);
      return;
    }

    let stopped = false;

    const connect = async () => {
      if (stopped) return;
      const token = await getSecureToken(ADMIN_AUTH_TOKEN_KEY);
      if (!token || stopped) return;

      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = openRideXEventStream({
        url: `${API}/realtime/stream?actorType=ADMIN&actorId=${encodeURIComponent(adminId)}`,
        headers: { Authorization: `Bearer ${token}` },
        heartbeatTimeoutMs: 65000,
        reconnect: true,
        lastEventIdStorageKey: `ridex_realtime_cursor_admin_v1:${adminId}`,
        onOpen: () => setRealtimeConnected(true),
        onClose: () => setRealtimeConnected(false),
        onError: () => setRealtimeConnected(false),
        onReplayGap: () => {
          if (!stopped) {
            void loadDashboard();
            if (panel === "live") void loadLiveData(setRecords, setMessage);
          }
        },
        onEvent: (event) => {
          setRealtimeEvents((current) => [event, ...current].slice(0, 50));
          const type = String(event.type || "").toUpperCase();
          if (["DRIVER_ONLINE", "DRIVER_OFFLINE", "GPS_UPDATED", "REQUEST_CREATED", "REQUEST_ACCEPTED", "REQUEST_EXPIRED", "DRIVER_ARRIVING", "DRIVER_ARRIVED", "OTP_VERIFIED", "TRIP_STARTED", "TRIP_PROGRESS", "ROUTE_CHANGED", "SOS_TRIGGERED", "TRIP_COMPLETED", "PAYMENT_COMPLETED"].includes(type)) {
            void loadDashboard();
            if (panel === "live") void loadLiveData(setRecords, setMessage);
          }
        },
      });
    };

    void connect();
    return () => {
      stopped = true;
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
      setRealtimeConnected(false);
    };
  }, [adminId]);

  function hasPanelAccess(targetPanel: Panel): boolean {
    const role = String(adminRole || "").trim().toUpperCase();
    if (role === "SUPER_ADMIN") return true;
    const allowed = ROLE_PANEL_ACCESS[role];
    if (!allowed || !allowed.includes(targetPanel)) return false;
    const moduleName = PANEL_PERMISSION_MODULE[targetPanel];
    if (!moduleName) return false;
    if (!Array.isArray(adminPermissions) || adminPermissions.length === 0) return false;
    const normalizedModule = moduleName.toLowerCase();
    return adminPermissions.some((permission) => {
      const module = String(permission.module || "").trim().toLowerCase();
      const action = String(permission.action || "").trim().toUpperCase();
      return module === normalizedModule && ["VIEW", "READ", "LIST"].includes(action);
    });
  }

  async function loadAdminContext() {
    const response = await adminFetch(apiPath("admin/me"));
    const body: AnyRecord = await readJson(response);
    if (!response.ok || body?.success === false) {
      if (response.status === 401 || response.status === 403) {
        await forceLogout(body?.message || "Admin authorization is no longer valid.");
      }
      throw new Error(body?.message || "Unable to load Admin access context");
    }
    const data = body?.data ?? {};
    console.log("RIDEX ADMIN CONTEXT", {
      adminId: data?.adminId ?? null,
      role: data?.role ?? null,
      approvalStatus: data?.approvalStatus ?? null,
      permissionCount: Array.isArray(data?.permissions) ? data.permissions.length : 0,
      adminLevel: data?.adminLevel ?? null,
      stateId: data?.stateId ?? null,
      cityId: data?.cityId ?? null,
    });
    setAdminId(String(data.adminId || ""));
    setAdminName(String(data.name || "RideX Admin"));
    setAdminRole(String(data.role || "OPERATIONS").toUpperCase());
    setAdminLevel(String(data.adminLevel || "GLOBAL").toUpperCase());
    setAdminStateId(String(data.stateId || ""));
    setAdminCityId(String(data.cityId || ""));
    setAdminPermissions(Array.isArray(data.permissions) ? data.permissions.map((item: AnyRecord) => ({
      id: String(item.id || ""),
      module: String(item.module || ""),
      action: String(item.action || ""),
    })) : []);
    return data;
  }

  async function restoreAdminSession() {
    try {
      const [token, userRaw, sessionRaw] = await Promise.all([
        getSecureToken(ADMIN_AUTH_TOKEN_KEY),
        AsyncStorage.getItem(ADMIN_USER_KEY),
        AsyncStorage.getItem(ADMIN_SESSION_KEY),
      ]);
      if (!token || !userRaw) return;
      void sessionRaw;
      await loadAdminContext();
      setScreen("dashboard");
      setPanel("dashboard");
      await loadDashboard();
    } catch (error) {
      console.error("ADMIN SESSION RESTORE ERROR", error);
      await removeSecureToken(ADMIN_AUTH_TOKEN_KEY);
      await AsyncStorage.multiRemove([ADMIN_SESSION_KEY, ADMIN_USER_KEY, "ridex_admin_pending_otp_actor_v1"]);
    }
  }

  async function requestAdminRegistrationOtp() {
    const normalized = registrationMobile.replace(/\D/g, "").slice(-10);
    setRegistrationMobile(normalized);
    setRegistrationOtp("");
    setMessage("");

    if (!/^\d{10}$/.test(normalized)) {
      setMessage("Enter a valid 10-digit admin mobile number.");
      return;
    }
    if (!registrationName.trim()) {
      setMessage("Admin name is required before requesting OTP.");
      return;
    }

    setLoading(true);
    try {
      const response = await adminFetch(apiPath("auth/send-otp"), {
        method: "POST",
        body: JSON.stringify({
          actorType: "ADMIN",
          actorId: normalized,
          purposeCode: "ADMIN.AUTH.REGISTRATION",
          mobile: normalized,
        }),
      });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) {
        throw new Error(body?.message || "Unable to send admin registration OTP");
      }
      setRegistrationOtpSent(true);
      setRegistrationOtpResendAfterSeconds(Math.max(0, Number(body?.resendAfterSeconds ?? 60) || 60));
      setMessage("Registration OTP sent successfully.");
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function resendAdminRegistrationOtp() {
    const normalized = registrationMobile.replace(/\D/g, "").slice(-10);
    setRegistrationMobile(normalized);
    if (!/^\d{10}$/.test(normalized)) {
      setMessage("Enter a valid 10-digit admin mobile number first.");
      return;
    }
    if (registrationOtpResendAfterSeconds > 0) {
      setMessage(`Please wait ${registrationOtpResendAfterSeconds}s before requesting another resend.`);
      return;
    }

    setLoading(true);
    try {
      const response = await adminFetch(apiPath("auth/resend-otp"), {
        method: "POST",
        body: JSON.stringify({
          actorType: "ADMIN",
          actorId: normalized,
          purposeCode: "ADMIN.AUTH.REGISTRATION",
          mobile: normalized,
        }),
      });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) {
        const retryAfter = Number(body?.retryAfterSeconds);
        if (Number.isFinite(retryAfter) && retryAfter > 0) setRegistrationOtpResendAfterSeconds(retryAfter);
        throw new Error(body?.message || "Unable to resend admin registration OTP");
      }
      setRegistrationOtpResendAfterSeconds(Math.max(0, Number(body?.resendAfterSeconds ?? 60) || 60));
      setMessage("Registration OTP resent successfully.");
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function completeAdminRegistration() {
    setMessage("Admin self-registration is not supported by the locked backend. Ask an authorized Admin/Super Admin to provision the account.");
  }

  async function requestOtp() {
    const identifier = loginIdentifier.trim();
    const password = loginPassword;
    setLoginIdentifier(identifier);
    setOtp("");
    setOtpAttemptsRemaining(null);
    setMessage("");

    if (!identifier) {
      setMessage("Enter your Admin User ID, Gmail/Email, or mobile number.");
      return;
    }
    if (!password) {
      setMessage("Enter your Admin password.");
      return;
    }

    setLoading(true);
    try {
      const response = await adminFetch(apiPath("auth/password/login"), {
        method: "POST",
        body: JSON.stringify({ actorType: "ADMIN", identifier, password }),
      });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) {
        throw new Error(body?.message || "Unable to start Admin login");
      }
      const data = body?.data ?? {};

      if (data?.requiresOtp) {
        const actorId = String(data?.actorId || "").trim();
        if (!/^\d{10}$/.test(actorId)) {
          throw new Error("Admin new-device verification could not be started safely.");
        }
        await AsyncStorage.setItem("ridex_admin_pending_otp_actor_v1", actorId);
        setOtp("");
        setOtpResendAfterSeconds(Math.max(0, Number(data?.resendAfterSeconds ?? 0) || 0));
        setOtpAttemptsRemaining(Number.isFinite(Number(data?.attemptsRemaining)) ? Number(data.attemptsRemaining) : null);
        setScreen("otp");
        setMessage("A new-device OTP is required before Admin access can continue.");
        return;
      }

      await completeAdminAuthenticatedSession(data, identifier);
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function completeAdminAuthenticatedSession(data: AnyRecord, identifier: string) {
    if (!data?.token || !data?.adminId) {
      throw new Error("Authentication succeeded but the Admin session was incomplete.");
    }
    const user = {
      userId: data.userId,
      adminId: data.adminId,
      userType: data.userType,
      identifier,
      mobile: data.mobile,
      name: data.name || "RideX Admin",
    };
    await setSecureToken(ADMIN_AUTH_TOKEN_KEY, String(data.token));
    await AsyncStorage.multiSet([
      [ADMIN_SESSION_KEY, JSON.stringify(data.session ?? null)],
      [ADMIN_USER_KEY, JSON.stringify(user)],
    ]);
    await AsyncStorage.removeItem("ridex_admin_pending_otp_actor_v1");
    setAdminId(String(data.adminId));
    setAdminName(String(data.name || "RideX Admin"));
    setOtp("");
    setOtpAttemptsRemaining(null);
    setOtpResendAfterSeconds(0);
    await loadAdminContext();
    setScreen("dashboard");
    setPanel("dashboard");
    await loadDashboard();
  }

  async function resendAdminOtp() {
    let actorId = "";
    try { actorId = String(await AsyncStorage.getItem("ridex_admin_pending_otp_actor_v1") || "").trim(); } catch {}
    if (!/^\d{10}$/.test(actorId)) {
      setMessage("Admin new-device OTP session is not available. Please start login again.");
      return;
    }
    if (otpResendAfterSeconds > 0) {
      setMessage(`Please wait ${otpResendAfterSeconds}s before requesting another resend.`);
      return;
    }

    setLoading(true);
    try {
      const response = await adminFetch(apiPath("auth/resend-otp"), {
        method: "POST",
        body: JSON.stringify({ actorType: "ADMIN", actorId, purposeCode: "ADMIN.AUTH.NEW_DEVICE" }),
      });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) {
        const retryAfter = Number(body?.retryAfterSeconds ?? body?.resendAfterSeconds ?? 0);
        if (Number.isFinite(retryAfter) && retryAfter > 0) setOtpResendAfterSeconds(Math.floor(retryAfter));
        throw new Error(body?.message || "Unable to resend Admin OTP");
      }
      setOtpResendAfterSeconds(Math.max(0, Number(body?.resendAfterSeconds ?? 60) || 60));
      setOtpAttemptsRemaining(Number.isFinite(Number(body?.attemptsRemaining)) ? Number(body.attemptsRemaining) : otpAttemptsRemaining);
      setMessage("Admin new-device OTP resent successfully.");
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    const normalizedOtp = otp.replace(/\D/g, "").slice(0, 4);
    if (!/^\d{4}$/.test(normalizedOtp)) {
      setMessage("Enter the 4-digit Admin new-device OTP.");
      return;
    }
    let actorId = "";
    try { actorId = String(await AsyncStorage.getItem("ridex_admin_pending_otp_actor_v1") || "").trim(); } catch {}
    if (!/^\d{10}$/.test(actorId)) {
      setMessage("Admin new-device OTP session is not available. Please start login again.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await adminFetch(apiPath("auth/verify-otp"), {
        method: "POST",
        body: JSON.stringify({ actorType: "ADMIN", actorId, purposeCode: "ADMIN.AUTH.NEW_DEVICE", otp: normalizedOtp }),
      });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false || !body?.data?.token || !body?.data?.adminId) {
        if (body?.attemptsRemaining !== undefined) {
          const remaining = Number(body.attemptsRemaining);
          setOtpAttemptsRemaining(Number.isFinite(remaining) ? remaining : null);
        }
        throw new Error(body?.message || "Admin new-device OTP verification failed");
      }
      await completeAdminAuthenticatedSession(body.data, loginIdentifier.trim());
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    try {
      const response = await adminFetch(apiPath("admin/dashboard"));
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message); return; }
      if (response.status === 403) { setMessage(body?.message || "Admin permission denied for this tool."); return; }
      if (!response.ok || body?.success === false) {
        throw new Error(body?.message || `Dashboard request failed (HTTP ${response.status})`);
      }
      console.log("RIDEX ADMIN DASHBOARD FETCH", { status: response.status, data: body?.data ?? null });
      setDashboard(body.data || null);
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function forceLogout(reason = "Session expired") {
    await removeSecureToken(ADMIN_AUTH_TOKEN_KEY);
      await AsyncStorage.multiRemove([ADMIN_SESSION_KEY, ADMIN_USER_KEY, "ridex_admin_pending_otp_actor_v1"]);
    setScreen("login"); setPanel("dashboard"); setDashboard(null); setAdminId(""); setMessage(reason);
  }

  async function logout() {
    try { await adminFetch(apiPath("auth/logout"), { method: "POST" }); } catch {}
    await forceLogout("Signed out.");
    setOtp("");
  }

  async function loadPresence() {
    if (!hasPanelAccess("presence")) {
      setMessage("Admin Presence is available to Super Admin only.");
      return;
    }
    try {
      setLoading(true);
      const response = await adminFetch(apiPath("admin/admin-presence"));
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message); return; }
      if (response.status === 403) { setMessage(body?.message || "Super Admin access required"); return; }
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to load Admin presence");
      setPresenceRecords(Array.isArray(body?.data) ? body.data : []);
      setPanel("presence");
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function revokePresenceSession(sessionId: string) {
    if (!sessionId) return;
    try {
      setLoading(true);
      const response = await adminFetch(apiPath(`admin/admin-presence/sessions/${encodeURIComponent(sessionId)}`), {
        method: "DELETE",
        body: JSON.stringify({ confirmation: "REVOKE SESSION" }),
      });
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message); return; }
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to revoke Admin session");
      setMessage("Admin session revoked.");
      await loadPresence();
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function revokeAllAdminSessions(targetAdminId: string) {
    if (!targetAdminId) return;
    try {
      setLoading(true);
      const response = await adminFetch(apiPath(`admin/admin-presence/admins/${encodeURIComponent(targetAdminId)}/revoke-all`), {
        method: "POST",
        body: JSON.stringify({ confirmation: "REVOKE ALL SESSIONS" }),
      });
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message); return; }
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to revoke Admin sessions");
      setMessage(`Revoked ${Number(body?.data?.revokedSessionCount ?? 0)} session(s).`);
      await loadPresence();
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function loadRecords(path: string, nextPanel: Panel, label: string) {
    setLoading(true); setMessage(""); setSelected(null);
    try {
      const suffix = statusFilter ? `${path}${path.includes("?") ? "&" : "?"}status=${encodeURIComponent(statusFilter)}` : path;
      const response = await adminFetch(apiPath(`admin${suffix}`));
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message); return; }
      if (response.status === 403) { setMessage(body?.message || "Admin permission denied for this tool."); return; }
      if (!response.ok || body?.success === false) {
        throw new Error(body?.message || `${label} request failed (HTTP ${response.status})`);
      }
      const nextRecords = extractAdminRecords(body);
      console.log(`RIDEX ADMIN ${label.toUpperCase()} FETCH`, {
        status: response.status,
        count: nextRecords.length,
      });
      setRecords(nextRecords);
      if (nextPanel === "roles") {
        const nextPermissions: Record<string, string[]> = {};
        nextRecords.forEach((role: AnyRecord) => {
          const id = String(role.id || "");
          nextPermissions[id] = Array.isArray(role.permissionLinks)
            ? role.permissionLinks.map((link: AnyRecord) => String(link.permission?.id || link.permissionId || "")).filter(Boolean)
            : [];
        });
        setRolePermissions(nextPermissions);
      }
      setPanel(nextPanel);
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function openModule(nextPanel: Panel) {
    setStatusFilter("");
    if (!hasPanelAccess(nextPanel)) {
      setMessage("This Admin tool is not assigned to your role/permissions.");
      return;
    }
    if (nextPanel === "presence") {
      await loadPresence();
      return;
    }
    const map: Record<string, { path: string; label: string } | undefined> = {
      finance: { path: "/payouts/settlements", label: "Finance / Settlements" },
      drivers: { path: "/drivers", label: "Drivers" },
      events: { path: "/events", label: "Events / Sessions" },
      customers: { path: "/customers", label: "Customers" },
      bookings: { path: "/bookings", label: "Bookings" },
      payments: { path: "/payments", label: "Payments" },
      support: { path: "/support/cases", label: "Support" },
      safety: { path: "/safety/sos", label: "Safety / SOS" },
      notifications: undefined,
      promotions: { path: "/promotions", label: "Promotions" },
      pricing: undefined,
      zones: undefined,
      admins: { path: "/admins", label: "Admin Users" },
      roles: { path: "/roles", label: "Roles" },
      audit: { path: "/audit-logs", label: "Audit Logs" },
      platform: undefined,
      settings: undefined,
      "test-data": undefined,
      matching: { path: "/bookings", label: "Matching / Eligibility" },
      vehicles: { path: "/drivers", label: "Vehicles" },
      routes: undefined,
      locations: undefined,
      "route-builder": undefined,
      "matching-config": undefined,
      reports: undefined,
      "otp-security": undefined,
    };
    const target = map[nextPanel];
    if (!target) {
      if (nextPanel === "pricing" || nextPanel === "zones") { await loadPlatformData(nextPanel); return; }
      if (nextPanel === "settings") { await loadPlatformData("settings"); return; }
      if (nextPanel === "platform") { await loadPlatformData("platform"); return; }
      if (nextPanel === "test-data") { await loadTestData(); return; }
      if (nextPanel === "reports") { await loadReports(); return; }
      if (nextPanel === "otp-security") { await loadOtpConfigurations(); return; }
      if (nextPanel === "routes") { setPanel(nextPanel); return; }
      if (nextPanel === "locations") { await loadLocationMaster(); return; }
      if (nextPanel === "route-builder") { await loadRouteBuilder(); return; }
      if (nextPanel === "matching-config") { await loadMatchingConfiguration(); return; }
      setPanel(nextPanel);
      return;
    }
    await loadRecords(target.path, nextPanel, target.label);
  }

  async function refresh() {
    setRefreshing(true);
    if (panel === "dashboard" || screen === "dashboard") await loadDashboard();
    else {
      if (panel === "presence") { await loadPresence(); setRefreshing(false); return; }
      const map: Record<string, string | undefined> = { locations: undefined, "route-builder": undefined, "matching-config": undefined, finance: "/payouts/settlements", drivers: "/drivers", events: "/events", customers: "/customers", bookings: "/bookings", payments: "/payments", support: "/support/cases", safety: "/safety/sos", promotions: "/promotions", admins: "/admins", roles: "/roles", audit: "/audit-logs" };
      if (panel === "locations") await loadLocationMaster();
      else if (panel === "route-builder") await loadRouteBuilder();
      else if (panel === "matching-config") await loadMatchingConfiguration();
      else if (map[panel]) await loadRecords(map[panel]!, panel, panel);
    }
    setRefreshing(false);
  }

  function parseEventJsonArray(value: string, label: string): any[] {
    try {
      const parsed = JSON.parse(value || "[]");
      if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
      return parsed;
    } catch (error) {
      throw new Error(`${label} must be valid JSON array: ${cleanError(error)}`);
    }
  }

  async function createOrUpdateEvent() {
    try {
      setLoading(true);
      if (!eventForm.name.trim()) throw new Error("Event name is required");
      if (eventForm.id) {
        const response = await adminFetch(apiPath(`admin/events/${encodeURIComponent(eventForm.id)}`), {
          method: "PATCH",
          body: JSON.stringify({
            name: eventForm.name.trim(),
            description: eventForm.description.trim() || null,
            startsAt: eventForm.startsAt.trim() || null,
            endsAt: eventForm.endsAt.trim() || null,
          }),
        });
        const data = await readJson(response);
        if (!response.ok || data?.success === false) throw new Error(data?.message || "Unable to update event");
        Alert.alert("Event updated", "Draft event details updated.");
      } else {
        const stops = parseEventJsonArray(eventForm.stopsJson, "Stops");
        const sessions = parseEventJsonArray(eventForm.sessionsJson, "Sessions");
        if (stops.length < 6 || stops.length > 10) throw new Error("Event requires 6 to 10 stops.");
        if (sessions.length < 1) throw new Error("At least one event session is required.");
        const response = await adminFetch(apiPath("admin/events"), {
          method: "POST",
          body: JSON.stringify({
            name: eventForm.name.trim(),
            description: eventForm.description.trim() || null,
            startsAt: eventForm.startsAt.trim() || null,
            endsAt: eventForm.endsAt.trim() || null,
            stops,
            sessions,
          }),
        });
        const data = await readJson(response);
        if (!response.ok || data?.success === false) throw new Error(data?.message || "Unable to create event");
        const created = data?.data || {};
        setEventForm({ id: String(created.id || ""), name: String(created.name || created.title || eventForm.name), description: String(created.description || eventForm.description), startsAt: String(created.startsAt || ""), endsAt: String(created.endsAt || ""), stopsJson: JSON.stringify(created.stops || stops, null, 2), sessionsJson: JSON.stringify(created.sessions || sessions, null, 2) });
        Alert.alert("Event created", "Event is saved as draft. Publish it after validation.");
      }
      await loadRecords("/events", "events", "Events / Sessions");
    } catch (error) {
      Alert.alert("Event / Session", cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function eventAction(eventId: string, action: "publish" | "unpublish" | "delete") {
    try {
      setLoading(true);
      const method = action === "delete" ? "DELETE" : "POST";
      const targetPath = action === "delete"
        ? `admin/events/${encodeURIComponent(eventId)}`
        : `admin/events/${encodeURIComponent(eventId)}/${action}`;
      const response = await adminFetch(apiPath(targetPath), { method });
      const data = await readJson(response);
      if (!response.ok || data?.success === false) throw new Error(data?.message || `Unable to ${action} event`);
      Alert.alert("Event action", `${action.toUpperCase()} completed.`);
      if (eventForm.id === eventId) setEventForm((current) => action === "delete" ? { id: "", name: "", description: "", startsAt: "", endsAt: "", stopsJson: "", sessionsJson: "" } : current);
      await loadRecords("/events", "events", "Events / Sessions");
    } catch (error) {
      Alert.alert("Event action", cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function updateDriver(id: string, mode: "verify" | "status", value: string) {
    try {
      const path = mode === "verify" ? `admin/drivers/${encodeURIComponent(id)}/verification` : `admin/drivers/${encodeURIComponent(id)}/status`;
      const body = mode === "verify" ? { verificationStatus: value } : { status: value, ...(value === "SUSPENDED" ? { confirmation: "SUSPEND DRIVER" } : {}) };
      const response = await adminFetch(apiPath(path), { method: "PATCH", body: JSON.stringify(body) });
      const data: AnyRecord = await readJson(response);
      if (!response.ok || data?.success === false) throw new Error(data?.message || "Driver update failed");
      Alert.alert("Driver updated", data?.message || "Driver status updated.");
      await openModule("drivers");
    } catch (error) { Alert.alert("Driver update", cleanError(error)); }
  }

  async function openDriverActions(driver: AnyRecord) {
    setLoading(true);
    try {
      const response = await adminFetch(apiPath(`admin/drivers/${encodeURIComponent(String(driver.id))}`));
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to load driver");
      const detail = body?.data || driver;
      setSelected(detail);
      const docs = Array.isArray(detail.documents) ? detail.documents : [];
      const vehicles = Array.isArray(detail.vehicles) ? detail.vehicles : [];
      const actions: any[] = [
        { text: "Approve Driver", onPress: () => updateDriver(String(detail.id), "verify", "APPROVED") },
        { text: "Under Review", onPress: () => updateDriver(String(detail.id), "verify", "UNDER_REVIEW") },
        { text: "Reject Driver", style: "destructive", onPress: () => updateDriver(String(detail.id), "verify", "REJECTED") },
        { text: "Suspend Driver", style: "destructive", onPress: () => updateDriver(String(detail.id), "status", "SUSPENDED") },
      ];
      if (docs.length) actions.push({ text: `Review KYC (${docs.length})`, onPress: () => Alert.alert("KYC Documents", docs.map((d: AnyRecord) => `${d.id} • ${d.type || d.documentType || "Document"} • ${d.status}`).join("\n"), docs.slice(0, 3).map((d: AnyRecord) => ({ text: `Approve ${d.type || "Doc"}`, onPress: () => reviewDocument(String(detail.id), String(d.id), "APPROVED") })).concat([{ text: "Close", style: "cancel" }])) });
      if (vehicles.length) actions.push({ text: `Review Vehicles (${vehicles.length})`, onPress: () => Alert.alert("Vehicles", vehicles.map((v: AnyRecord) => `${v.id} • ${v.vehicleType} • ${v.vehicleNumber || ""} • ${v.status}`).join("\n"), vehicles.slice(0, 3).map((v: AnyRecord) => ({ text: `Verify ${v.vehicleNumber || v.vehicleType || "Vehicle"}`, onPress: () => reviewVehicle(String(detail.id), String(v.id), "VERIFIED") })).concat([{ text: "Close", style: "cancel" }])) });
      actions.push({ text: "Cancel", style: "cancel" });
      Alert.alert("Driver actions", `${detail.fullName || detail.id} • ${detail.verificationStatus || ""}`, actions);
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function broadcast() {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) { setMessage("Title and body are required."); return; }
    try {
      setLoading(true);
      const response = await adminFetch(apiPath("admin/notifications/broadcast"), { method: "POST", body: JSON.stringify({ audience: broadcastAudience, title: broadcastTitle.trim(), body: broadcastBody.trim() }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Broadcast failed");
      setMessage(`Notification broadcast created for ${body?.data?.count ?? 0} users.`); setBroadcastTitle(""); setBroadcastBody("");
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function openDetail(path: string, item: AnyRecord) {
    try {
      const response = await adminFetch(apiPath(`admin${path}`));
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to load details");
      setSelected(body?.data || item);
    } catch (error) { setMessage(cleanError(error)); setSelected(item); }
  }

  async function updateSupportCase(id: string, status: string) {
    try {
      const response = await adminFetch(apiPath(`admin/support/cases/${encodeURIComponent(id)}`), { method: "PATCH", body: JSON.stringify({ status }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Support case update failed");
      await openModule("support");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function reviewDocument(driverId: string, documentId: string, status: string) {
    try {
      const response = await adminFetch(apiPath(`admin/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(documentId)}/review`), { method: "PATCH", body: JSON.stringify({ status }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Document review failed");
      setMessage("KYC document updated.");
      await openDetail(`/drivers/${encodeURIComponent(driverId)}`, { id: driverId });
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function reviewVehicle(driverId: string, vehicleId: string, status: string) {
    try {
      const response = await adminFetch(apiPath(`admin/drivers/${encodeURIComponent(driverId)}/vehicles/${encodeURIComponent(vehicleId)}/review`), { method: "PATCH", body: JSON.stringify({ status }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Vehicle review failed");
      setMessage("Vehicle review updated.");
      await openDetail(`/drivers/${encodeURIComponent(driverId)}`, { id: driverId });
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function createRelease() {
    try {
      if (!releaseForm.version.trim()) { setMessage("Release version is required."); return; }
      const response = await adminFetch(apiPath("admin/platform/releases"), { method: "POST", body: JSON.stringify({ version: releaseForm.version.trim(), sourceLabel: releaseForm.sourceLabel.trim() || undefined, checksum: releaseForm.checksum.trim() || undefined, notes: releaseForm.notes.trim() || undefined }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Release creation failed");
      setReleaseForm({ ...releaseForm, releaseId: String(body?.data?.id || "") });
      setMessage(`Release created: ${body?.data?.id || ""}`);
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function releaseWorkflow(action: "test-start" | "test-complete" | "approve" | "promote", confirmed = false) {
    const id = releaseForm.releaseId.trim();
    if (!id) { setMessage("Release ID is required."); return; }
    if (action === "promote" && !confirmed) {
      Alert.alert("Promote Release", "Only an APPROVED TEST release may be promoted to LIVE.", [
        { text: "Cancel", style: "cancel" },
        { text: "Promote to LIVE", style: "destructive", onPress: () => { void releaseWorkflow("promote", true); } },
      ]);
      return;
    }
    const path = `releases/${encodeURIComponent(id)}/${action}`;
    const body: AnyRecord = action === "test-complete"
      ? { testerMobile: releaseForm.testerMobile.replace(/\D/g, "").slice(-10) || undefined, passed: Number(releaseForm.passed || 0), failed: Number(releaseForm.failed || 0), errors: Number(releaseForm.errors || 0) }
      : action === "promote"
        ? { confirmation: "PROMOTE TO LIVE" }
        : {};
    try {
      const response = await adminFetch(apiPath(`admin/platform/${path}`), { method: "POST", body: JSON.stringify(body) });
      const data: AnyRecord = await readJson(response);
      if (!response.ok || data?.success === false) throw new Error(data?.message || `Release ${action} failed`);
      setMessage(`Release ${action} completed.`);
      if (action === "promote") await loadPlatformData("platform");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function createMergeJob() {
    try {
      let sourceQuery: unknown;
      let derivativeData: unknown;
      try {
        sourceQuery = mergeForm.sourceQuery.trim() ? JSON.parse(mergeForm.sourceQuery) : undefined;
        derivativeData = mergeForm.derivativeData.trim() ? JSON.parse(mergeForm.derivativeData) : undefined;
      } catch {
        setMessage("Source Query / Derivative Data must contain valid JSON.");
        return;
      }
      const body = { ...mergeForm, sourceQuery, derivativeData };
      const response = await adminFetch(apiPath("admin/platform/data-merge"), { method: "POST", body: JSON.stringify(body) });
      const data: AnyRecord = await readJson(response);
      if (!response.ok || data?.success === false) throw new Error(data?.message || "Data merge job creation failed");
      setMergeForm({ ...mergeForm, id: String(data?.data?.id || "") });
      setMessage(`Data merge job created: ${data?.data?.id || ""}`);
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function reviewMergeJob() {
    if (!mergeForm.id.trim()) { setMessage("Merge job ID is required."); return; }
    try {
      const response = await adminFetch(apiPath(`admin/platform/data-merge/${encodeURIComponent(mergeForm.id)}/review`), { method: "PATCH", body: JSON.stringify({ approved: mergeForm.approved === "true" }) });
      const data: AnyRecord = await readJson(response);
      if (!response.ok || data?.success === false) throw new Error(data?.message || "Merge review failed");
      setMessage("Data merge review saved.");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function createPromotion() {
    try {
      const discountValue = Number(promotion.discountValue);
      const maxDiscount = promotion.maxDiscount.trim() ? Number(promotion.maxDiscount) : null;
      const minFare = promotion.minFare.trim() ? Number(promotion.minFare) : null;
      if (!promotion.code.trim() || !promotion.description.trim()) { setMessage("Promotion code and description are required."); return; }
      if (!Number.isFinite(discountValue) || discountValue <= 0) { setMessage("Discount value must be greater than zero."); return; }
      if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount < 0)) { setMessage("Max discount must be a valid non-negative amount."); return; }
      if (minFare !== null && (!Number.isFinite(minFare) || minFare < 0)) { setMessage("Minimum fare must be a valid non-negative amount."); return; }
      const payload = { ...promotion, discountValue, maxDiscount, minFare };
      const response = await adminFetch(apiPath("admin/promotions"), { method: "POST", body: JSON.stringify(payload) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Promotion creation failed");
      setMessage("Promotion created successfully."); await openModule("promotions");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function createPricingRule() {
    try {
      const payload: AnyRecord = { ...pricing };
      const numeric = ["baseFare", "perKm", "perMinute", "waitingPerMinute", "weightPerKg", "multiplier", "minFare", "maxFare", "priority"] as const;
      for (const key of numeric) {
        if (String(payload[key] ?? "").trim() === "") continue;
        const number = Number(payload[key]);
        if (!Number.isFinite(number)) { setMessage(`${key} must be a valid number.`); return; }
        if (["baseFare", "perKm", "perMinute", "waitingPerMinute", "weightPerKg", "multiplier", "minFare", "maxFare"].includes(key) && number < 0) { setMessage(`${key} cannot be negative.`); return; }
        payload[key] = number;
      }
      if (payload.minFare !== undefined && payload.maxFare !== undefined && payload.minFare !== "" && payload.maxFare !== "" && Number(payload.minFare) > Number(payload.maxFare)) { setMessage("Minimum fare cannot exceed maximum fare."); return; }
      const response = await adminFetch(apiPath("admin/operations/pricing-rules"), { method: "POST", body: JSON.stringify(payload) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Pricing rule creation failed");
      setMessage("Pricing rule created."); await loadPlatformData("pricing");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function createZone() {
    try {
      const centerLat = Number(zone.centerLat);
      const centerLng = Number(zone.centerLng);
      const radiusKm = Number(zone.radiusKm);
      if (!zone.name.trim() || !zone.city.trim()) { setMessage("Zone name and city are required."); return; }
      if (!Number.isFinite(centerLat) || centerLat < -90 || centerLat > 90) { setMessage("Center latitude must be between -90 and 90."); return; }
      if (!Number.isFinite(centerLng) || centerLng < -180 || centerLng > 180) { setMessage("Center longitude must be between -180 and 180."); return; }
      if (!Number.isFinite(radiusKm) || radiusKm <= 0) { setMessage("Zone radius must be greater than zero."); return; }
      const payload = { ...zone, centerLat, centerLng, radiusKm, connectionPoint: zone.connectionPoint === "true" };
      const response = await adminFetch(apiPath("admin/operations/city-zones"), { method: "POST", body: JSON.stringify(payload) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Zone creation failed");
      setMessage("City zone created."); await loadPlatformData("zones");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function createAdmin() {
    try {
      if (confirmation !== "CREATE ADMIN") { setMessage('Type "CREATE ADMIN" in confirmation.'); return; }
      const payload = { ...adminForm, confirmation };
      const response = await adminFetch(apiPath("admin/admins"), { method: "POST", body: JSON.stringify(payload) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Admin creation failed");
      setMessage("Admin created and placed in Pending Approval."); setConfirmation(""); await openModule("admins");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function approveAdmin(id: string, action: "approve" | "reject" | "suspend") {
    const confirmationText = action === "approve" ? "APPROVE ADMIN" : action === "reject" ? "REJECT ADMIN" : "SUSPEND ADMIN";
    if (confirmation !== confirmationText) { setMessage(`Type "${confirmationText}" first.`); return; }
    try {
      const response = await adminFetch(apiPath(`admin/admins/${encodeURIComponent(id)}/${action}`), { method: "PATCH", body: JSON.stringify({ confirmation: confirmationText }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || `Admin ${action} failed`);
      setConfirmation(""); await openModule("admins");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function saveRolePermissions(roleId: string) {
    const selectedPermissions = rolePermissions[roleId] || [];
    if (!selectedPermissions.length) { setMessage("Select at least one permission."); return; }
    if (confirmation !== "CHANGE PERMISSIONS") { setMessage('Type "CHANGE PERMISSIONS" first.'); return; }
    try {
      const response = await adminFetch(apiPath(`admin/roles/${encodeURIComponent(roleId)}/permissions`), { method: "POST", body: JSON.stringify({ permissionIds: selectedPermissions, confirmation }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Permission update failed");
      setConfirmation(""); setMessage("Role permissions updated."); await openModule("roles");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function loadPlatformData(kind: "pricing" | "zones" | "platform" | "settings") {
    setLoading(true); setMessage("");
    try {
      const path = kind === "pricing" ? "admin/operations/pricing-rules" : kind === "zones" ? "admin/operations/city-zones" : kind === "settings" ? "admin/configuration/status" : "admin/platform/state";
      const response = await adminFetch(apiPath(path));
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message || "Session expired"); return; }
      if (response.status === 403) { setMessage(body?.message || "Admin permission denied."); return; }
      if (!response.ok || body?.success === false) throw new Error(body?.message || `${kind} request failed`);
      if (kind === "settings") {
        const rows = Array.isArray(body?.data) ? body.data : [];
        setConfigStatus(rows);
        const next: Record<string, string> = {};
        rows.forEach((row: AnyRecord) => { next[String(row.key)] = ""; });
        setConfigValues(next);
      } else {
        setRecords(Array.isArray(body?.data) ? body.data : [body?.data || body]);
      }
      setPanel(kind);
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function loadOtpConfigurations() {
    setLoading(true); setMessage("");
    try {
      const response = await adminFetch(apiPath("admin/security/otp-configurations"));
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message || "Session expired"); return; }
      if (response.status === 403) { setMessage(body?.message || "Security permission denied."); return; }
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to load OTP configurations");
      const rows = Array.isArray(body?.data) ? body.data : [];
      setOtpConfigs(rows);
      if (!otpSelectedPurpose && rows[0]?.purposeCode) {
        const first = rows[0].purposeCode;
        setOtpSelectedPurpose(String(first));
        setOtpDraft(rows[0]);
      } else if (otpSelectedPurpose) {
        const current = rows.find((x: AnyRecord) => String(x.purposeCode) === otpSelectedPurpose);
        if (current) setOtpDraft(current);
      }
      setPanel("otp-security");
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function loadOtpHistory(purposeCode: string) {
    const code = String(purposeCode || "").trim().toUpperCase();
    if (!code) return;
    setOtpSelectedPurpose(code);
    const current = otpConfigs.find((x) => String(x.purposeCode || "").toUpperCase() === code);
    if (current) setOtpDraft(current);
    try {
      const response = await adminFetch(apiPath(`admin/security/otp-configurations/${encodeURIComponent(code)}/history`));
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to load OTP history");
      setOtpHistory(Array.isArray(body?.data?.history) ? body.data.history : []);
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function saveOtpConfiguration() {
    const code = String(otpSelectedPurpose || otpDraft.purposeCode || "").trim().toUpperCase();
    if (!code) { setMessage("Select an OTP purpose code first."); return; }
    try {
      setLoading(true);
      const payload: AnyRecord = {
        purposeCategory: String(otpDraft.purposeCategory || "AUTH").trim().toUpperCase(),
        deliveryMethod: String(otpDraft.deliveryMethod || "PUSH").trim().toUpperCase(),
        expirySeconds: Number(otpDraft.expirySeconds),
        wrongAttemptLimit: Number(otpDraft.wrongAttemptLimit),
        resendIntervalSeconds: Number(otpDraft.resendIntervalSeconds),
        maximumResends: Number(otpDraft.maximumResends),
        cooldownSeconds: Number(otpDraft.cooldownSeconds),
        notificationRetryCount: Number(otpDraft.notificationRetryCount),
        notificationRetryIntervalSeconds: Number(otpDraft.notificationRetryIntervalSeconds),
        active: otpDraft.active === true || String(otpDraft.active).trim().toLowerCase() === "true",
      };
      const response = await adminFetch(apiPath(`admin/security/otp-configurations/${encodeURIComponent(code)}`), { method: "PATCH", body: JSON.stringify(payload) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "OTP configuration update failed");
      setMessage(`OTP configuration ${code} updated.`);
      await loadOtpConfigurations();
      await loadOtpHistory(code);
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function createOtpPurpose() {
    const purposeCode = String(otpCreateForm.purposeCode || "").trim().toUpperCase();
    const purposeCategory = String(otpCreateForm.purposeCategory || "AUTH").trim().toUpperCase();
    const deliveryMethod = String(otpCreateForm.deliveryMethod || "PROVIDER_OTP").trim().toUpperCase();
    if (!purposeCode) { setMessage("Purpose code is required."); return; }
    try {
      setLoading(true);
      const response = await adminFetch(apiPath("admin/security/otp-configurations"), { method: "POST", body: JSON.stringify({ purposeCode, purposeCategory, deliveryMethod }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "OTP purpose creation failed");
      setOtpCreateForm({ purposeCode: "", purposeCategory: "AUTH", deliveryMethod: "PROVIDER_OTP" });
      setMessage(`OTP purpose ${purposeCode} created.`);
      await loadOtpConfigurations();
      await loadOtpHistory(purposeCode);
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function rollbackOtpConfiguration(purposeCode: string, version: number) {
    try {
      setLoading(true);
      const response = await adminFetch(apiPath(`admin/security/otp-configurations/${encodeURIComponent(purposeCode)}/rollback`), { method: "POST", body: JSON.stringify({ targetVersion: version }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "OTP rollback failed");
      setMessage(`OTP ${purposeCode} rolled back using Version ${version}; backend creates a new current global version.`);
      await loadOtpConfigurations();
      await loadOtpHistory(purposeCode);
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function deleteOtpPurpose(purposeCode: string) {
    const confirmationText = `DELETE OTP PURPOSE ${purposeCode}`;
    if (otpDeleteConfirmation !== confirmationText) { setMessage(`Type "${confirmationText}" before deletion.`); return; }
    try {
      setLoading(true);
      const response = await adminFetch(apiPath(`admin/security/otp-configurations/${encodeURIComponent(purposeCode)}`), { method: "DELETE", body: JSON.stringify({ confirmation: confirmationText }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "OTP purpose deletion failed");
      setOtpDeleteConfirmation(""); setOtpHistory([]); setOtpSelectedPurpose("");
      setMessage(`OTP purpose ${purposeCode} deleted.`);
      await loadOtpConfigurations();
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }



  async function captureLocationCoordinates() {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setMessage("Location permission is required to capture the current Admin location.");
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const latitude = Number(current.coords.latitude);
      const longitude = Number(current.coords.longitude);
      setLocationCoordinate({ latitude, longitude });
      try {
        const geocoded = await Location.reverseGeocodeAsync({ latitude, longitude });
        const place = geocoded?.[0];
        const address = [place?.name, place?.street, place?.district, place?.city, place?.region].filter(Boolean).join(", ");
        if (address) setLocationAddress(address);
        if (!locationCity && place?.city) setLocationCity(String(place.city));
      } catch {}
      setMessage("Current location captured from device GPS.");
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  async function captureLocationPhoto() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== "granted") {
        setMessage("Camera permission is required to capture the location photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.82,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setLocationPhotoUri(result.assets[0].uri);
        setMessage("Location photo captured.");
      }
    } catch (error) {
      setMessage(cleanError(error));
    }
  }

  async function uriToDataUrl(uri: string): Promise<string> {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Unable to read captured location photo");
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to encode location photo"));
      reader.readAsDataURL(blob);
    });
  }

  async function loadLocationMaster() {
    try {
      setLoading(true);
      const query = locationCity.trim() ? `?city=${encodeURIComponent(locationCity.trim())}` : "";
      const response = await adminFetch(apiPath(`admin/locations${query}`));
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message); return; }
      if (response.status === 403) { setMessage(body?.message || "Location Master permission denied."); return; }
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to load Location Master");
      setLocationRecords(Array.isArray(body?.data) ? body.data : []);
      setPanel("locations");
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveLocationMaster() {
    const city = locationCity.trim();
    const name = locationName.trim();
    const locationTypeValue = locationType.trim().toUpperCase();
    if (!city || !name) { setMessage("City and location name are required."); return; }
    if (!locationCoordinate) { setMessage("Capture the current location or set valid coordinates first."); return; }
    if (!locationPhotoUri) { setMessage("A real location photo is required before saving."); return; }
    if (!["LANDMARK","PICKUP_POINT","DROP_POINT","CONNECTION_POINT","EVENT_POINT","STATION","AREA","OTHER"].includes(locationTypeValue)) {
      setMessage("Location type must be LANDMARK, PICKUP_POINT, DROP_POINT, CONNECTION_POINT, EVENT_POINT, STATION, AREA or OTHER.");
      return;
    }
    try {
      setLoading(true);
      const photoBase64 = await uriToDataUrl(locationPhotoUri);
      const response = await adminFetch(apiPath("admin/locations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city,
          name,
          address: locationAddress.trim(),
          category: locationTypeValue,
          type: locationTypeValue,
          latitude: locationCoordinate.latitude,
          longitude: locationCoordinate.longitude,
          pickupAllowed: Boolean(locationPickupAllowed),
          dropAllowed: Boolean(locationDropAllowed),
          pickupRadiusMeters: Number(locationPickupRadiusM) || 300,
          dropRadiusMeters: Number(locationDropRadiusM) || 500,
          active: true,
          photoBase64,
        }),
      });
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message); return; }
      if (response.status === 403) { setMessage(body?.message || "Location Master permission denied."); return; }
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to create location");
      setMessage("City location created and ready for Route Builder.");
      setLocationName(""); setLocationAddress(""); setLocationZone(""); setLocationPhotoUri(""); setLocationCoordinate(null);
      await loadLocationMaster();
    } catch (error) {
      setMessage(cleanError(error));
    } finally {
      setLoading(false);
    }
  }

  async function toggleLocationActive(locationId: string, active: boolean) {
    if (!locationId) return;
    try {
      setLoading(true);
      const response = await adminFetch(apiPath(`admin/locations/${encodeURIComponent(locationId)}`), { method: "PATCH", body: JSON.stringify({ active }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to update location");
      await loadLocationMaster();
    } catch (error) { setMessage(cleanError(error)); } finally { setLoading(false); }
  }

  async function loadRouteBuilder() {
    try {
      setLoading(true);
      const cityQuery = routeBuilderCity.trim() ? `?city=${encodeURIComponent(routeBuilderCity.trim())}` : "";
      const [locationsResponse, driversResponse, routesResponse] = await Promise.all([
        adminFetch(apiPath(`admin/locations${cityQuery}`)),
        adminFetch(apiPath("admin/drivers")),
        adminFetch(apiPath(`admin/routes${cityQuery}`)),
      ]);
      const [locationsBody, driversBody, routesBody] = await Promise.all([readJson(locationsResponse), readJson(driversResponse), readJson(routesResponse)]);
      if ([locationsResponse, driversResponse, routesResponse].some((response) => response.status === 401)) { await forceLogout("Admin authorization is no longer valid."); return; }
      if (!locationsResponse.ok || locationsBody?.success === false) throw new Error(locationsBody?.message || "Unable to load Route Builder locations");
      if (!driversResponse.ok || driversBody?.success === false) throw new Error(driversBody?.message || "Unable to load Route Builder drivers");
      if (!routesResponse.ok || routesBody?.success === false) throw new Error(routesBody?.message || "Unable to load Route Builder routes");
      setRouteBuilderLocations(Array.isArray(locationsBody?.data) ? locationsBody.data : []);
      setRouteBuilderDrivers(Array.isArray(driversBody?.data) ? driversBody.data : []);
      setRouteBuilderRecords(Array.isArray(routesBody?.data) ? routesBody.data : []);
      setPanel("route-builder");
    } catch (error) { setMessage(cleanError(error)); } finally { setLoading(false); }
  }

  function toggleRouteStop(locationId: string) {
    setRouteBuilderStopIds((current) => current.includes(locationId) ? current.filter((id) => id !== locationId) : [...current, locationId]);
  }

  function moveRouteStop(locationId: string, direction: -1 | 1) {
    setRouteBuilderStopIds((current) => {
      const index = current.indexOf(locationId);
      if (index < 0) return current;
      const next = index + direction;
      if (next < 0 || next >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }

  function toggleRouteDriver(driverId: string) {
    setRouteBuilderDriverIds((current) => current.includes(driverId) ? current.filter((id) => id !== driverId) : [...current, driverId]);
  }

  async function createConfiguredRoute() {
    const city = routeBuilderCity.trim();
    const name = routeBuilderName.trim();
    if (!city || !name) { setMessage("City and route name are required."); return; }
    if (!routeBuilderStartId || !routeBuilderEndId) { setMessage("Select a start and end location."); return; }
    const intermediateStopIds = Array.from(new Set(
      routeBuilderStopIds.filter((id) => id !== routeBuilderStartId && id !== routeBuilderEndId),
    ));
    if (routeBuilderMode !== "AUTOMATIC" && routeBuilderDriverIds.length === 0) { setMessage("Select at least one allowed driver or use Automatic mode."); return; }
    try {
      setLoading(true);
      const payload = {
        city,
        name,
        serviceType: routeBuilderServiceType,
        vehicleType: routeBuilderVehicleType,
        active: false,
        matchingMode: routeBuilderMode,
        selectionMode: "AUTO_NEAREST",
        allowedDriverIds: routeBuilderDriverIds,
        zoneIds: routeBuilderCoverageZones.split(",").map((x) => x.trim()).filter(Boolean),
        startLocationId: routeBuilderStartId,
        endLocationId: routeBuilderEndId,
        stopIds: intermediateStopIds,
        pickupRadiusMeters: Number(routeBuilderRules.pickupRadiusM),
        dropRadiusMeters: Number(routeBuilderRules.dropRadiusM),
        maxPickupEtaMinutes: Number(routeBuilderRules.maxEtaMinutes),
        maxDetourKm: Number(routeBuilderRules.maxDetourKm),
        gpsFreshnessSeconds: Number(routeBuilderRules.gpsFreshnessSeconds),
      };
      const response = await adminFetch(apiPath("admin/routes"), { method: "POST", body: JSON.stringify(payload) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to create route");
      setMessage("Route draft created. Activate it after review.");
      setRouteBuilderName(""); setRouteBuilderStopIds([]); setRouteBuilderDriverIds([]);
      await loadRouteBuilder();
    } catch (error) { setMessage(cleanError(error)); } finally { setLoading(false); }
  }

  async function toggleConfiguredRoute(routeId: string, active: boolean) {
    if (!routeId) return;
    try {
      setLoading(true);
      const response = await adminFetch(apiPath(`admin/routes/${encodeURIComponent(routeId)}`), { method: "PATCH", body: JSON.stringify({ active }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to update route");
      await loadRouteBuilder();
    } catch (error) { setMessage(cleanError(error)); } finally { setLoading(false); }
  }

  async function loadMatchingConfiguration() {
    try {
      setLoading(true);
      const response = await adminFetch(apiPath("admin/matching/configuration"));
      const body: AnyRecord = await readJson(response);
      if (response.status === 401) { await forceLogout(body?.message); return; }
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to load matching configuration");
      const data = body?.data || {};
      const fallbackLevels = Array.isArray(data.fallbackLevels) ? data.fallbackLevels.map((value: unknown) => String(value).toUpperCase()) : [];
      setMatchingConfig({
        mode: String(data.defaultMode || "HYBRID"),
        pickupRadiusM: String(data.pickupRadiusMeters ?? 300),
        dropRadiusM: String(data.dropRadiusMeters ?? 500),
        maxPickupDistanceKm: String(data.maxPickupDistanceKm ?? 5),
        maxDetourKm: String(data.maxDetourKm ?? 3),
        maxEtaMinutes: String(data.maxPickupEtaMinutes ?? 12),
        gpsFreshnessSeconds: String(data.gpsFreshnessSeconds ?? 60),
        offerTimeoutSeconds: String(data.offerTimeoutSeconds ?? 300),
        retryCount: String(data.retryCount ?? 2),
        fallbackEnabled: Boolean(data.fallbackEnabled),
        onlineOnly: Boolean(data.onlineOnly),
        preferExactRoute: fallbackLevels.length === 0 || fallbackLevels[0] === "EXACT_ROUTE",
      });
      setPanel("matching-config");
    } catch (error) { setMessage(cleanError(error)); } finally { setLoading(false); }
  }

  async function saveMatchingConfiguration() {
    try {
      setLoading(true);
      const preferExactRoute = Boolean(matchingConfig.preferExactRoute);
      const payload = {
        defaultMode: String(matchingConfig.mode || "HYBRID"),
        pickupRadiusMeters: Number(matchingConfig.pickupRadiusM),
        dropRadiusMeters: Number(matchingConfig.dropRadiusM),
        maxPickupDistanceKm: Number(matchingConfig.maxPickupDistanceKm),
        maxDetourKm: Number(matchingConfig.maxDetourKm),
        maxPickupEtaMinutes: Number(matchingConfig.maxEtaMinutes),
        gpsFreshnessSeconds: Number(matchingConfig.gpsFreshnessSeconds),
        offerTimeoutSeconds: Number(matchingConfig.offerTimeoutSeconds),
        retryCount: Number(matchingConfig.retryCount),
        fallbackEnabled: Boolean(matchingConfig.fallbackEnabled),
        onlineOnly: Boolean(matchingConfig.onlineOnly),
        fallbackLevels: preferExactRoute
          ? ["EXACT_ROUTE", "NEARBY_ROUTE", "SAME_ZONE"]
          : ["NEARBY_ROUTE", "SAME_ZONE", "EXACT_ROUTE"],
      };
      const response = await adminFetch(apiPath("admin/matching/configuration"), { method: "PUT", body: JSON.stringify(payload) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to save matching configuration");
      setMessage("Matching configuration saved. New matching operations use the updated defaults.");
      await loadMatchingConfiguration();
    } catch (error) { setMessage(cleanError(error)); } finally { setLoading(false); }
  }

  async function loadWorkingRoutes(driverId = routeDriverId) {
    const id = String(driverId || "").trim();
    if (!id) { setMessage("Driver ID is required to load working routes."); return; }
    try {
      setLoading(true);
      const response = await adminFetch(apiPath(`admin/drivers/${encodeURIComponent(id)}/working-routes`));
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to load working routes");
      setRouteMeta(body.data || null);
      setRouteRecords(Array.isArray(body?.data?.routes) ? body.data.routes : []);
      setRouteDriverId(id);
      setPanel("routes");
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function createWorkingRoute() {
    const id = String(routeDriverId || "").trim();
    const name = String(routeForm.name || "").trim();
    if (!id || !name) { setMessage("Driver ID and route name are required."); return; }
    const numericKeys = ["sequence","startLat","startLng","endLat","endLng"];
    const payload: AnyRecord = { name, active: Boolean(routeForm.active) };
    for (const key of numericKeys) {
      const raw = String(routeForm[key] ?? "").trim();
      if (raw !== "") payload[key] = Number(raw);
    }
    try {
      setLoading(true);
      const response = await adminFetch(apiPath(`admin/drivers/${encodeURIComponent(id)}/working-routes`), { method: "POST", body: JSON.stringify(payload) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Unable to create working route");
      setMessage("Working route created. It still requires backend approval before matching can use it.");
      setRouteForm({ name: "", sequence: "", startLat: "", startLng: "", endLat: "", endLng: "", active: true });
      await loadWorkingRoutes(id);
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function reviewWorkingRoute(routeId: string, status: "APPROVED" | "REJECTED" | "PENDING") {
    const id = String(routeDriverId || "").trim();
    if (!id || !routeId) return;
    try {
      setLoading(true);
      const response = await adminFetch(apiPath(`admin/drivers/${encodeURIComponent(id)}/working-routes/${encodeURIComponent(routeId)}/review`), { method: "PATCH", body: JSON.stringify({ status }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Working route review failed");
      setMessage(`Route ${status.toLowerCase()}.`); await loadWorkingRoutes(id);
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function deleteWorkingRoute(routeId: string) {
    const id = String(routeDriverId || "").trim();
    if (!id || !routeId) return;
    Alert.alert("Delete working route", "The backend currently exposes DELETE for this route. Proceed only when this operation is intended.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => {
      try {
        setLoading(true);
        const response = await adminFetch(apiPath(`admin/drivers/${encodeURIComponent(id)}/working-routes/${encodeURIComponent(routeId)}`), { method: "DELETE", body: JSON.stringify({ changeReason: "Admin mobile route deletion" }) });
        const body: AnyRecord = await readJson(response);
        if (!response.ok || body?.success === false) throw new Error(body?.message || "Working route deletion failed");
        setMessage("Working route deleted by backend."); await loadWorkingRoutes(id);
      } catch (error) { setMessage(cleanError(error)); }
      finally { setLoading(false); }
    } }]);
  }

  async function loadReports() {
    try {
      setLoading(true);
      await loadDashboard();
      setPanel("reports");
    } catch (error) { setMessage(cleanError(error)); }
    finally { setLoading(false); }
  }

  async function updateConfig(key: string) {
    const value = configValues[key];
    if (!value?.trim()) { setMessage("Configuration value is required."); return; }
    try {
      const response = await adminFetch(apiPath(`admin/configuration/${encodeURIComponent(key)}`), { method: "PUT", body: JSON.stringify({ value }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Configuration update failed");
      setMessage(`${key} updated securely.`);
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function updateEnvironment(environment: "TEST" | "LIVE") {
    if (environment === "LIVE") { setMessage("LIVE is only entered through an APPROVED project release promotion."); return; }
    try {
      const response = await adminFetch(apiPath("admin/platform/environment"), { method: "PUT", body: JSON.stringify({ environment }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Environment update failed");
      setMessage("TEST environment selected."); await loadPlatformData("platform");
    } catch (error) { setMessage(cleanError(error)); }
  }


  async function seedTestData() {
    if (!TEST_MODE) { setMessage("TEST Data Lab is disabled outside TEST mode."); return; }
    try {
      const response = await adminFetch(apiPath("admin/test-data/seed"), { method: "POST", body: JSON.stringify({ confirmation: "SEED TEST DATA" }) });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Test seed failed");
      setMessage("Test data seeded.");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function loadTestData() {
    if (!TEST_MODE) { setMessage("TEST Data Lab is disabled outside TEST mode."); return; }
    try {
      const response = await adminFetch(apiPath("admin/test-data/records"));
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Test data load failed");
      setRecords(Array.isArray(body?.data) ? body.data : []); setPanel("test-data");
    } catch (error) { setMessage(cleanError(error)); }
  }

  async function deleteTestRecord() {
    if (!TEST_MODE) { setMessage("TEST Data Lab is disabled outside TEST mode."); return; }
    if (!testId.trim()) { setMessage("Test record ID is required."); return; }
    try {
      const response = await adminFetch(apiPath(`admin/test-data/${encodeURIComponent(testEntity)}/${encodeURIComponent(testId.trim())}`), { method: "DELETE" });
      const body: AnyRecord = await readJson(response);
      if (!response.ok || body?.success === false) throw new Error(body?.message || "Test record delete failed");
      setMessage("Test record deleted."); setTestId(""); await loadTestData();
    } catch (error) { setMessage(cleanError(error)); }
  }

  function goDashboard() { setPanel("dashboard"); setScreen("dashboard"); setSelected(null); setMessage(""); }

  if (screen === "registration") {
    return (
      <SafeAreaView style={styles.page}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <AdminBrandLogo large />
          <View style={styles.securityBadge}>
            <AssetIcon name="safety" size={16} />
            <Text style={styles.securityText}>ADMIN • PROVISIONED ACCESS</Text>
          </View>
          <Text style={styles.heading}>Admin account access</Text>
          <Text style={styles.subheading}>The locked RideX backend does not expose public Admin self-registration. An authorized Admin/Super Admin must create the account and approve its access.</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>How access is created</Text>
            <Text style={styles.note}>Authorized Admin → create Admin → assign role/working scope → approval → Admin login → new-device OTP when required.</Text>
            <Button title="Back to Admin Login" onPress={() => setScreen("login")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "login") {
    return (
      <SafeAreaView style={styles.page}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "flex-end", marginBottom: 10 }}><RideXLanguageToggle /></View>
          <AdminBrandLogo large />
          
          <View style={styles.securityBadge}>
            <AssetIcon name="safety" size={16}/>
            <Text style={styles.securityText}>ADMIN • SECURE ACCESS</Text>
          </View>
          <Text style={styles.heading}>Admin Control Center</Text>
          <View style={styles.authAccentLine} />
          <Text style={styles.subheading}>
            User ID, Gmail/Email or mobile + password, followed by Admin OTP verification.
          </Text>

          <View style={[styles.card, styles.authCard]}>
            <Field
              label="Admin User ID / Gmail / Email / Mobile"
              value={loginIdentifier}
              onChangeText={setLoginIdentifier}
              placeholder="Admin User ID / admin@ridex.in / 9876543210"
              autoCapitalize="none"
              keyboardType="default"
            />
            <Field
              label="Password"
              value={loginPassword}
              onChangeText={setLoginPassword}
              placeholder="Admin password"
              secureTextEntry
              autoCapitalize="none"
            />
            <Button
              title={loading ? "Starting Secure Login…" : t("auth.sendOtp", "Continue to Admin OTP")}
              onPress={() => void requestOtp()}
              disabled={loading}
              loading={loading}
            />
            {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
          </View>

          <View style={styles.adminAccessNote}>
            <Text style={styles.adminAccessTitle}>Admin account provisioning</Text>
            <Text style={styles.adminAccessBody}>Admin accounts are created by an authorized RideX Admin/Super Admin. The current backend does not expose a public self-registration endpoint.</Text>
          </View>

          {onBackToCustomer ? (
            <Pressable onPress={onBackToCustomer}>
              <Text style={styles.backLink}>← Back to Customer App</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "otp") {
    return (
      <SafeAreaView style={styles.page}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "flex-end", marginBottom: 10 }}><RideXLanguageToggle /></View>
          <AdminBrandLogo small />
          
          <Text style={styles.heading}>Verify Admin OTP</Text>
          <View style={styles.authAccentLine} />
          <Text style={styles.subheading}>
            OTP verification for {loginIdentifier}.
          </Text>

          <View style={[styles.card, styles.authCard]}>
            <Field
              label="4-Digit OTP"
              value={otp}
              onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              keyboardType="number-pad"
            />
            <Button
              title={t("auth.verifyOtp", "Verify & Open Control Center")}
              onPress={() => void verifyOtp()}
              disabled={loading}
              loading={loading}
            />
            <Button
              title={otpResendAfterSeconds > 0 ? `Resend OTP in ${otpResendAfterSeconds}s` : t("auth.resendOtp", "Resend Admin OTP")}
              onPress={() => void resendAdminOtp()}
              secondary
              disabled={loading || otpResendAfterSeconds > 0}
              loading={loading}
            />
            {otpAttemptsRemaining !== null ? (
              <Text style={styles.message}>{t("auth.attemptsRemaining", `Attempts remaining: ${otpAttemptsRemaining}`, { count: otpAttemptsRemaining })}</Text>
            ) : null}
            <Button
              title="Change Login"
              onPress={() => setScreen("login")}
              secondary
              disabled={loading}
            />
            {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const renderPanel = () => {
    if (panel === "dashboard") return <DashboardPanel dashboard={dashboard} onOpen={openModule} role={adminRole} />;
    if (panel === "finance") return <SettlementPanel records={records} onRefresh={() => void openModule("finance")} filter={statusFilter} setFilter={setStatusFilter} />;
    if (panel === "live") return <LivePanel records={records} onRefresh={() => void loadLiveData(setRecords, setMessage)} realtimeConnected={realtimeConnected} realtimeEvents={realtimeEvents} />;
    if (panel === "drivers") return <ListPanel title="Driver Management / KYC / Vehicles" records={records} onRefresh={() => void openModule("drivers")} onSelect={(item) => void openDriverActions(item)} />;
    if (panel === "events") return <EventsPanel records={records} eventForm={eventForm} setEventForm={(value) => setEventForm((current) => ({ ...current, ...value }))} onSave={() => void createOrUpdateEvent()} onAction={eventAction} onRefresh={() => void loadRecords("/events", "events", "Events / Sessions")} onSelect={(item) => setEventForm({ id: String(item.id || ""), name: String(item.name || item.title || ""), description: String(item.description || ""), startsAt: String(item.startsAt || ""), endsAt: String(item.endsAt || ""), stopsJson: JSON.stringify(item.stops || [], null, 2), sessionsJson: JSON.stringify(item.sessions || [], null, 2) })} />;
    if (panel === "customers") return <ListPanel title="Customer Management" records={records} onRefresh={() => void openModule("customers")} onSelect={(item) => void openDetail(`/customers/${encodeURIComponent(String(item.id || ""))}`, item)} />;
    if (panel === "bookings") return <ListPanel title="Booking Management / Ride Operations" records={records} onRefresh={() => void openModule("bookings")} onSelect={(item) => void openDetail(`/bookings/${encodeURIComponent(String(item.id || ""))}`, item)} filter={statusFilter} setFilter={setStatusFilter} />;
    if (panel === "payments") return <ListPanel title="Finance / Payments" records={records} onRefresh={() => void openModule("payments")} onSelect={(item) => setSelected(item)} filter={statusFilter} setFilter={setStatusFilter} />;
    if (panel === "support") return <SupportPanel records={records} onReload={() => void openModule("support")} confirmation={confirmation} setConfirmation={setConfirmation} onUpdate={(id, status) => void updateSupportCase(id, status)} />;
    if (panel === "safety") return <ListPanel title="Safety / SOS" records={records} onRefresh={() => void openModule("safety")} onSelect={(item) => setSelected(item)} />;
    if (panel === "notifications") return <BroadcastPanel audience={broadcastAudience} setAudience={setBroadcastAudience} title={broadcastTitle} setTitle={setBroadcastTitle} body={broadcastBody} setBody={setBroadcastBody} onSend={() => void broadcast()} loading={loading} />;
    if (panel === "promotions") return <PromotionPanel records={records} promotion={promotion} setPromotion={setPromotion} onCreate={() => void createPromotion()} onReload={() => void openModule("promotions")} />;
    if (panel === "pricing") return <PricingPanel records={records} pricing={pricing} setPricing={setPricing} onCreate={() => void createPricingRule()} />;
    if (panel === "zones") return <ZonePanel records={records} zone={zone} setZone={setZone} onCreate={() => void createZone()} />;
    if (panel === "admins") return <AdminUsersPanel records={records} confirmation={confirmation} setConfirmation={setConfirmation} adminForm={adminForm} setAdminForm={setAdminForm} onCreate={() => void createAdmin()} onAction={approveAdmin} />;
    if (panel === "roles") return <RolesPanel records={records} rolePermissions={rolePermissions} setRolePermissions={setRolePermissions} confirmation={confirmation} setConfirmation={setConfirmation} onSave={saveRolePermissions} />;
    if (panel === "audit") return <ListPanel title="Security / Audit Logs" records={records} onRefresh={() => void openModule("audit")} onSelect={(item) => setSelected(item)} />;
    if (panel === "settings") return <SettingsPanel status={configStatus} values={configValues} setValues={setConfigValues} onSave={updateConfig} />;
    if (panel === "platform") return <PlatformPanel records={records} onSetTest={() => void updateEnvironment("TEST")} releaseForm={releaseForm} setReleaseForm={setReleaseForm} onCreateRelease={() => void createRelease()} onReleaseAction={releaseWorkflow} mergeForm={mergeForm} setMergeForm={setMergeForm} onCreateMerge={() => void createMergeJob()} onReviewMerge={() => void reviewMergeJob()} />;
    if (panel === "test-data") return <TestDataPanel records={records} entity={testEntity} setEntity={setTestEntity} id={testId} setId={setTestId} onSeed={() => void seedTestData()} onLoad={() => void loadTestData()} onDelete={() => void deleteTestRecord()} />;
    if (panel === "matching") return <MatchingPanel records={records} onRefresh={() => void openModule("matching")} />;
    if (panel === "vehicles") return <VehiclePanel records={records} onRefresh={() => void openModule("vehicles")} />;
    if (panel === "vehicleCatalog") return <OperationsCatalogPanel panel="vehicleCatalog" onMessage={setMessage} />;
    if (panel === "gateway") return <OperationsCatalogPanel panel="gateway" onMessage={setMessage} />;
    if (panel === "availability") return <OperationsCatalogPanel panel="availability" onMessage={setMessage} />;
    if (panel === "locations") return <LocationMasterPanel city={locationCity} setCity={setLocationCity} name={locationName} setName={setLocationName} address={locationAddress} setAddress={setLocationAddress} type={locationType} setType={setLocationType} zone={locationZone} setZone={setLocationZone} pickupRadiusM={locationPickupRadiusM} setPickupRadiusM={setLocationPickupRadiusM} dropRadiusM={locationDropRadiusM} setDropRadiusM={setLocationDropRadiusM} pickupAllowed={locationPickupAllowed} setPickupAllowed={setLocationPickupAllowed} dropAllowed={locationDropAllowed} setDropAllowed={setLocationDropAllowed} photoUri={locationPhotoUri} coordinate={locationCoordinate} records={locationRecords} search={locationSearch} setSearch={setLocationSearch} onCaptureLocation={() => void captureLocationCoordinates()} onCapturePhoto={() => void captureLocationPhoto()} onSave={() => void saveLocationMaster()} onLoad={() => void loadLocationMaster()} onToggle={toggleLocationActive} />;
    if (panel === "route-builder") return <RouteBuilderPanel city={routeBuilderCity} setCity={setRouteBuilderCity} name={routeBuilderName} setName={setRouteBuilderName} serviceType={routeBuilderServiceType} setServiceType={setRouteBuilderServiceType} vehicleType={routeBuilderVehicleType} setVehicleType={setRouteBuilderVehicleType} mode={routeBuilderMode} setMode={setRouteBuilderMode} coverageZones={routeBuilderCoverageZones} setCoverageZones={setRouteBuilderCoverageZones} locationSearch={routeBuilderLocationSearch} setLocationSearch={setRouteBuilderLocationSearch} startId={routeBuilderStartId} setStartId={setRouteBuilderStartId} endId={routeBuilderEndId} setEndId={setRouteBuilderEndId} stopIds={routeBuilderStopIds} toggleStop={toggleRouteStop} moveStop={moveRouteStop} driverIds={routeBuilderDriverIds} toggleDriver={toggleRouteDriver} locations={routeBuilderLocations} drivers={routeBuilderDrivers} routeRecords={routeBuilderRecords} rules={routeBuilderRules} setRules={(value) => { setRouteBuilderRules((current) => ({ ...current, ...value })); }} onLoad={() => void loadRouteBuilder()} onCreate={() => void createConfiguredRoute()} onToggle={toggleConfiguredRoute} />;
    if (panel === "matching-config") return <MatchingConfigurationPanel serviceType={matchingConfigService} setServiceType={setMatchingConfigService} config={matchingConfig} setConfig={(value) => { setMatchingConfig((current) => ({ ...current, ...value })); }} onLoad={() => void loadMatchingConfiguration()} onSave={() => void saveMatchingConfiguration()} />;
    if (panel === "routes") return <WorkingRoutesPanel routeDriverId={routeDriverId} setRouteDriverId={setRouteDriverId} routeMeta={routeMeta} records={routeRecords} routeForm={routeForm} setRouteForm={setRouteForm} onLoad={() => void loadWorkingRoutes()} onCreate={() => void createWorkingRoute()} onReview={reviewWorkingRoute} onDelete={deleteWorkingRoute} />;
    if (panel === "reports") return <ReportsPanel dashboard={dashboard} records={records} realtimeEvents={realtimeEvents} />;
    if (panel === "presence") return <AdminPresencePanel records={presenceRecords} onRefresh={() => void loadPresence()} onRevoke={revokePresenceSession} onRevokeAll={revokeAllAdminSessions} />;
    if (panel === "otp-security") return <OtpSecurityPanel configs={otpConfigs} selectedPurpose={otpSelectedPurpose} setSelectedPurpose={setOtpSelectedPurpose} draft={otpDraft} setDraft={setOtpDraft} history={otpHistory} onSelect={(code) => void loadOtpHistory(code)} onRefresh={() => void loadOtpConfigurations()} onSave={() => void saveOtpConfiguration()} createForm={otpCreateForm} setCreateForm={setOtpCreateForm} onCreate={() => void createOtpPurpose()} deleteConfirmation={otpDeleteConfirmation} setDeleteConfirmation={setOtpDeleteConfirmation} onDelete={() => void deleteOtpPurpose(otpSelectedPurpose)} onRollback={rollbackOtpConfiguration} />;
    return <ListPanel title={panel} records={records} onRefresh={() => void refresh()} onSelect={(item) => setSelected(item)} />;
  };

  const currentMeta = PANEL_META[panel] ?? PANEL_META.dashboard;

  return (
    <SafeAreaView style={styles.page}>
      <AdminMobileDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={adminRole}
        currentPanel={panel}
        onOpen={(nextPanel) => void openModule(nextPanel)}
        onRefresh={() => void refresh()}
        onLogout={() => void logout()}
      />

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable style={styles.menuButton} onPress={() => setDrawerOpen(true)} accessibilityRole="button" accessibilityLabel="Open Admin navigation">
            <Text style={styles.menuGlyph}>☰</Text>
          </Pressable>
          <AdminBrandLogo compact />
          <View style={{ flex: 1 }}>
            <Text style={styles.brandSmall}>RIDEX ADMIN</Text>
            <Text style={styles.headerName} numberOfLines={1} accessibilityLabel={currentMeta.title}>{currentMeta.title}</Text>
          </View>
        </View>

        <View style={styles.topBarRight}>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{String(adminRole || "ADMIN").replaceAll("_", " ")}</Text>
            <Text style={styles.roleBadgeScopeText}>{String(adminLevel || "GLOBAL").replaceAll("_", " ")} scope</Text>
          </View>
          <Pressable style={styles.headerButton} onPress={() => void refresh()} accessibilityRole="button" accessibilityLabel="Refresh current Admin screen">
            <AssetIcon name="refresh" size={18}/>
          </Pressable>
          <Pressable style={styles.headerButton} onPress={() => void logout()} accessibilityRole="button" accessibilityLabel="Logout">
            <Text style={styles.logoutHeaderText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.pageContextBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageContextTitle}>{currentMeta.title}</Text>
          <Text style={styles.pageContextSub}>{currentMeta.subtitle}</Text>
          <Text style={styles.pageContextScope}>Scope: {String(adminLevel || "GLOBAL").replaceAll("_", " ")}{adminStateId ? ` • State ${adminStateId}` : ""}{adminCityId ? ` • City ${adminCityId}` : ""}</Text>
        </View>
        <View style={[styles.connectionPill, realtimeConnected ? styles.connectionPillLive : styles.connectionPillFallback]}>
          <View style={[styles.connectionPillDot, realtimeConnected ? styles.connectionPillDotLive : styles.connectionPillDotFallback]} />
          <Text style={styles.connectionPillText}>{realtimeConnected ? "LIVE" : "SYNC"}</Text>
        </View>
      </View>

      {panel !== "dashboard" ? (
        <Pressable style={styles.inlineBackButton} onPress={goDashboard}>
          <Text style={styles.inlineBackText}>← Dashboard</Text>
        </Pressable>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.dashboardScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={WEB_ADMIN_COLORS.primary} />}
      >
        <View style={styles.sessionBanner}>
          <View style={[styles.dot, !realtimeConnected && styles.dotOffline]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.connectionTitle}>{realtimeConnected ? "Backend + Realtime Connected" : "Backend Connected"}</Text>
            <Text style={styles.connectionSub}>{adminName} • {adminRole} • {realtimeConnected ? "Live events enabled" : "Sync fallback enabled"}</Text>
          </View>
        </View>

        {renderPanel()}
        {selected ? <DetailPanel item={selected} onClose={() => setSelected(null)} /> : null}
        {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

async function loadLiveData(setRecords: (v: AnyRecord[]) => void, setMessage: (v: string) => void) {
  try {
    const [driversResponse, bookingsResponse, sosResponse] = await Promise.all([adminFetch(apiPath("admin/drivers")), adminFetch(apiPath("admin/bookings")), adminFetch(apiPath("admin/safety/sos"))]);
    const [drivers, bookings, sos] = await Promise.all([readJson(driversResponse), readJson(bookingsResponse), readJson(sosResponse)]);
    setRecords([
      ...(Array.isArray(drivers?.data) ? drivers.data.map((x: AnyRecord) => ({ _liveType: "DRIVER", ...x })) : []),
      ...(Array.isArray(bookings?.data) ? bookings.data.map((x: AnyRecord) => ({ _liveType: "BOOKING", ...x })) : []),
      ...(Array.isArray(sos?.data) ? sos.data.map((x: AnyRecord) => ({ _liveType: "SOS", ...x })) : []),
    ]);
  } catch (error) { setMessage(cleanError(error)); }
}

function EventsPanel(props: {
  records: AnyRecord[];
  eventForm: { id: string; name: string; description: string; startsAt: string; endsAt: string; stopsJson: string; sessionsJson: string };
  setEventForm: (value: Partial<{ id: string; name: string; description: string; startsAt: string; endsAt: string; stopsJson: string; sessionsJson: string }>) => void;
  onSave: () => void;
  onAction: (eventId: string, action: "publish" | "unpublish" | "delete") => void;
  onSelect: (item: AnyRecord) => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <RideXMotionSurface height={72} intensity={0.72} compact label="EVENT / SESSION FLOW" />
      <Text style={styles.sectionTitle}>Event / Sessional Ride</Text>
      <Text style={styles.note}>Backend-authoritative event management. Create a draft with 6–10 ordered stops and at least one session, then publish only after validation. STATE/CITY Admin event access fails closed in the locked backend because Event has no persisted geographic ownership fields.</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{props.eventForm.id ? `Edit Draft • ${props.eventForm.id}` : "Create Event Draft"}</Text>
        <Field label="Event Name" value={props.eventForm.name} onChangeText={(v) => props.setEventForm({ name: v })} placeholder="City Festival Shuttle" />
        <Field label="Description" value={props.eventForm.description} onChangeText={(v) => props.setEventForm({ description: v })} placeholder="Optional description" multiline />
        <Field label="Starts At (ISO 8601, optional)" value={props.eventForm.startsAt} onChangeText={(v) => props.setEventForm({ startsAt: v })} placeholder="2026-10-04T08:00:00+05:30" />
        <Field label="Ends At (ISO 8601, optional)" value={props.eventForm.endsAt} onChangeText={(v) => props.setEventForm({ endsAt: v })} placeholder="2026-10-04T22:00:00+05:30" />
        {!props.eventForm.id ? <>
          <Field label="Stops JSON (6–10 items)" value={props.eventForm.stopsJson} onChangeText={(v) => props.setEventForm({ stopsJson: v })} multiline placeholder={'[{"name":"Stop 1","address":"...","latitude":25.58,"longitude":85.14}]'} />
          <Field label="Sessions JSON (1+ items)" value={props.eventForm.sessionsJson} onChangeText={(v) => props.setEventForm({ sessionsJson: v })} multiline placeholder={'[{"startsAt":"2026-10-04T08:00:00+05:30","endsAt":"2026-10-04T22:00:00+05:30","capacity":4,"fare":30,"startSequence":1,"endSequence":6}]'} />
        </> : <Text style={styles.note}>Stops and sessions are immutable after creation in the locked backend. To change them, unpublish/delete the draft as permitted and create a corrected draft.</Text>}
        <Button title={props.eventForm.id ? "Save Draft Changes" : "Create Event Draft"} onPress={props.onSave} disabled={!props.eventForm.name.trim()} />
        {props.eventForm.id ? <View style={styles.chipRow}>
          <Button title="Publish" onPress={() => props.onAction(props.eventForm.id, "publish")} />
          <Button title="Unpublish" onPress={() => props.onAction(props.eventForm.id, "unpublish")} secondary />
          <Button title="Delete" onPress={() => props.onAction(props.eventForm.id, "delete")} danger />
        </View> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backend Events</Text>
        {props.records.length ? props.records.map((item, index) => <Pressable key={String(item.id || index)} style={styles.rowCard} onPress={() => props.onSelect(item)}>
          <Text style={styles.rowTitle}>{String(item.name || item.title || item.id || "Event")}</Text>
          <Text style={styles.rowSub}>{[item.id, item.active ? "PUBLISHED" : "DRAFT", item.startsAt, item.endsAt].filter(Boolean).join(" • ")}</Text>
          <Text style={styles.rowBody}>{Array.isArray(item.stops) ? `Stops: ${item.stops.length}` : "Stops: backend-defined"} • {Array.isArray(item.sessions) ? `Sessions: ${item.sessions.length}` : "Sessions: backend-defined"}</Text>
        </Pressable>) : <Text style={styles.empty}>No events returned by backend.</Text>}
        <Button title="Refresh Events" onPress={props.onRefresh} secondary />
      </View>
    </>
  );
}
function ToggleButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.toggleChip, active && styles.toggleChipActive]}><Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>{active ? "✓ " : ""}{label}</Text></Pressable>;
}

function LocationMasterPanel(props: {
  city: string; setCity: (v: string) => void; name: string; setName: (v: string) => void; address: string; setAddress: (v: string) => void;
  type: string; setType: (v: string) => void; zone: string; setZone: (v: string) => void; pickupRadiusM: string; setPickupRadiusM: (v: string) => void;
  dropRadiusM: string; setDropRadiusM: (v: string) => void; pickupAllowed: boolean; setPickupAllowed: (v: boolean) => void; dropAllowed: boolean; setDropAllowed: (v: boolean) => void;
  photoUri: string; coordinate: { latitude: number; longitude: number } | null; records: AnyRecord[]; search: string; setSearch: (v: string) => void;
  onCaptureLocation: () => void; onCapturePhoto: () => void; onSave: () => void; onLoad: () => void; onToggle: (id: string, active: boolean) => void;
}) {
  const filtered = props.records.filter((item) => {
    const q = props.search.trim().toLowerCase();
    if (!q) return true;
    return [item.name, item.city, item.address, item.category, item.type].some((value) => String(value || "").toLowerCase().includes(q));
  });
  return <>
    <RideXMotionSurface height={68} intensity={0.5} compact label="CITY LOCATION MASTER" />
    <Text style={styles.sectionTitle}>City Location Master</Text>
    <Text style={styles.note}>Create reusable RideX locations once. Admin captures the current GPS position and a real site photo; the same location can then be reused by many routes and customer A→B matches.</Text>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>1. Capture Location</Text>
      <Field label="City" value={props.city} onChangeText={props.setCity} placeholder="Katihar" />
      <Field label="Location Name" value={props.name} onChangeText={props.setName} placeholder="Katihar Railway Station" />
      <Field label="Address" value={props.address} onChangeText={props.setAddress} placeholder="Auto-filled from reverse geocoding" />
      <Field label="Location Category / Type" value={props.type} onChangeText={props.setType} placeholder="STATION / LANDMARK / PICKUP_POINT" />
      <View style={styles.mapCard}>{props.coordinate ? <MapView style={styles.liveMap} initialRegion={{ latitude: props.coordinate.latitude, longitude: props.coordinate.longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }} region={{ latitude: props.coordinate.latitude, longitude: props.coordinate.longitude, latitudeDelta: 0.006, longitudeDelta: 0.006 }}><Marker coordinate={props.coordinate} title={props.name || "RideX Location"} /></MapView> : <View style={styles.mapPlaceholder}><Text style={styles.mapPlaceholderTitle}>No location captured</Text><Text style={styles.note}>Use device GPS to place the location exactly.</Text></View>}</View>
      <Button title="Capture Current Location" onPress={props.onCaptureLocation} secondary />
      <View style={styles.photoCard}>{props.photoUri ? <Image source={{ uri: props.photoUri }} style={styles.locationPhoto} /> : <Text style={styles.note}>A real location photo is required. Take it from the Admin camera.</Text>}</View>
      <Button title={props.photoUri ? "Retake Location Photo" : "Take Location Photo"} onPress={props.onCapturePhoto} secondary />
      <View style={styles.grid}><View style={styles.halfField}><Field label="Pickup Radius (m)" value={props.pickupRadiusM} onChangeText={props.setPickupRadiusM} keyboardType="numeric" /></View><View style={styles.halfField}><Field label="Drop Radius (m)" value={props.dropRadiusM} onChangeText={props.setDropRadiusM} keyboardType="numeric" /></View></View>
      <View style={styles.chipRow}><ToggleButton label="Pickup Allowed" active={props.pickupAllowed} onPress={() => props.setPickupAllowed(!props.pickupAllowed)} /><ToggleButton label="Drop Allowed" active={props.dropAllowed} onPress={() => props.setDropAllowed(!props.dropAllowed)} /></View>
      <Button title="Save City Location" onPress={props.onSave} disabled={!props.city.trim() || !props.name.trim() || !props.coordinate || !props.photoUri} />
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Location Library</Text><Field label="Search" value={props.search} onChangeText={props.setSearch} placeholder="Name / address / zone" /><Button title="Refresh Locations" onPress={props.onLoad} secondary />{filtered.length === 0 ? <Text style={styles.empty}>No locations returned for this city/search.</Text> : filtered.map((item, i) => <View key={String(item.id || i)} style={styles.rowCard}><View style={styles.inlineHeader}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{String(item.name || "Location")}</Text><Text style={styles.rowSub}>{[item.city, item.category, item.type, item.active ? "ACTIVE" : "INACTIVE"].filter(Boolean).join(" • ")}</Text></View><AssetIcon name="location" size={21} /></View><Text style={styles.rowBody}>{String(item.address || "No address")}\n{item.latitude}, {item.longitude}</Text><Button title={item.active ? "Deactivate" : "Activate"} onPress={() => props.onToggle(String(item.id || ""), !Boolean(item.active))} secondary /></View>)}</View>
  </>;
}

function RouteBuilderPanel(props: {
  city: string; setCity: (v: string) => void; name: string; setName: (v: string) => void; serviceType: string; setServiceType: (v: string) => void;
  vehicleType: string; setVehicleType: (v: string) => void; mode: string; setMode: (v: string) => void; coverageZones: string; setCoverageZones: (v: string) => void;
  locationSearch: string; setLocationSearch: (v: string) => void; startId: string; setStartId: (v: string) => void; endId: string; setEndId: (v: string) => void;
  stopIds: string[]; toggleStop: (id: string) => void; moveStop: (id: string, direction: -1 | 1) => void; driverIds: string[]; toggleDriver: (id: string) => void;
  locations: AnyRecord[]; drivers: AnyRecord[]; routeRecords: AnyRecord[]; rules: AnyRecord; setRules: (v: AnyRecord) => void; onLoad: () => void; onCreate: () => void; onToggle: (id: string, active: boolean) => void;
}) {
  const filteredLocations = props.locations.filter((item) => !props.locationSearch.trim() || [item.name, item.address, item.zone].some((v) => String(v || "").toLowerCase().includes(props.locationSearch.trim().toLowerCase())));
  const selectedLocations = props.stopIds.map((id) => props.locations.find((item) => String(item.id) === id)).filter(Boolean) as AnyRecord[];
  const coordPoints = [props.startId, ...props.stopIds, props.endId].map((id) => props.locations.find((item) => String(item.id) === id)).filter((item): item is AnyRecord => Boolean(item && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))));
  const setRule = (key: string, value: string) => props.setRules({ ...props.rules, [key]: value });
  return <>
    <RideXMotionSurface height={68} intensity={0.54} compact label="ROUTE BUILDER" />
    <Text style={styles.sectionTitle}>Route Builder</Text>
    <Text style={styles.note}>Build one reusable route from the City Location Master. Configure start/end, ordered stops, service/vehicle, driver coverage and automatic/hybrid matching rules once; Customer A→B rides can then use the route automatically.</Text>
    <View style={styles.card}><Text style={styles.cardTitle}>Route Definition</Text><Field label="City" value={props.city} onChangeText={props.setCity} placeholder="Katihar" /><Field label="Route Name" value={props.name} onChangeText={props.setName} placeholder="Katihar Main Route 01" /><View style={styles.chipRow}>{["PASSENGER","PARCEL","GOODS","BOTH"].map((value) => <ToggleButton key={value} label={value} active={props.serviceType === value} onPress={() => props.setServiceType(value)} />)}</View><View style={styles.chipRow}>{["E_RICKSHAW","PICKUP_TRUCK"].map((value) => <ToggleButton key={value} label={value} active={props.vehicleType === value} onPress={() => props.setVehicleType(value)} />)}</View><Text style={styles.subSection}>Matching Mode</Text><View style={styles.chipRow}>{["ADMIN_CONTROLLED","AUTOMATIC","HYBRID"].map((value) => <ToggleButton key={value} label={value} active={props.mode === value} onPress={() => props.setMode(value)} />)}</View><Field label="Coverage Zone IDs (comma separated)" value={props.coverageZones} onChangeText={props.setCoverageZones} placeholder="Katihar Central, Katihar North" /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Start / End / Ordered Stops</Text><Text style={styles.note}>Use saved City Locations only. Start and end are always route stops; intermediate stops are ordered below.</Text>{props.startId ? <Text style={styles.rowSub}>Start: {String(props.locations.find((x) => String(x.id) === props.startId)?.name || props.startId)}</Text> : null}{props.endId ? <Text style={styles.rowSub}>End: {String(props.locations.find((x) => String(x.id) === props.endId)?.name || props.endId)}</Text> : null}<Field label="Find locations" value={props.locationSearch} onChangeText={props.setLocationSearch} placeholder="Search by location name / address / zone" />{filteredLocations.slice(0, 100).map((item, i) => <View key={String(item.id || i)} style={styles.rowCard}><View style={styles.inlineHeader}><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{String(item.name || "Location")}</Text><Text style={styles.rowSub}>{[item.city, item.zone, item.locationType].filter(Boolean).join(" • ")}</Text></View></View><View style={styles.actionRow}><Button title={props.startId === String(item.id) ? "Start Selected" : "Set Start"} onPress={() => props.setStartId(String(item.id))} secondary/><Button title={props.endId === String(item.id) ? "End Selected" : "Set End"} onPress={() => props.setEndId(String(item.id))} secondary/><Button title={props.stopIds.includes(String(item.id)) ? "Remove Stop" : "Add Stop"} onPress={() => props.toggleStop(String(item.id))} secondary/></View></View>)}<Text style={styles.subSection}>Route Stop Order</Text>{selectedLocations.length === 0 ? <Text style={styles.empty}>No intermediate stops added.</Text> : selectedLocations.map((item, index) => <View key={String(item.id)} style={styles.rowCard}><Text style={styles.rowTitle}>{index + 1}. {String(item.name || item.id)}</Text><Text style={styles.rowSub}>{String(item.address || "")}</Text><View style={styles.actionRow}><Button title="↑" onPress={() => props.moveStop(String(item.id), -1)} secondary/><Button title="↓" onPress={() => props.moveStop(String(item.id), 1)} secondary/><Button title="Remove" onPress={() => props.toggleStop(String(item.id))} danger/></View></View>)}</View>
    {coordPoints.length >= 2 ? <View style={styles.mapCard}><MapView style={styles.liveMap} initialRegion={{ latitude: Number(coordPoints[0].latitude), longitude: Number(coordPoints[0].longitude), latitudeDelta: 0.08, longitudeDelta: 0.08 }}><Polyline coordinates={coordPoints.map((item) => ({ latitude: Number(item.latitude), longitude: Number(item.longitude) }))} strokeWidth={5} strokeColor={WEB_ADMIN_COLORS.primary} />{coordPoints.map((item, index) => <Marker key={`${item.id}-${index}`} coordinate={{ latitude: Number(item.latitude), longitude: Number(item.longitude) }} title={`${index + 1}. ${item.name || item.id}`} />)}</MapView><View style={styles.mapLegend}><Text style={styles.mapLegendText}>{coordPoints.length} route points configured</Text></View></View> : null}
    <View style={styles.card}><Text style={styles.cardTitle}>Driver Coverage</Text><Text style={styles.note}>For Admin Controlled/Hybrid routes, select the drivers who are allowed to receive requests from this route. Automatic mode may leave this empty so the backend selects from eligible route coverage.</Text>{props.drivers.length === 0 ? <Text style={styles.empty}>No drivers returned.</Text> : props.drivers.slice(0, 100).map((driver, i) => <ToggleButton key={String(driver.id || i)} label={`${driver.fullName || driver.id || "Driver"}${driver.driverStatus ? ` • ${driver.driverStatus}` : ""}`} active={props.driverIds.includes(String(driver.id))} onPress={() => props.toggleDriver(String(driver.id))} />)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Route Matching Rules</Text><Field label="Pickup Radius (m)" value={String(props.rules.pickupRadiusM || "")} onChangeText={(v) => setRule("pickupRadiusM", v)} keyboardType="numeric" /><Field label="Drop Radius (m)" value={String(props.rules.dropRadiusM || "")} onChangeText={(v) => setRule("dropRadiusM", v)} keyboardType="numeric" /><Field label="Max Pickup Distance (km)" value={String(props.rules.maxPickupDistanceKm || "")} onChangeText={(v) => setRule("maxPickupDistanceKm", v)} keyboardType="decimal-pad" /><Field label="Max Detour (km)" value={String(props.rules.maxDetourKm || "")} onChangeText={(v) => setRule("maxDetourKm", v)} keyboardType="decimal-pad" /><Field label="Max ETA (minutes)" value={String(props.rules.maxEtaMinutes || "")} onChangeText={(v) => setRule("maxEtaMinutes", v)} keyboardType="numeric" /><Field label="GPS Freshness (seconds)" value={String(props.rules.gpsFreshnessSeconds || "")} onChangeText={(v) => setRule("gpsFreshnessSeconds", v)} keyboardType="numeric" /><Field label="Offer Timeout (seconds)" value={String(props.rules.offerTimeoutSeconds || "")} onChangeText={(v) => setRule("offerTimeoutSeconds", v)} keyboardType="numeric" /><Field label="Retry Count" value={String(props.rules.retryCount || "")} onChangeText={(v) => setRule("retryCount", v)} keyboardType="numeric" /><Button title="Save Route Draft" onPress={props.onCreate} /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Configured Routes</Text><Button title="Refresh Routes" onPress={props.onLoad} secondary />{props.routeRecords.length === 0 ? <Text style={styles.empty}>No routes returned by backend.</Text> : props.routeRecords.map((route, i) => <View key={String(route.id || i)} style={styles.rowCard}><Text style={styles.rowTitle}>{String(route.name || route.id || "Route")}</Text><Text style={styles.rowSub}>{[route.city, route.serviceType, route.vehicleType, route.matchingMode, route.active ? "ACTIVE" : "DRAFT"].filter(Boolean).join(" • ")}</Text><Text style={styles.rowBody}>{Array.isArray(route.stops) ? `Stops: ${route.stops.length}` : "Stops: backend-defined"} • Drivers: {Array.isArray(route.allowedDriverIds) ? route.allowedDriverIds.length : "auto"}</Text><Button title={route.active ? "Deactivate" : "Activate"} onPress={() => props.onToggle(String(route.id || ""), !Boolean(route.active))} secondary /></View>)}</View>
  </>;
}

function MatchingConfigurationPanel(props: { serviceType: string; setServiceType: (v: string) => void; config: AnyRecord; setConfig: (v: AnyRecord) => void; onLoad: () => void; onSave: () => void }) {
  const set = (key: string, value: string | boolean) => props.setConfig({ ...props.config, [key]: value });
  return <>
    <RideXMotionSurface height={68} intensity={0.48} compact label="MATCHING CONFIGURATION" />
    <Text style={styles.sectionTitle}>Automatic Matching Configuration</Text>
    <Text style={styles.note}>Configure once, then the backend can automatically filter route-compatible drivers using the configured route, zone, GPS, distance, ETA, capacity and detour rules.</Text>
    <View style={styles.card}><Text style={styles.cardTitle}>Apply Rules To</Text><View style={styles.chipRow}>{["DEFAULT"].map((value) => <ToggleButton key={value} label={value} active={props.serviceType === value} onPress={() => props.setServiceType(value)} />)}</View><Text style={styles.subSection}>Driver Selection</Text><View style={styles.chipRow}>{["ADMIN_CONTROLLED","AUTOMATIC","HYBRID"].map((value) => <ToggleButton key={value} label={value} active={props.config.mode === value} onPress={() => set("mode", value)} />)}</View></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Coverage / Eligibility</Text><Field label="Pickup Radius (m)" value={String(props.config.pickupRadiusM || "")} onChangeText={(v) => set("pickupRadiusM", v)} keyboardType="numeric" /><Field label="Drop Radius (m)" value={String(props.config.dropRadiusM || "")} onChangeText={(v) => set("dropRadiusM", v)} keyboardType="numeric" /><Field label="Max Pickup Distance (km)" value={String(props.config.maxPickupDistanceKm || "")} onChangeText={(v) => set("maxPickupDistanceKm", v)} keyboardType="decimal-pad" /><Field label="Max Detour (km)" value={String(props.config.maxDetourKm || "")} onChangeText={(v) => set("maxDetourKm", v)} keyboardType="decimal-pad" /><Field label="Max ETA (minutes)" value={String(props.config.maxEtaMinutes || "")} onChangeText={(v) => set("maxEtaMinutes", v)} keyboardType="numeric" /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Realtime Eligibility</Text><Field label="GPS Freshness (seconds)" value={String(props.config.gpsFreshnessSeconds || "")} onChangeText={(v) => set("gpsFreshnessSeconds", v)} keyboardType="numeric" /><Field label="Offer Timeout (seconds)" value={String(props.config.offerTimeoutSeconds || "")} onChangeText={(v) => set("offerTimeoutSeconds", v)} keyboardType="numeric" /><Field label="Retry Count" value={String(props.config.retryCount || "")} onChangeText={(v) => set("retryCount", v)} keyboardType="numeric" /><View style={styles.chipRow}><ToggleButton label="Enable Fallback" active={Boolean(props.config.fallbackEnabled)} onPress={() => set("fallbackEnabled", !Boolean(props.config.fallbackEnabled))} /><ToggleButton label="Online Only" active={Boolean(props.config.onlineOnly)} onPress={() => set("onlineOnly", !Boolean(props.config.onlineOnly))} /><ToggleButton label="Prefer Exact Route" active={Boolean(props.config.preferExactRoute)} onPress={() => set("preferExactRoute", !Boolean(props.config.preferExactRoute))} /></View><Button title="Save Matching Configuration" onPress={props.onSave} /><Button title="Reload Backend Configuration" onPress={props.onLoad} secondary /></View>
  </>;
}

function AdminMobileDrawer({
  visible,
  onClose,
  role,
  currentPanel,
  onOpen,
  onRefresh,
  onLogout,
}: {
  visible: boolean;
  onClose: () => void;
  role: string;
  currentPanel: Panel;
  onOpen: (panel: Panel) => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const allowed = new Set(ROLE_PANEL_ACCESS[String(role || "").toUpperCase()] ?? []);
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.drawerOverlay}>
        <Pressable style={styles.drawerBackdrop} onPress={onClose} />
        <SafeAreaView style={styles.drawerSheet}>
          <View style={styles.drawerHeader}>
            <View style={styles.drawerBrandRow}>
              <AdminBrandLogo compact />
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerBrand}>RIDEX ADMIN</Text>
                <Text style={styles.drawerRole}>{String(role || "ADMIN").replaceAll("_", " ")}</Text>
              </View>
            </View>
            <Pressable style={styles.drawerClose} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu">
              <Text style={styles.drawerCloseText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.drawerStatus}>
            <View style={styles.drawerStatusDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.drawerStatusTitle}>Admin Workspace</Text>
              <Text style={styles.drawerStatusSub}>Role and permissions are backend-authoritative.</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.drawerScroll} showsVerticalScrollIndicator={false}>
            {MOBILE_NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) => allowed.has(item));
              if (!items.length) return null;
              return (
                <View key={group.label} style={styles.drawerGroup}>
                  <Text style={styles.drawerGroupLabel}>{group.label}</Text>
                  {items.map((item) => {
                    const meta = PANEL_META[item];
                    const active = currentPanel === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => { onClose(); onOpen(item); }}
                        style={[styles.drawerItem, active && styles.drawerItemActive]}
                      >
                        <View style={[styles.drawerItemIcon, active && styles.drawerItemIconActive]}>
                          <AssetIcon name={item === "dashboard" ? "dashboard" : item} size={18} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.drawerItemTitle, active && styles.drawerItemTitleActive]}>{meta?.title || item}</Text>
                          {active ? <Text style={styles.drawerItemSub}>Currently open</Text> : null}
                        </View>
                        <Text style={[styles.drawerArrow, active && styles.drawerItemTitleActive]}>›</Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.drawerFooter}>
            <View style={styles.drawerFooterActions}>
              <Pressable style={styles.drawerFooterButton} onPress={() => { onClose(); onRefresh(); }}>
                <AssetIcon name="refresh" size={17} />
                <Text style={styles.drawerFooterText}>Refresh</Text>
              </Pressable>
              <Pressable style={[styles.drawerFooterButton, styles.drawerLogoutButton]} onPress={() => { onClose(); onLogout(); }}>
                <Text style={styles.drawerLogoutText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function DashboardPanel({ dashboard, onOpen, role }: { dashboard: Dashboard | null; onOpen: (p: Panel) => void; role: string }) {
  const cards: Array<[string,string,string,Panel]> = [
    ['live','Live Operations','Drivers, active rides, requests, GPS and SOS','live'],
    ['drivers','Drivers / KYC','Driver approval, documents and status controls','drivers'],
    ['vehicle','Vehicles','Vehicle verification and eligibility view','vehicles'],
    ['route','Route Builder','City locations, ordered stops, driver coverage and route activation','route-builder'],
    ['location','Location Master','Capture GPS, photo, city and reusable ride locations','locations'],
    ['matching','Matching Config','One-time route, driver, radius, ETA and fallback rules','matching-config'],
    ['customers','Customers','Customer records and history','customers'],
    ['bookings','Bookings','Booking, leg and trip operations','bookings'],
    ['payments','Payments','Payment state, refunds and transactions','payments'],
    ['finance','Driver Settlements','Earnings, payouts and settlements','finance'],
    ['events','Events / Sessions','Fixed 6–10 stops, sessions and publish','events'],
    ['promotions','Promotions','Coupons and offers','promotions'],
    ['pricing','Pricing','Ride, Sharing, Connecting, Logistic Parcel, Logistic Goods, Event','pricing'],
    ['zones','City Zones','Service areas and connection points','zones'],
    ['safety','Safety / SOS','Safety incidents and SOS operations','safety'],
    ['support','Support','Cases, messages and resolution','support'],
    ['notifications','Notifications','Customer / Driver broadcasts and alerts','notifications'],
    ['reports','Reports','Deterministic operational summaries','reports'],
    ['admins','Admin Users','Create and manage authorized admins','admins'],
    ['activity','Admin Presence','Super Admin-only sessions, login source and online/offline status','presence'],
    ['roles','Roles / Permissions','RBAC permission assignment','roles'],
    ['audit','Audit Logs','Security and configuration audit','audit'],
    ['settings','Settings / Security','Secure configuration status','settings'],
    ['platform','TEST / LIVE','Release, promotion and environment controls','platform'],
  ];
  const allowedPanels = new Set(ROLE_PANEL_ACCESS[String(role || "").toUpperCase()] ?? []);
  const visibleCards = cards.filter(([, , , panel]) => allowedPanels.has(panel));
  const normalizedRole = String(role || "").toUpperCase();
  const snapshotCards: Array<[string, number | undefined, "green" | "blue" | "orange" | "red"]> =
    normalizedRole === "FINANCE"
      ? [["Payments", dashboard?.payments, "blue"], ["Bookings", dashboard?.bookings, "orange"], ["Completed", dashboard?.completed, "green"]]
      : normalizedRole === "SAFETY"
        ? [["Open SOS", dashboard?.sos, "red"], ["Ongoing", dashboard?.ongoing, "orange"]]
        : normalizedRole === "SUPPORT"
          ? [["Open Support", dashboard?.openSupport, "red"], ["Customers", dashboard?.customers, "blue"]]
          : normalizedRole === "VERIFICATION_KYC"
            ? [["Pending KYC", dashboard?.pendingKyc, "orange"], ["Drivers", dashboard?.drivers, "blue"]]
            : normalizedRole === "OPERATIONS"
              ? [["Drivers", dashboard?.drivers, "blue"], ["Online Drivers", dashboard?.activeDrivers, "green"], ["Bookings", dashboard?.bookings, "orange"], ["Ongoing", dashboard?.ongoing, "green"], ["Vehicles", dashboard?.vehicles, "blue"], ["Cancelled", dashboard?.cancelled, "red"]]
              : [["Customers", dashboard?.customers, "green"], ["Drivers", dashboard?.drivers, "blue"], ["Active Drivers", dashboard?.activeDrivers, "green"], ["Bookings", dashboard?.bookings, "orange"], ["Completed", dashboard?.completed, "blue"], ["Ongoing", dashboard?.ongoing, "green"], ["Cancelled", dashboard?.cancelled, "red"], ["SOS Open", dashboard?.sos, "red"], ["Vehicles", dashboard?.vehicles, "green"], ["Pending KYC", dashboard?.pendingKyc, "orange"], ["Pending Admins", dashboard?.pendingAdmins, "orange"], ["Open Support", dashboard?.openSupport, "red"]];
  return <>
    <View style={styles.heroCard}>
      <View style={styles.heroOverlay}><Text style={styles.heroTitle}>RideX Admin Command Center</Text><Text style={styles.heroSub}>Manage • Monitor • Secure</Text></View>
    </View>
    <RideXMotionSurface height={72} intensity={0.55} compact label="COMMAND CENTER" badgeLabel="LOAD DRIFT" driftScore={dashboard ? Math.min(1, Number(dashboard.ongoing || 0) / Math.max(1, Number(dashboard.bookings || 1))) * 0.20 : 0} />
    <Text style={styles.sectionTitle}>Platform Snapshot</Text>
    <View style={styles.grid}>
      {snapshotCards.map(([label, value, tone]) => <StatCard key={label} label={label} value={value} tone={tone} />)}
    </View>
    <Text style={styles.sectionTitle}>{normalizedRole === "SUPER_ADMIN" ? "Super Admin Command Center" : `${normalizedRole.replaceAll("_", " ")} Work Center`}</Text>
    {visibleCards.map(([icon,title,sub,panel]) => <ModuleCard key={panel} icon={icon} title={title} subtitle={sub} onPress={() => onOpen(panel)} />)}
    {TEST_MODE ? <ModuleCard icon="test-data" title="TEST Data Lab" subtitle="Seed, inspect and remove isolated TEST records" onPress={() => onOpen("test-data")} /> : null}
  </>;
}

function SettlementPanel({ records, onRefresh, filter, setFilter }: { records: AnyRecord[]; onRefresh: () => void; filter: string; setFilter: (v: string) => void }) {
  return <><Text style={styles.sectionTitle}>Driver Settlements / Finance</Text><Text style={styles.note}>Read-only settlement visibility. Financial payout execution remains backend-authorized and audited.</Text><Field label="Settlement status filter" value={filter || ""} onChangeText={setFilter} placeholder="PENDING / PROCESSING / SUCCESS / FAILED / ON_HOLD" /><Button title="Refresh Settlements" onPress={onRefresh} secondary />{records.length === 0 ? <Text style={styles.empty}>No settlement records returned by backend.</Text> : records.map((item, i) => <RowCard key={String(item.id || i)} item={item} />)}</>;
}

function ListPanel({ title, records, onRefresh, onSelect, filter, setFilter }: { title: string; records: AnyRecord[]; onRefresh: () => void; onSelect?: (item: AnyRecord) => void; filter?: string; setFilter?: (v: string) => void }) {
  return <><Text style={styles.sectionTitle}>{title}</Text>{setFilter ? <Field label="Status filter" value={filter || ""} onChangeText={setFilter} placeholder="e.g. COMPLETED" /> : null}<Button title="Refresh" onPress={onRefresh} secondary />{records.length === 0 ? <Text style={styles.empty}>No records returned by backend.</Text> : records.map((item, i) => <RowCard key={String(item.id || i)} item={item} onPress={() => onSelect?.(item)} />)}</>;
}

function coordFromRecord(item: AnyRecord) {
  const candidates = [item.location, item.currentLocation, item.driverLocation, item.gps, item.position, item];
  for (const c of candidates) {
    const lat = Number(c?.latitude ?? c?.lat);
    const lng = Number(c?.longitude ?? c?.lng ?? c?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { latitude: lat, longitude: lng };
  }
  return null;
}

function LivePanel({ records, onRefresh, realtimeConnected, realtimeEvents }: { records: AnyRecord[]; onRefresh: () => void; realtimeConnected: boolean; realtimeEvents: RideXStreamEvent[] }) {
  const latestEventAt = realtimeEvents[0]?.createdAt || null;
  const operationalDrift = computeOperationalDriftScore(latestEventAt, 45);
  const points = records.map(coordFromRecord).filter(Boolean) as Array<{latitude:number;longitude:number}>;
  const center = points[0] || { latitude: 25.5941, longitude: 85.1376 };
  return <>
    <RideXMotionSurface height={70} intensity={0.62} compact label={realtimeConnected ? "LIVE EVENT FLOW" : "SYNC FALLBACK"} badgeLabel="SYNC DRIFT" driftScore={operationalDrift} />
    <Text style={styles.sectionTitle}>Live Operations</Text>
    <Text style={styles.note}>Backend remains authoritative. SSE is used for live events; refresh is the deterministic fallback.</Text>
    <View style={styles.mapCard}>
      <MapView style={styles.liveMap} initialRegion={{ ...center, latitudeDelta: 0.16, longitudeDelta: 0.16 }}>
        {points.map((point, i) => <Marker key={`${point.latitude}-${point.longitude}-${i}`} coordinate={point} title={`Live record ${i + 1}`} />)}
      </MapView>
      <View style={styles.mapLegend}><AssetIcon name="live" size={18} /><Text style={styles.mapLegendText}>{points.length} mappable operational points</Text></View>
    </View>
    <View style={styles.card}><View style={styles.inlineHeader}><View><Text style={styles.cardTitle}>{realtimeConnected ? "Realtime LIVE" : "Realtime reconnecting / fallback"}</Text><Text style={styles.rowSub}>Events received: {realtimeEvents.length}</Text></View><Button title="Refresh" onPress={onRefresh} secondary /></View></View>
    <Text style={styles.subSection}>Recent Realtime Events</Text>
    {realtimeEvents.length ? realtimeEvents.slice(0,20).map((event,i)=><View key={`${event.id || event.createdAt || i}`} style={styles.rowCard}><View style={styles.rowIconWrap}><AssetIcon name={String(event.type || '').includes('SOS') ? 'sos' : String(event.type || '').includes('DRIVER') ? 'drivers' : 'notifications'} size={20}/></View><View style={{flex:1}}><Text style={styles.rowTitle}>{String(event.type || 'EVENT')}</Text><Text style={styles.rowSub}>{[event.bookingId,event.driverId,event.customerId,event.createdAt].filter(Boolean).join(' • ')}</Text>{event.payload ? <Text style={styles.rowBody}>{JSON.stringify(event.payload).slice(0,220)}</Text> : null}</View></View>) : <Text style={styles.empty}>No realtime events received yet.</Text>}
    <Text style={styles.subSection}>Live Driver / Booking / SOS Records</Text>
    {records.map((item,i)=><RowCard key={String(item.id || i)} item={item} />)}
  </>;
}

function MatchingPanel({ records, onRefresh }: { records: AnyRecord[]; onRefresh: () => void }) {
  const active = records.filter((x) => ['NEW','MATCHING','PENDING','REQUESTED','OFFERED','DRIVER_ASSIGNED','DRIVER_ARRIVING'].includes(String(x.status || '').toUpperCase()));
  return <><RideXMotionSurface height={64} intensity={0.52} compact label="MATCHING TELEMETRY" /><Text style={styles.sectionTitle}>Matching / Eligibility</Text><Text style={styles.note}>Read-only operational view derived from authoritative booking data. The Admin client does not create or force driver assignments.</Text><Button title="Refresh Matching View" onPress={onRefresh} secondary />{active.length ? active.map((item,i)=><View key={String(item.id||i)} style={styles.rowCard}><View style={styles.rowIconWrap}><AssetIcon name="matching" size={20}/></View><View style={{flex:1}}><Text style={styles.rowTitle}>{String(item.id || 'Booking')}</Text><Text style={styles.rowSub}>Status: {String(item.status || 'UNKNOWN')} • Service: {String(item.serviceType || item.bookingType || item.rideType || '—')}</Text><Text style={styles.rowBody}>{[item.assignedDriverId,item.vehicleId,item.routeId,item.etaMinutes].filter(Boolean).join(' • ') || 'Waiting for authoritative matching data.'}</Text></View></View>) : <Text style={styles.empty}>No active matching records returned.</Text>}</>;
}

function VehiclePanel({ records, onRefresh }: { records: AnyRecord[]; onRefresh: () => void }) {
  const vehicles = records.flatMap((driver) => (Array.isArray(driver.vehicles) ? driver.vehicles.map((v:any)=>({ ...v, driverId: driver.id, driverName: driver.fullName })) : []));
  return <><Text style={styles.sectionTitle}>Vehicle Management</Text><Text style={styles.note}>Vehicles are shown from Driver details. Verification remains backend-authoritative and is handled from Drivers / KYC actions.</Text><Button title="Refresh Vehicles" onPress={onRefresh} secondary />{vehicles.length ? vehicles.map((item,i)=><RowCard key={String(item.id||i)} item={item} />) : <Text style={styles.empty}>No vehicle records were returned with the driver list.</Text>}</>;
}

function ReportsPanel({ dashboard, records, realtimeEvents }: { dashboard: Dashboard | null; records: AnyRecord[]; realtimeEvents: RideXStreamEvent[] }) {
  const completed = dashboard?.completed;
  const total = dashboard?.bookings;
  const completion = typeof completed === "number" && Number.isFinite(completed) && typeof total === "number" && total > 0
    ? Math.round((completed / total) * 100)
    : undefined;
  const online = dashboard?.activeDrivers;
  const drivers = dashboard?.drivers;
  const onlineRatio = typeof online === "number" && Number.isFinite(online) && typeof drivers === "number" && drivers > 0
    ? Math.round((online / drivers) * 100)
    : undefined;
  return <><RideXMotionSurface height={64} intensity={0.48} compact label="REPORTS / ANALYTICS" /><Text style={styles.sectionTitle}>Operational Reports</Text><Text style={styles.note}>Deterministic summaries from backend dashboard data and the current mobile realtime session. No predictive AI is used.</Text><View style={styles.grid}><StatCard label="Completion Ratio" value={completion} tone="blue" /><StatCard label="Online Driver Ratio" value={onlineRatio} /><StatCard label="Realtime Events" value={realtimeEvents.length} /><StatCard label="Visible Records" value={records.length} /></View><View style={styles.card}><Text style={styles.cardTitle}>Report Definition</Text><Text style={styles.rowBody}>Dashboard and operational modules remain the source for detailed records. This mobile panel exposes summary ratios and counts only; financial and security records remain backend-authoritative.</Text></View></>;
}

function AdminPresencePanel({ records, onRefresh, onRevoke, onRevokeAll }: { records: AnyRecord[]; onRefresh: () => void; onRevoke: (sessionId: string) => void; onRevokeAll: (adminId: string) => void }) {
  const onlineCount = records.filter((item) => String(item.status).toUpperCase() === "ONLINE").length;
  const uniqueAdmins = new Set(records.map((item) => String(item.adminId || "")).filter(Boolean)).size;
  return <>
    <Text style={styles.sectionTitle}>Admin Presence & Sessions</Text>
    <Text style={styles.note}>Super Admin only. Green means recent server activity; red means offline, expired, revoked or no session.</Text>
    <View style={styles.grid}>
      <StatCard label="Total Admins" value={uniqueAdmins} tone="blue" />
      <StatCard label="Online Sessions" value={onlineCount} tone="green" />
      <StatCard label="Offline Sessions" value={Math.max(0, records.length - onlineCount)} tone="red" />
    </View>
    <Button title="Refresh Admin Presence" onPress={onRefresh} secondary disabled={false} />
    {records.length === 0 ? <Text style={styles.empty}>No Admin session records returned.</Text> : records.map((item, index) => {
      const online = String(item.status).toUpperCase() === "ONLINE";
      const adminId = String(item.adminId || "");
      const sessionId = String(item.sessionId || "");
      return <View key={`${adminId}-${sessionId || index}`} style={styles.card}>
        <View style={styles.inlineHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.name || "Admin"}</Text>
            <Text style={styles.rowSub}>{[item.mobile, item.role].filter(Boolean).join(" • ")}</Text>
          </View>
          <View style={[styles.presencePill, online ? styles.presenceOnline : styles.presenceOffline]}>
            <View style={[styles.presenceDot, online ? styles.presenceDotOnline : styles.presenceDotOffline]} />
            <Text style={[styles.presenceText, online ? styles.presenceTextOnline : styles.presenceTextOffline]}>{online ? "ONLINE" : "OFFLINE"}</Text>
          </View>
        </View>
        <Text style={styles.rowBody}>Login: {item.createdAt ? String(item.createdAt) : "No active session"}
{`\n`}Last seen: {item.lastSeenAt ? String(item.lastSeenAt) : "—"}
{`\n`}Device: {item.deviceInfo || "Unknown"}
{`\n`}IP: {item.ipAddress || "—"}
{`\n`}Reason: {item.onlineReason || "—"}</Text>
        <View style={styles.actionRow}>
          {sessionId ? <Button title="Revoke Session" danger onPress={() => Alert.alert("Revoke Admin Session", `Revoke ${item.name || "this session"}?`, [{ text: "Cancel", style: "cancel" }, { text: "Revoke", style: "destructive", onPress: () => onRevoke(sessionId) }])} /> : null}
          <Button title="Revoke All Sessions" secondary onPress={() => Alert.alert("Revoke All Sessions", `Revoke all sessions for ${item.name || "this Admin"}?`, [{ text: "Cancel", style: "cancel" }, { text: "Revoke All", style: "destructive", onPress: () => onRevokeAll(adminId) }])} />
        </View>
      </View>;
    })}
  </>;
}

function OtpSecurityPanel({ configs, selectedPurpose, setSelectedPurpose, draft, setDraft, history, onSelect, onRefresh, onSave, createForm, setCreateForm, onCreate, deleteConfirmation, setDeleteConfirmation, onDelete, onRollback }: { configs: AnyRecord[]; selectedPurpose: string; setSelectedPurpose: (v:string)=>void; draft: AnyRecord; setDraft: (v:AnyRecord)=>void; history: AnyRecord[]; onSelect:(code:string)=>void; onRefresh:()=>void; onSave:()=>void; createForm:AnyRecord; setCreateForm:(v:AnyRecord)=>void; onCreate:()=>void; deleteConfirmation:string; setDeleteConfirmation:(v:string)=>void; onDelete:()=>void; onRollback:(code:string,version:number)=>void }) {
  const setDraftField=(k:string,v:string)=>setDraft({...draft,[k]:v});
  const setCreate=(k:string,v:string)=>setCreateForm({...createForm,[k]:v});
  return <><Text style={styles.sectionTitle}>OTP Security Configuration</Text><Text style={styles.note}>Authorized Security/System Configuration admins manage purpose code, category, delivery method, expiry, attempt limit, resend policy, retry settings, history and rollback. Existing active OTPs keep their generation-time snapshot.</Text><Button title="Refresh OTP Configurations" onPress={onRefresh} secondary />
    <Text style={styles.subSection}>Configured Purpose Codes</Text>
    {configs.length ? configs.map((cfg,i)=><Pressable key={String(cfg.purposeCode||i)} style={[styles.rowCard, selectedPurpose===String(cfg.purposeCode) && styles.selectedRow]} onPress={()=>onSelect(String(cfg.purposeCode))}><View style={styles.rowIconWrap}><AssetIcon name={String(cfg.purposeCategory||'')==='AUTH'?'settings':'audit'} size={20}/></View><View style={{flex:1}}><Text style={styles.rowTitle}>{String(cfg.purposeCode)}</Text><Text style={styles.rowSub}>{String(cfg.purposeCategory)} • {String(cfg.deliveryMethod)} • v{String(cfg.globalVersion ?? '—')} • {cfg.active===false?'INACTIVE':'ACTIVE'}</Text></View></Pressable>) : <Text style={styles.empty}>No OTP configurations returned. Permission may be required.</Text>}
    {selectedPurpose ? <><View style={styles.card}><Text style={styles.cardTitle}>Current: {selectedPurpose}</Text>{['purposeCategory','deliveryMethod','expirySeconds','wrongAttemptLimit','resendIntervalSeconds','maximumResends','cooldownSeconds','notificationRetryCount','notificationRetryIntervalSeconds'].map((key)=><Field key={key} label={key} value={String(draft[key] ?? '')} onChangeText={(v)=>setDraftField(key,v)} keyboardType={key.toLowerCase().includes('seconds') || key.includes('Limit') || key.includes('Resends') || key.includes('Count') ? 'numeric' : 'default'} />)}<Button title="Save OTP Configuration" onPress={onSave} /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Configuration History</Text>{history.length ? history.map((h,i)=><View key={String(h.id||i)} style={styles.historyRow}><View style={{flex:1}}><Text style={styles.rowTitle}>Version {String(h.globalVersion ?? '—')}</Text><Text style={styles.rowSub}>{String(h.changeType||'CHANGE')} • {String(h.changedByAdminId||'—')} {h.sourceVersion ? `• Source ${h.sourceVersion}` : ''}</Text></View><Button title={`Rollback`} onPress={()=>onRollback(selectedPurpose,Number(h.globalVersion))} secondary /></View>) : <Text style={styles.empty}>No history loaded.</Text>}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Delete Purpose Code</Text><Text style={styles.note}>Deletion is destructive under the locked lifecycle rule and cannot be restored.</Text><Field label="Confirmation" value={deleteConfirmation} onChangeText={setDeleteConfirmation} placeholder={`DELETE OTP PURPOSE ${selectedPurpose}`} /><Button title="Delete Purpose Code" onPress={onDelete} danger /></View></> : null}
    <View style={styles.card}><Text style={styles.cardTitle}>Create Purpose Code</Text><Field label="Purpose Code" value={String(createForm.purposeCode||'')} onChangeText={(v)=>setCreate('purposeCode',v)} placeholder="ROLE.CATEGORY.EXACT_ACTION" /><Field label="Purpose Category" value={String(createForm.purposeCategory||'AUTH')} onChangeText={(v)=>setCreate('purposeCategory',v)} /><Field label="Delivery Method" value={String(createForm.deliveryMethod||'PROVIDER_OTP')} onChangeText={(v)=>setCreate('deliveryMethod',v)} /><Button title="Create Purpose Code" onPress={onCreate} /></View>
  </>;
}

function WorkingRoutesPanel({ routeDriverId, setRouteDriverId, routeMeta, records, routeForm, setRouteForm, onLoad, onCreate, onReview, onDelete }: { routeDriverId:string; setRouteDriverId:(v:string)=>void; routeMeta:AnyRecord|null; records:AnyRecord[]; routeForm:AnyRecord; setRouteForm:(v:AnyRecord)=>void; onLoad:()=>void; onCreate:()=>void; onReview:(id:string,status:'APPROVED'|'REJECTED'|'PENDING')=>void; onDelete:(id:string)=>void }) {
  const set=(k:string,v:string|boolean)=>setRouteForm({...routeForm,[k]:v});
  return <><RideXMotionSurface height={64} intensity={0.5} compact label="DRIVER WORKING ROUTES" /><Text style={styles.sectionTitle}>Driver Working Routes</Text><Text style={styles.note}>Admin-controlled routes must be active and APPROVED before matching can use them. The current API exposes name, sequence, start/end coordinates, active state and review lifecycle.</Text><Field label="Driver ID" value={routeDriverId} onChangeText={setRouteDriverId} placeholder="Driver ID" /><Button title="Load Driver Routes" onPress={onLoad} secondary />{routeMeta ? <View style={styles.statusPill}><AssetIcon name="route" size={18}/><Text style={styles.statusPillText}>{Number(routeMeta.activeCount||0)} active / max {Number(routeMeta.maxActiveRoutes||5)}</Text></View> : null}
    {records.map((route,i)=><View key={String(route.id||i)} style={styles.card}><View style={styles.inlineHeader}><View style={{flex:1}}><Text style={styles.cardTitle}>{String(route.name||'Working Route')}</Text><Text style={styles.rowSub}>Seq {String(route.sequence||'—')} • {String(route.status||'—')} • {route.active?'ACTIVE':'INACTIVE'}</Text></View><AssetIcon name={route.status==='APPROVED'?'check':'route'} size={22}/></View><Text style={styles.rowBody}>Start: {String(route.startLat ?? '—')}, {String(route.startLng ?? '—')} • End: {String(route.endLat ?? '—')}, {String(route.endLng ?? '—')}</Text><View style={styles.actionRow}><Button title="Approve" onPress={()=>onReview(String(route.id),'APPROVED')} secondary/><Button title="Reject" onPress={()=>onReview(String(route.id),'REJECTED')} secondary/><Button title="Delete" onPress={()=>onDelete(String(route.id))} danger/></View></View>)}
    <View style={styles.card}><Text style={styles.cardTitle}>Create Working Route</Text><Field label="Route Name" value={String(routeForm.name||'')} onChangeText={(v)=>set('name',v)} /><Field label="Sequence" value={String(routeForm.sequence||'')} onChangeText={(v)=>set('sequence',v)} keyboardType="numeric" /><Field label="Start Latitude" value={String(routeForm.startLat||'')} onChangeText={(v)=>set('startLat',v)} keyboardType="numeric" /><Field label="Start Longitude" value={String(routeForm.startLng||'')} onChangeText={(v)=>set('startLng',v)} keyboardType="numeric" /><Field label="End Latitude" value={String(routeForm.endLat||'')} onChangeText={(v)=>set('endLat',v)} keyboardType="numeric" /><Field label="End Longitude" value={String(routeForm.endLng||'')} onChangeText={(v)=>set('endLng',v)} keyboardType="numeric" /><Button title="Create Route" onPress={onCreate} /></View>
    <View style={styles.warningBox}><AssetIcon name="route" size={18}/><Text style={styles.warningText}>Advanced Blueprint requirements such as unlimited stop entities, direction, distance method, service-wise limits, schedules and deviation are not exposed by the current mobile Admin API contract, so this client does not fabricate those fields into requests.</Text></View>
  </>;
}

function BroadcastPanel({ audience, setAudience, title, setTitle, body, setBody, onSend, loading }: { audience: string; setAudience: (v: string) => void; title: string; setTitle: (v: string) => void; body: string; setBody: (v: string) => void; onSend: () => void; loading: boolean }) {
  return <><Text style={styles.sectionTitle}>Notification Broadcast</Text><Field label="Audience" value={audience} onChangeText={setAudience} placeholder="ALL / CUSTOMERS / DRIVERS" /><Field label="Title" value={title} onChangeText={setTitle} /><Field label="Body" value={body} onChangeText={setBody} multiline /><Button title="Send Broadcast" onPress={onSend} disabled={loading} loading={loading} /></>;
}

function PromotionPanel({ records, promotion, setPromotion, onCreate, onReload }: { records: AnyRecord[]; promotion: AnyRecord; setPromotion: (v: any) => void; onCreate: () => void; onReload: () => void }) {
  const set = (key: string, value: string) => setPromotion({ ...promotion, [key]: value });
  return <><Text style={styles.sectionTitle}>Promotions</Text><Field label="Code" value={promotion.code} onChangeText={(v) => set("code", v)} /><Field label="Description" value={promotion.description} onChangeText={(v) => set("description", v)} /><Field label="Discount Type" value={promotion.discountType} onChangeText={(v) => set("discountType", v)} /><Field label="Discount Value" value={promotion.discountValue} onChangeText={(v) => set("discountValue", v)} keyboardType="numeric" /><Field label="Max Discount" value={promotion.maxDiscount} onChangeText={(v) => set("maxDiscount", v)} keyboardType="numeric" /><Field label="Minimum Fare" value={promotion.minFare} onChangeText={(v) => set("minFare", v)} keyboardType="numeric" /><Field label="Valid From" value={promotion.validFrom} onChangeText={(v) => set("validFrom", v)} placeholder="ISO datetime" /><Field label="Valid Until" value={promotion.validUntil} onChangeText={(v) => set("validUntil", v)} placeholder="ISO datetime" /><Field label="Ride Scope" value={promotion.rideScope} onChangeText={(v) => set("rideScope", v)} /><Button title="Create Promotion" onPress={onCreate} /><Button title="Reload Promotions" onPress={onReload} secondary />{records.map((item, i) => <RowCard key={String(item.id || i)} item={item} />)}</>;
}

function PricingPanel({ records, pricing, setPricing, onCreate }: { records: AnyRecord[]; pricing: AnyRecord; setPricing: (v: any) => void; onCreate: () => void }) {
  const set = (key: string, value: string) => setPricing({ ...pricing, [key]: value });
  return <><Text style={styles.sectionTitle}>Admin Pricing Rules</Text><Text style={styles.note}>Pricing is backend-authoritative. These fields create or review rules; customer fare calculation remains server-side.</Text><Field label="Name" value={pricing.name} onChangeText={(v) => set("name", v)} /><Field label="Service Type" value={pricing.serviceType} onChangeText={(v) => set("serviceType", v)} /><Field label="Booking Type" value={pricing.bookingType} onChangeText={(v) => set("bookingType", v)} /><Field label="Ride Type" value={pricing.rideType} onChangeText={(v) => set("rideType", v)} /><Field label="Vehicle Type" value={pricing.vehicleType} onChangeText={(v) => set("vehicleType", v)} /><Field label="Base Fare" value={pricing.baseFare} onChangeText={(v) => set("baseFare", v)} keyboardType="numeric" /><Field label="Per KM" value={pricing.perKm} onChangeText={(v) => set("perKm", v)} keyboardType="numeric" /><Field label="Per Minute" value={pricing.perMinute} onChangeText={(v) => set("perMinute", v)} keyboardType="numeric" /><Field label="Waiting / Minute" value={pricing.waitingPerMinute} onChangeText={(v) => set("waitingPerMinute", v)} keyboardType="numeric" /><Field label="Weight / KG" value={pricing.weightPerKg} onChangeText={(v) => set("weightPerKg", v)} keyboardType="numeric" /><Field label="Multiplier" value={pricing.multiplier} onChangeText={(v) => set("multiplier", v)} keyboardType="numeric" /><Field label="Minimum Fare" value={pricing.minFare} onChangeText={(v) => set("minFare", v)} keyboardType="numeric" /><Field label="Maximum Fare" value={pricing.maxFare} onChangeText={(v) => set("maxFare", v)} keyboardType="numeric" /><Field label="Priority" value={pricing.priority} onChangeText={(v) => set("priority", v)} keyboardType="numeric" /><Button title="Create Pricing Rule" onPress={onCreate} />{records.map((item, i) => <RowCard key={String(item.id || i)} item={item} />)}</>;
}

function ZonePanel({ records, zone, setZone, onCreate }: { records: AnyRecord[]; zone: AnyRecord; setZone: (v: any) => void; onCreate: () => void }) {
  const set = (key: string, value: string) => setZone({ ...zone, [key]: value });
  return <><Text style={styles.sectionTitle}>City Zones</Text><Field label="Zone Name" value={zone.name} onChangeText={(v) => set("name", v)} /><Field label="City" value={zone.city} onChangeText={(v) => set("city", v)} /><Field label="Center Latitude" value={zone.centerLat} onChangeText={(v) => set("centerLat", v)} keyboardType="numeric" /><Field label="Center Longitude" value={zone.centerLng} onChangeText={(v) => set("centerLng", v)} keyboardType="numeric" /><Field label="Radius KM" value={zone.radiusKm} onChangeText={(v) => set("radiusKm", v)} keyboardType="numeric" /><Field label="InterCity Point" value={zone.connectionPoint} onChangeText={(v) => set("connectionPoint", v)} placeholder="true / false" /><Button title="Create Zone" onPress={onCreate} />{records.map((item, i) => <RowCard key={String(item.id || i)} item={item} />)}</>;
}

function AdminUsersPanel({ records, confirmation, setConfirmation, adminForm, setAdminForm, onCreate, onAction }: { records: AnyRecord[]; confirmation: string; setConfirmation: (v: string) => void; adminForm: AnyRecord; setAdminForm: (v: any) => void; onCreate: () => void; onAction: (id: string, action: "approve" | "reject" | "suspend") => void }) {
  const set = (key: string, value: string) => setAdminForm({ ...adminForm, [key]: value });
  const department = String(adminForm.department || "").toUpperCase();
  const suggestedRole = department.includes("FINANCE") ? "FINANCE" : department.includes("SAFETY") ? "SAFETY" : department.includes("SUPPORT") ? "SUPPORT" : department.includes("KYC") || department.includes("VERIFICATION") ? "VERIFICATION_KYC" : department.includes("OPERATIONS") ? "OPERATIONS" : "";
  const locationSuggestion = String(adminForm.operatingRegion || adminForm.workingLocation || "").trim();
  return <><Text style={styles.sectionTitle}>Admin Users</Text><Field label="Name" value={adminForm.name} onChangeText={(v) => set("name", v)} /><Field label="Mobile" value={adminForm.mobile} onChangeText={(v) => set("mobile", v)} keyboardType="phone-pad" /><Field label="Email" value={adminForm.email} onChangeText={(v) => set("email", v)} /><Field label="Role" value={adminForm.role} onChangeText={(v) => set("role", v.toUpperCase())} placeholder="OPERATIONS / FINANCE / SAFETY / SUPPORT / VERIFICATION_KYC" />{suggestedRole ? <View style={styles.suggestionBox}><Text style={styles.suggestionTitle}>Suggested Role</Text><Text style={styles.suggestionValue}>{suggestedRole}</Text><Button title="Use Suggested Role" onPress={() => set("role", suggestedRole)} secondary /></View> : null}<Field label="Working Location" value={adminForm.workingLocation} onChangeText={(v) => set("workingLocation", v)} /><Field label="Department" value={adminForm.department} onChangeText={(v) => set("department", v)} /><Field label="Operating Region" value={adminForm.operatingRegion} onChangeText={(v) => set("operatingRegion", v)} />{locationSuggestion ? <View style={styles.suggestionBox}><Text style={styles.suggestionTitle}>Working Location Suggestion</Text><Text style={styles.suggestionValue}>{locationSuggestion}</Text><Text style={styles.note}>Derived from the Admin's current region/location context.</Text><Button title="Use Suggested Location" onPress={() => set("workingLocation", locationSuggestion)} secondary /></View> : null}<Field label="Work Address" value={adminForm.workAddress} onChangeText={(v) => set("workAddress", v)} /><Field label="Access Reason" value={adminForm.accessReason} onChangeText={(v) => set("accessReason", v)} multiline /><Field label="Confirmation" value={confirmation} onChangeText={setConfirmation} placeholder="CREATE ADMIN" /><Button title="Create Admin" onPress={onCreate} />{records.map((item, i) => <Pressable key={String(item.id || i)} style={styles.rowCard} onPress={() => { const id = String(item.id || ""); Alert.alert("Admin action", `${item.name || "Admin"} • ${item.approvalStatus || ""}`, [{ text: "Approve", onPress: () => onAction(id, "approve") }, { text: "Reject", style: "destructive", onPress: () => onAction(id, "reject") }, { text: "Suspend", style: "destructive", onPress: () => onAction(id, "suspend") }, { text: "Cancel", style: "cancel" }]); }}><Text style={styles.rowTitle}>{item.name || "Admin"}</Text><Text style={styles.rowSub}>{[item.role?.name, item.approvalStatus, item.user?.mobile].filter(Boolean).join(" • ")}</Text></Pressable>)}</>;
}

function RolesPanel({ records, rolePermissions, setRolePermissions, confirmation, setConfirmation, onSave }: { records: AnyRecord[]; rolePermissions: Record<string, string[]>; setRolePermissions: (v: Record<string, string[]>) => void; confirmation: string; setConfirmation: (v: string) => void; onSave: (roleId: string) => void }) {
  return <><Text style={styles.sectionTitle}>Roles / Permissions</Text>{records.map((role, i) => {
    const id = String(role.id || i);
    const links = Array.isArray(role.permissionLinks) ? role.permissionLinks : [];
    const selected = rolePermissions[id] ?? links.map((x: AnyRecord) => String(x.permission?.id || x.permissionId || "")).filter(Boolean);
    return <View key={id} style={styles.card}>
      <Text style={styles.cardTitle}>{role.name}</Text>
      <Text style={styles.note}>{role.isSystem ? "System role" : "Custom role"}</Text>
      <Text style={styles.rowBody}>{selected.join(", ") || "No permissions assigned"}</Text>
      <Button title="Use Current Permissions" onPress={() => setRolePermissions({ ...rolePermissions, [id]: selected })} secondary />
      <Field label="Permission IDs (comma separated)" value={selected.join(",")} onChangeText={(v) => setRolePermissions({ ...rolePermissions, [id]: v.split(",").map((x: string) => x.trim()).filter(Boolean) })} />
      <Field label="Confirmation" value={confirmation} onChangeText={setConfirmation} placeholder="CHANGE PERMISSIONS" />
      <Button title="Save Role Permissions" onPress={() => onSave(id)} />
    </View>;
  })}</>;
}

function SupportPanel({ records, onReload, confirmation, setConfirmation, onUpdate }: { records: AnyRecord[]; onReload: () => void; confirmation: string; setConfirmation: (v: string) => void; onUpdate: (id: string, status: string) => void }) {
  return <><Text style={styles.sectionTitle}>Support Operations</Text><Text style={styles.note}>Support cases are backend-authoritative. Status changes are permission-controlled and audited by the backend.</Text><Field label="Confirmation" value={confirmation} onChangeText={setConfirmation} placeholder="Optional" /><Button title="Refresh Support Cases" onPress={onReload} secondary />{records.map((item, i) => <Pressable key={String(item.id || i)} style={styles.rowCard} onPress={() => Alert.alert("Support case", String(item.subject || item.id || "Case"), [{ text: "Open", onPress: () => onUpdate(String(item.id), "OPEN") }, { text: "In Progress", onPress: () => onUpdate(String(item.id), "IN_PROGRESS") }, { text: "Resolved", onPress: () => onUpdate(String(item.id), "RESOLVED") }, { text: "Closed", onPress: () => onUpdate(String(item.id), "CLOSED") }, { text: "Cancel", style: "cancel" }])}><Text style={styles.rowTitle}>{item.subject || item.id}</Text><Text style={styles.rowSub}>{[item.status, item.priority, item.customer?.fullName, item.driver?.fullName].filter(Boolean).join(" • ")}</Text></Pressable>)}</>;
}

function SettingsPanel({ status, values, setValues, onSave }: { status: AnyRecord[]; values: Record<string, string>; setValues: (v: Record<string, string>) => void; onSave: (key: string) => void }) {
  if (!status.length) return <><Text style={styles.sectionTitle}>Settings / Security</Text><Text style={styles.note}>Secure configuration is available to Super Admin and explicitly authorized configuration admins. Secret values are not returned by the backend.</Text></>;
  return <><Text style={styles.sectionTitle}>Secure Configuration</Text><Text style={styles.note}>Configured secrets remain encrypted on the backend. Entering a new value replaces the stored secret.</Text>{status.map((row, i) => <View key={String(row.key || i)} style={styles.card}><Text style={styles.cardTitle}>{row.key}</Text><Text style={styles.rowSub}>{row.configured ? `Configured • ${row.updatedAt || "date unavailable"}` : "Not configured"}</Text><Field label="New value" value={values[String(row.key)] || ""} onChangeText={(v) => setValues({ ...values, [String(row.key)]: v })} placeholder="Enter secret/config value" /><Button title={`Save ${row.key}`} onPress={() => onSave(String(row.key))} /></View>)}</>;
}

function PlatformPanel({ records, onSetTest, releaseForm, setReleaseForm, onCreateRelease, onReleaseAction, mergeForm, setMergeForm, onCreateMerge, onReviewMerge }: { records: AnyRecord[]; onSetTest: () => void; releaseForm: AnyRecord; setReleaseForm: (v: any) => void; onCreateRelease: () => void; onReleaseAction: (action: "test-start" | "test-complete" | "approve" | "promote") => void; mergeForm: AnyRecord; setMergeForm: (v: any) => void; onCreateMerge: () => void; onReviewMerge: () => void }) {
  const setRelease = (key: string, value: string) => setReleaseForm({ ...releaseForm, [key]: value });
  const setMerge = (key: string, value: string) => setMergeForm({ ...mergeForm, [key]: value });
  return <><Text style={styles.sectionTitle}>TEST / LIVE Release Control</Text><Text style={styles.note}>The backend is authoritative. LIVE cannot be selected directly; a release must be tested, passed, approved and then explicitly promoted.</Text>{records.map((item, i) => <RowCard key={String(item.id || i)} item={item} />)}<Button title="Select TEST Environment" onPress={onSetTest} secondary />
    <View style={styles.card}><Text style={styles.cardTitle}>Project Release</Text><Field label="Version" value={releaseForm.version} onChangeText={(v) => setRelease("version", v)} placeholder="v7.3.0" /><Field label="Source Label" value={releaseForm.sourceLabel} onChangeText={(v) => setRelease("sourceLabel", v)} /><Field label="Checksum" value={releaseForm.checksum} onChangeText={(v) => setRelease("checksum", v)} /><Field label="Notes" value={releaseForm.notes} onChangeText={(v) => setRelease("notes", v)} multiline /><Field label="Release ID" value={releaseForm.releaseId} onChangeText={(v) => setRelease("releaseId", v)} placeholder="Filled after create" /><Button title="Create TEST Release" onPress={onCreateRelease} /><Button title="Start TEST" onPress={() => onReleaseAction("test-start")} secondary /><Field label="Tester Mobile" value={releaseForm.testerMobile} onChangeText={(v) => setRelease("testerMobile", v)} keyboardType="phone-pad" /><Field label="Passed" value={releaseForm.passed} onChangeText={(v) => setRelease("passed", v)} keyboardType="numeric" /><Field label="Failed" value={releaseForm.failed} onChangeText={(v) => setRelease("failed", v)} keyboardType="numeric" /><Field label="Errors" value={releaseForm.errors} onChangeText={(v) => setRelease("errors", v)} keyboardType="numeric" /><Button title="Complete TEST Run" onPress={() => onReleaseAction("test-complete")} secondary /><Button title="Approve Passed Release" onPress={() => onReleaseAction("approve")} secondary /><Button title="Promote Approved Release to LIVE" onPress={() => onReleaseAction("promote")} danger /></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Historical / Current Data Merge</Text><Text style={styles.note}>Merge jobs are created as DRAFT and require explicit review. No data is silently overwritten by this UI.</Text><Field label="Job Name" value={mergeForm.name} onChangeText={(v) => setMerge("name", v)} /><Field label="Source Scope" value={mergeForm.sourceScope} onChangeText={(v) => setMerge("sourceScope", v)} /><Field label="Source Query JSON" value={mergeForm.sourceQuery} onChangeText={(v) => setMerge("sourceQuery", v)} placeholder='{"from":"2026-01-01"}' multiline /><Field label="Derivative Data JSON" value={mergeForm.derivativeData} onChangeText={(v) => setMerge("derivativeData", v)} placeholder='{"metric":"route_time"}' multiline /><Field label="Merge Job ID" value={mergeForm.id} onChangeText={(v) => setMerge("id", v)} /><Field label="Approved" value={mergeForm.approved} onChangeText={(v) => setMerge("approved", v)} placeholder="true / false" /><Button title="Create Merge Job" onPress={onCreateMerge} /><Button title="Review Merge Job" onPress={onReviewMerge} secondary /></View>
  </>;
}

function TestDataPanel({ records, entity, setEntity, id, setId, onSeed, onLoad, onDelete }: { records: AnyRecord[]; entity: string; setEntity: (v: string) => void; id: string; setId: (v: string) => void; onSeed: () => void; onLoad: () => void; onDelete: () => void }) {
  return <><Text style={styles.sectionTitle}>TEST Data Lab</Text><Text style={styles.note}>Only TEST-mode data endpoints are used. Backend restricts these records to isolated test records.</Text><Field label="Entity" value={entity} onChangeText={setEntity} placeholder="bookings / drivers / customers / vehicles" /><Field label="Test Record ID" value={id} onChangeText={setId} placeholder="v35-test-..." /><Button title="Seed Test Data" onPress={onSeed} /><Button title="Load Test Data" onPress={onLoad} secondary /><Button title="Delete Test Record" onPress={onDelete} danger />{records.map((item, i) => <RowCard key={String(item.id || i)} item={item} />)}</>;
}

function DetailPanel({ item, onClose }: { item: AnyRecord; onClose: () => void }) {
  return <View style={styles.detailCard}><View style={styles.detailHeader}><Text style={styles.cardTitle}>Record Details</Text><Pressable onPress={onClose}><Text style={styles.close}>×</Text></Pressable></View><Text selectable style={styles.detailText}>{JSON.stringify(item, null, 2)}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: WEB_ADMIN_COLORS.bg },
  authScroll: { flexGrow: 1, justifyContent: "center", padding: 22, backgroundColor: WEB_ADMIN_COLORS.bg },
  dashboardScroll: { padding: 16, paddingBottom: 40 },
  logoText: { textAlign: "center", fontSize: 38, fontWeight: "900", letterSpacing: 4, color: WEB_ADMIN_COLORS.primary, marginBottom: 12 },
  securityBadge: { alignSelf: "center", backgroundColor: WEB_ADMIN_COLORS.successSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 18 },
  securityText: { color: "#08783c", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  heading: { fontSize: 28, fontWeight: "900", color: "#111a33", textAlign: "center" },
  subheading: { fontSize: 14, lineHeight: 21, color: "#63708a", textAlign: "center", marginTop: 8, marginBottom: 18 },
  card: { backgroundColor: WEB_ADMIN_COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border, shadowColor: "#19233A", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  cardTitle: { fontSize: 15, fontWeight: "900", color: WEB_ADMIN_COLORS.text },
  fieldWrap: { marginBottom: 12 },
  label: { fontSize: 11, color: WEB_ADMIN_COLORS.muted, fontWeight: "800", marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.borderStrong, borderRadius: 10, paddingHorizontal: 12, color: WEB_ADMIN_COLORS.text, backgroundColor: WEB_ADMIN_COLORS.surface },
  multiline: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" },
  button: { minHeight: 46, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: WEB_ADMIN_COLORS.primary, marginBottom: 10, paddingHorizontal: 14, shadowColor: WEB_ADMIN_COLORS.primary, shadowOpacity: 0.10, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  buttonSecondary: { backgroundColor: WEB_ADMIN_COLORS.surface, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.borderStrong, shadowOpacity: 0, elevation: 0 },
  buttonDanger: { backgroundColor: WEB_ADMIN_COLORS.danger },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  buttonSecondaryText: { color: WEB_ADMIN_COLORS.text },
  disabled: { opacity: 0.65 },
  message: { marginTop: 12, color: "#8a2b2b", textAlign: "center", fontWeight: "700" },
  backLink: { color: WEB_ADMIN_COLORS.primaryDark, fontWeight: "800", textAlign: "center", marginTop: 14 },
  backLinkTop: { color: WEB_ADMIN_COLORS.primaryDark, fontWeight: "800", marginHorizontal: 16, marginTop: 2 },
  adminAccessNote: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: WEB_ADMIN_COLORS.infoSoft, borderWidth: 1, borderColor: "#CFE4FF" },
  adminAccessTitle: { fontSize: 12, fontWeight: "900", color: WEB_ADMIN_COLORS.info },
  adminAccessBody: { marginTop: 4, fontSize: 11, lineHeight: 16, color: WEB_ADMIN_COLORS.muted },
  appHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandSmall: { fontSize: 11, fontWeight: "900", letterSpacing: 1.3, color: WEB_ADMIN_COLORS.primary },
  headerName: { fontSize: 16, fontWeight: "900", color: WEB_ADMIN_COLORS.text, marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 8 },
  headerButton: { minHeight: 38, minWidth: 38, paddingHorizontal: 10, borderRadius: 10, justifyContent: "center", alignItems: "center", backgroundColor: WEB_ADMIN_COLORS.surface, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.borderStrong },
  connectionCard: { marginBottom: 10, flexDirection: "row", alignItems: "center", backgroundColor: WEB_ADMIN_COLORS.successSoft, borderRadius: 12, borderWidth: 1, borderColor: "#BDE7CC", padding: 11 },
  dot: { width: 10, height: 10, borderRadius: 8, backgroundColor: WEB_ADMIN_COLORS.success, marginRight: 10 },
  dotOffline: { backgroundColor: "#f3a500" },
  connectionTitle: { fontWeight: "900", color: WEB_ADMIN_COLORS.success },
  connectionSub: { fontSize: 10, color: "#4B6F5A", marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: WEB_ADMIN_COLORS.text, marginTop: 8, marginBottom: 10 },
  subSection: { fontSize: 14, fontWeight: "900", color: WEB_ADMIN_COLORS.text, marginTop: 12, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 8 },
  statCard: { width: "48.3%", backgroundColor: WEB_ADMIN_COLORS.surface, borderRadius: 14, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border, borderLeftWidth: 4, borderLeftColor: WEB_ADMIN_COLORS.success, shadowColor: "#19233A", shadowOpacity: 0.04, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  blue: { borderLeftColor: "#1777df" },
  orange: { borderLeftColor: "#f3a500" },
  red: { borderLeftColor: "#ef2b2d" },
  statValue: { fontSize: 23, fontWeight: "900", color: WEB_ADMIN_COLORS.text },
  statLabel: { fontSize: 10, color: WEB_ADMIN_COLORS.muted, marginTop: 3, fontWeight: "700" },
  moduleCard: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: WEB_ADMIN_COLORS.surface, borderRadius: 16, marginBottom: 9, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border, shadowColor: "#19233A", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  moduleIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: WEB_ADMIN_COLORS.primarySoft, justifyContent: "center", alignItems: "center", marginRight: 12 },
  moduleIconText: { color: WEB_ADMIN_COLORS.primary, fontSize: 17, fontWeight: "900" },
  moduleTitle: { fontSize: 14, fontWeight: "900", color: WEB_ADMIN_COLORS.text },
  moduleSubtitle: { fontSize: 11, color: WEB_ADMIN_COLORS.muted, marginTop: 3, lineHeight: 16 },
  chevron: { fontSize: 27, color: "#8c98aa", marginLeft: 8 },
  rowCard: { backgroundColor: WEB_ADMIN_COLORS.surface, borderRadius: 14, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border, shadowColor: "#19233A", shadowOpacity: 0.025, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  rowTitle: { fontSize: 14, fontWeight: "900", color: WEB_ADMIN_COLORS.text },
  rowSub: { fontSize: 10, color: WEB_ADMIN_COLORS.muted, marginTop: 4 },
  rowBody: { fontSize: 11, color: WEB_ADMIN_COLORS.muted, lineHeight: 17, marginTop: 7 },
  empty: { textAlign: "center", color: "#7d899c", paddingVertical: 28 },
  note: { fontSize: 11, color: WEB_ADMIN_COLORS.muted, lineHeight: 17, marginBottom: 12 },
  detailCard: { backgroundColor: "#0f1828", borderRadius: 15, padding: 14, marginTop: 12 },
  detailHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  close: { color: "#fff", fontSize: 26, fontWeight: "600" },
  detailText: { color: "#e9eef7", fontSize: 11, lineHeight: 16 },
  adminBrandLogo: { flexDirection: "row", alignItems: "baseline", alignSelf: "center", marginBottom: 8 },
  adminBrandLogoLarge: { transform: [{ scale: 1.35 }] },
  adminBrandLogoSmall: { transform: [{ scale: 1.15 }] },
  adminBrandLogoCompact: { transform: [{ scale: 0.82 }], marginBottom: 0 },
  adminBrandRide: { fontSize: 30, fontWeight: "900", color: "#0F172A", letterSpacing: -1 },
  adminBrandX: { fontSize: 30, fontWeight: "900", color: WEB_ADMIN_COLORS.primary, letterSpacing: -1 },
  authHero: { width: "100%", height: 175, borderRadius: 18, marginBottom: 14, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border },
  heroCard: { backgroundColor: WEB_ADMIN_COLORS.surface, borderRadius: 16, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border, shadowColor: "#19233A", shadowOpacity: 0.05, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  heroImage: { width: "100%", height: 155 },
  heroOverlay: { paddingHorizontal: 16, paddingVertical: 12 },
  heroTitle: { fontSize: 20, fontWeight: "900", color: WEB_ADMIN_COLORS.text },
  heroSub: { marginTop: 4, fontSize: 12, fontWeight: "800", color: WEB_ADMIN_COLORS.primaryDark },
  headerIdentity: { flexDirection: "row", alignItems: "center", gap: 9 },
  mapCard: { backgroundColor: WEB_ADMIN_COLORS.surface, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border, marginBottom: 12 },
  liveMap: { width: "100%", height: 260 },
  mapLegend: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, backgroundColor: WEB_ADMIN_COLORS.surfaceSoft, borderTopWidth: 1, borderTopColor: WEB_ADMIN_COLORS.border },
  mapLegendText: { color: WEB_ADMIN_COLORS.muted, fontWeight: "800", fontSize: 10 },
  inlineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowIconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: WEB_ADMIN_COLORS.successSoft, marginRight: 10 },
  selectedRow: { borderColor: WEB_ADMIN_COLORS.primary, borderWidth: 2, backgroundColor: WEB_ADMIN_COLORS.primarySoft },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: WEB_ADMIN_COLORS.border },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  statusPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: WEB_ADMIN_COLORS.successSoft, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, marginBottom: 10 },
  statusPillText: { color: WEB_ADMIN_COLORS.success, fontWeight: "900", fontSize: 12 },
  warningBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#FFF9E8", borderColor: "#F4D479", borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 4 },
  warningText: { flex: 1, color: "#6C5514", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  presencePill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  presenceOnline: { backgroundColor: "#E8F8EF", borderColor: "#BDE7CC" },
  presenceOffline: { backgroundColor: "#FFF0F0", borderColor: "#F3C1C1" },
  presenceDot: { width: 9, height: 9, borderRadius: 9 },
  presenceDotOnline: { backgroundColor: "#16A34A" },
  presenceDotOffline: { backgroundColor: "#DC2626" },
  presenceText: { fontSize: 10, fontWeight: "900" },
  presenceTextOnline: { color: "#08783c" },
  presenceTextOffline: { color: "#b91c1c" },
  suggestionBox: { backgroundColor: "#F4F8FF", borderWidth: 1, borderColor: "#C9D8EF", borderRadius: 13, padding: 12, marginBottom: 12 },
  suggestionTitle: { fontSize: 11, fontWeight: "900", color: "#50627c", textTransform: "uppercase", letterSpacing: 0.7 },
  suggestionValue: { fontSize: 16, fontWeight: "900", color: "#17304f", marginTop: 4, marginBottom: 8 },
  toggleChip: { borderWidth: 1, borderColor: "#CFD8E6", backgroundColor: "#fff", borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8, marginRight: 7, marginBottom: 7 },
  toggleChipActive: { backgroundColor: WEB_ADMIN_COLORS.primarySoft, borderColor: "#FDA4AF" },
  toggleChipText: { color: "#506078", fontWeight: "800", fontSize: 11 },
  toggleChipTextActive: { color: WEB_ADMIN_COLORS.primaryDark },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  halfField: { width: "48%" },
  locationPhoto: { width: "100%", height: 180, borderRadius: 12 },
  photoCard: { backgroundColor: "#F7F9FC", borderRadius: 12, borderWidth: 1, borderColor: "#E0E7F0", overflow: "hidden", marginBottom: 10, padding: 10 },
  mapPlaceholder: { height: 220, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, backgroundColor: "#F2F6FA" },
  mapPlaceholderTitle: { fontSize: 16, fontWeight: "900", color: "#23344f", marginBottom: 8 },
  // Web Admin-equivalent shell / drawer
  topBar: { minHeight: 58, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: WEB_ADMIN_COLORS.surface, borderBottomWidth: 1, borderBottomColor: WEB_ADMIN_COLORS.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#19233A", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  topBarLeft: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 7 },
  menuButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: WEB_ADMIN_COLORS.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 7 },
  menuGlyph: { color: WEB_ADMIN_COLORS.primaryDark, fontSize: 20, fontWeight: "900" },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, backgroundColor: WEB_ADMIN_COLORS.surfaceSoft, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border },
  roleBadgeText: { color: WEB_ADMIN_COLORS.muted, fontSize: 9, fontWeight: "900", maxWidth: 90 },
  roleBadgeScopeText: { color: WEB_ADMIN_COLORS.info, fontSize: 8, fontWeight: "800", marginTop: 2, maxWidth: 100 },
  logoutHeaderText: { color: WEB_ADMIN_COLORS.primaryDark, fontWeight: "900", fontSize: 11 },
  pageContextBar: { marginHorizontal: 12, marginTop: 10, marginBottom: 3, padding: 12, borderRadius: 13, backgroundColor: WEB_ADMIN_COLORS.surface, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border, flexDirection: "row", alignItems: "center", gap: 10 },
  pageContextScope: { color: WEB_ADMIN_COLORS.info, fontSize: 9, fontWeight: "800", marginTop: 3 },
  pageContextTitle: { color: WEB_ADMIN_COLORS.text, fontSize: 15, fontWeight: "900" },
  pageContextSub: { color: WEB_ADMIN_COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  connectionPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  connectionPillLive: { backgroundColor: WEB_ADMIN_COLORS.successSoft, borderColor: "#BDE7CC" },
  connectionPillFallback: { backgroundColor: WEB_ADMIN_COLORS.warningSoft, borderColor: "#F4D6A1" },
  connectionPillDot: { width: 7, height: 7, borderRadius: 7 },
  connectionPillDotLive: { backgroundColor: WEB_ADMIN_COLORS.success },
  connectionPillDotFallback: { backgroundColor: WEB_ADMIN_COLORS.warning },
  connectionPillText: { fontSize: 9, fontWeight: "900", color: WEB_ADMIN_COLORS.muted },
  inlineBackButton: { alignSelf: "flex-start", marginHorizontal: 14, marginTop: 4, paddingVertical: 5 },
  inlineBackText: { color: WEB_ADMIN_COLORS.primaryDark, fontSize: 11, fontWeight: "900" },
  sessionBanner: { flexDirection: "row", alignItems: "center", backgroundColor: WEB_ADMIN_COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border, padding: 10, marginBottom: 10 },
  authCard: { width: "100%", maxWidth: 520, alignSelf: "center", borderRadius: 20, padding: 18, shadowOpacity: 0.10, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  authAccentLine: { alignSelf: "center", width: 48, height: 4, borderRadius: 999, backgroundColor: WEB_ADMIN_COLORS.primary, marginTop: 10, marginBottom: 10 },
  drawerOverlay: { flex: 1, flexDirection: "row", backgroundColor: "rgba(15,23,42,0.30)" },
  drawerBackdrop: { flex: 1 },
  drawerSheet: { width: 316, maxWidth: "86%", backgroundColor: WEB_ADMIN_COLORS.surface, borderRightWidth: 1, borderRightColor: WEB_ADMIN_COLORS.border, shadowColor: "#0F172A", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 4, height: 0 }, elevation: 8 },
  drawerHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: WEB_ADMIN_COLORS.border, flexDirection: "row", alignItems: "center" },
  drawerBrandRow: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  drawerBrand: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1, color: WEB_ADMIN_COLORS.primary },
  drawerRole: { fontSize: 10, fontWeight: "800", color: WEB_ADMIN_COLORS.muted, marginTop: 2 },
  drawerClose: { width: 34, height: 34, borderRadius: 9, backgroundColor: WEB_ADMIN_COLORS.surfaceSoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: WEB_ADMIN_COLORS.border },
  drawerCloseText: { color: WEB_ADMIN_COLORS.text, fontSize: 23, lineHeight: 24, fontWeight: "500" },
  drawerStatus: { margin: 12, padding: 11, borderRadius: 12, backgroundColor: WEB_ADMIN_COLORS.infoSoft, borderWidth: 1, borderColor: "#CFE2F5", flexDirection: "row", alignItems: "center" },
  drawerStatusDot: { width: 8, height: 8, borderRadius: 8, backgroundColor: WEB_ADMIN_COLORS.success, marginRight: 9 },
  drawerStatusTitle: { fontSize: 11, color: WEB_ADMIN_COLORS.ink, fontWeight: "900" },
  drawerStatusSub: { fontSize: 9, lineHeight: 13, color: WEB_ADMIN_COLORS.muted, marginTop: 2 },
  drawerScroll: { paddingHorizontal: 10, paddingBottom: 16 },
  drawerGroup: { marginBottom: 13 },
  drawerGroupLabel: { paddingHorizontal: 7, marginBottom: 6, color: WEB_ADMIN_COLORS.muted2, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  drawerItem: { minHeight: 48, paddingHorizontal: 8, borderRadius: 11, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  drawerItemActive: { backgroundColor: WEB_ADMIN_COLORS.primarySoft, borderWidth: 1, borderColor: "#FBC6CE" },
  drawerItemIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: WEB_ADMIN_COLORS.surfaceSoft, alignItems: "center", justifyContent: "center" },
  drawerItemIconActive: { backgroundColor: WEB_ADMIN_COLORS.surface },
  drawerItemTitle: { fontSize: 11, fontWeight: "800", color: WEB_ADMIN_COLORS.text },
  drawerItemTitleActive: { color: WEB_ADMIN_COLORS.primaryDark },
  drawerItemSub: { fontSize: 8, color: WEB_ADMIN_COLORS.primaryDark, marginTop: 1, fontWeight: "700" },
  drawerArrow: { color: WEB_ADMIN_COLORS.muted2, fontSize: 18, fontWeight: "500" },
  drawerFooter: { borderTopWidth: 1, borderTopColor: WEB_ADMIN_COLORS.border, padding: 12 },
  drawerFooterActions: { flexDirection: "row", gap: 8 },
  drawerFooterButton: { flex: 1, minHeight: 40, borderRadius: 9, borderWidth: 1, borderColor: WEB_ADMIN_COLORS.borderStrong, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, backgroundColor: WEB_ADMIN_COLORS.surface },
  drawerFooterText: { color: WEB_ADMIN_COLORS.text, fontSize: 10, fontWeight: "800" },
  drawerLogoutButton: { borderColor: "#F4C0CA", backgroundColor: WEB_ADMIN_COLORS.primarySoft },
  drawerLogoutText: { color: WEB_ADMIN_COLORS.primaryDark, fontSize: 10, fontWeight: "900" },
});
