import AsyncStorage from "@react-native-async-storage/async-storage";
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";

import { getDriverApiBase, DRIVER_TOKEN_KEY, DRIVER_SESSION_KEY } from "./api/driverApi";

import { getSecureToken } from "../shared/security/secureTokenStorage";
export const RIDEX_DRIVER_LOCATION_TASK = "ridex-driver-active-ride-location-v1";
export const DRIVER_ACTIVE_BOOKING_KEY = "ridex:driver:active-booking:v1";

async function postBackgroundLocation(location: Location.LocationObject) {
  const token = await getSecureToken(DRIVER_TOKEN_KEY);
  const sessionRaw = await AsyncStorage.getItem(DRIVER_SESSION_KEY);
  const driverId = String(JSON.parse(sessionRaw || "{}").driverId || "").trim();
  const bookingId = String(await AsyncStorage.getItem(DRIVER_ACTIVE_BOOKING_KEY) || "").trim();
  if (!token || !driverId || !bookingId) return;

  const recordedAt = new Date(location.timestamp || Date.now()).toISOString();
  const requestId = `ridex-bg-gps-${driverId}-${Date.now()}`;
  await fetch(`${getDriverApiBase()}/gps/location`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Request-ID": requestId,
      "X-RideX-Location-Source": "DRIVER_BACKGROUND_TASK",
    },
    body: JSON.stringify({
      driverId,
      bookingId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? null,
      heading: location.coords.heading ?? null,
      speed: location.coords.speed ?? null,
      recordedAt,
      isOnline: true,
    }),
  });
}

if (!TaskManager.isTaskDefined(RIDEX_DRIVER_LOCATION_TASK)) {
  TaskManager.defineTask(RIDEX_DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = Array.isArray((data as any)?.locations) ? (data as any).locations as Location.LocationObject[] : [];
    for (const location of locations.slice(-10)) {
      try { await postBackgroundLocation(location); } catch { /* retry is provided by the next native location event */ }
    }
  });
}

export async function setDriverActiveBookingId(bookingId: string | null): Promise<void> {
  const value = String(bookingId ?? "").trim();
  if (value) await AsyncStorage.setItem(DRIVER_ACTIVE_BOOKING_KEY, value);
  else await AsyncStorage.removeItem(DRIVER_ACTIVE_BOOKING_KEY);
}

export async function ensureDriverBackgroundLocationPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === "granted";
}

export async function startDriverBackgroundLocation(): Promise<boolean> {
  const permitted = await ensureDriverBackgroundLocationPermissions();
  if (!permitted) return false;
  const started = await Location.hasStartedLocationUpdatesAsync(RIDEX_DRIVER_LOCATION_TASK);
  if (started) return true;
  await Location.startLocationUpdatesAsync(RIDEX_DRIVER_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10_000,
    distanceInterval: 10,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "RideX Driver",
      notificationBody: "RideX is sharing your live location during an active ride.",
      killServiceOnDestroy: false,
    },
  });
  return true;
}

export async function stopDriverBackgroundLocation(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(RIDEX_DRIVER_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(RIDEX_DRIVER_LOCATION_TASK);
    }
  } catch {
    // Best effort during logout/completion/shutdown.
  }
}
