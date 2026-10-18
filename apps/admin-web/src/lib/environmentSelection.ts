import type { Environment } from "../types";
import {
  API_BASE_URL as BUILD_API_BASE_URL,
  APP_ENVIRONMENT,
  RUNTIME_CONFIG_VALID,
  RUNTIME_CONFIG_WARNING,
} from "./runtimeConfig";

const STORAGE_KEY = "ridex-admin-environment";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeApiUrl(rawValue: string, environment: Environment): string | null {
  const raw = clean(rawValue).replace(/\/$/, "");
  if (!raw) return null;

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (/[?#\s]/.test(raw)) return null;
    if (
      environment === "LIVE" &&
      typeof window !== "undefined" &&
      window.location.protocol !== "https:"
    ) return null;
    return raw;
  }

  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const hostname = url.hostname.toLowerCase();
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);

    if (environment === "LIVE" && url.protocol !== "https:") return null;
    if (url.protocol === "http:" && !(environment === "TEST" && loopback)) return null;

    return `${url.origin}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

const testConfigured = clean(import.meta.env.VITE_RIDEX_TEST_API_URL);
const liveConfigured = clean(import.meta.env.VITE_RIDEX_LIVE_API_URL);

const apiUrls: Record<Environment, string | null> = {
  TEST: normalizeApiUrl(
    testConfigured || (APP_ENVIRONMENT === "TEST" ? BUILD_API_BASE_URL : ""),
    "TEST",
  ),
  LIVE: normalizeApiUrl(
    liveConfigured || (APP_ENVIRONMENT === "LIVE" ? BUILD_API_BASE_URL : ""),
    "LIVE",
  ),
};

function readInitialEnvironment(): Environment {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if ((saved === "TEST" || saved === "LIVE") && apiUrls[saved]) return saved;
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }

  if (apiUrls[APP_ENVIRONMENT]) return APP_ENVIRONMENT;
  if (apiUrls.TEST) return "TEST";
  return "LIVE";
}

let selectedEnvironment: Environment = readInitialEnvironment();

export function getSelectedEnvironment(): Environment {
  return selectedEnvironment;
}

export function isEnvironmentAvailable(environment: Environment): boolean {
  return RUNTIME_CONFIG_VALID && Boolean(apiUrls[environment]);
}

export function getEnvironmentConfigWarning(environment: Environment): string {
  if (!RUNTIME_CONFIG_VALID) {
    return RUNTIME_CONFIG_WARNING || "RideX Admin runtime configuration is invalid.";
  }

  if (!apiUrls[environment]) {
    return environment === "LIVE"
      ? "LIVE API endpoint is not configured. LIVE access is blocked."
      : "TEST API endpoint is not configured. TEST access is blocked.";
  }

  return "";
}

export function getApiBaseUrl(): string {
  const environment = getSelectedEnvironment();
  const warning = getEnvironmentConfigWarning(environment);
  if (warning) throw new Error(warning);

  const baseUrl = apiUrls[environment];
  if (!baseUrl) throw new Error(`${environment} API endpoint is unavailable.`);
  return baseUrl;
}

export function setSelectedEnvironment(environment: Environment): void {
  if (!isEnvironmentAvailable(environment)) {
    throw new Error(getEnvironmentConfigWarning(environment));
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, environment);
  } catch {
    throw new Error("Could not persist the environment selection safely.");
  }

  selectedEnvironment = environment;
}

export function getAvailableEnvironments(): Environment[] {
  return (["TEST", "LIVE"] as Environment[]).filter(isEnvironmentAvailable);
}