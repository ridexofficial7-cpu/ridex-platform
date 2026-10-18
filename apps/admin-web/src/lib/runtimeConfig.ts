import packageManifest from "../../package.json";
import type { Environment } from "../types";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strictEnvironment(value: string): Environment | null {
  return value === "TEST" || value === "LIVE" ? value : null;
}

type ApiBaseResult = { value: string; valid: boolean; issue: string };

function validateApiBase(value: string, environment: Environment): ApiBaseResult {
  const raw = (value || "/api/v1").trim().replace(/\/$/, "");
  if (!raw) return { value: "/api/v1", valid: true, issue: "" };

  // A single-slash relative path is same-origin. Reject protocol-relative URLs,
  // query strings and fragments because the configured value is a base path.
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (/[?#\s]/.test(raw)) {
      return { value: "/api/v1", valid: false, issue: "VITE_RIDEX_API_URL must be a base path without a query, fragment, or whitespace." };
    }
    return { value: raw, valid: true, issue: "" };
  }

  try {
    const url = new URL(raw);
    if (!(["https:", "http:"].includes(url.protocol)) || url.username || url.password || url.search || url.hash || /\s/.test(raw)) {
      return { value: "/api/v1", valid: false, issue: "VITE_RIDEX_API_URL must be a valid HTTPS URL or a same-origin relative path." };
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname.toLowerCase());
    if (url.protocol === "http:" && !(environment === "TEST" && loopback)) {
      return { value: "/api/v1", valid: false, issue: "Plain HTTP API URLs are allowed only for a TEST environment on loopback; use HTTPS otherwise." };
    }
    return { value: `${url.origin}${url.pathname}`.replace(/\/$/, ""), valid: true, issue: "" };
  } catch {
    return { value: "/api/v1", valid: false, issue: "VITE_RIDEX_API_URL is not a valid API base URL." };
  }
}

const configuredEnvironment = clean(import.meta.env.VITE_RIDEX_ENVIRONMENT);
const legacyEnvironment = clean(import.meta.env.VITE_APP_ENV);
const parsedEnvironment = strictEnvironment(configuredEnvironment);
export const APP_ENVIRONMENT: Environment = parsedEnvironment ?? "TEST";

const configuredApiUrl = clean(import.meta.env.VITE_RIDEX_API_URL);
const legacyApiUrl = clean(import.meta.env.VITE_API_BASE_URL);
const apiBase = validateApiBase(configuredApiUrl || (legacyApiUrl ? "" : "/api/v1"), APP_ENVIRONMENT);
const envIssue = !configuredEnvironment
  ? legacyEnvironment
    ? "VITE_APP_ENV is no longer supported. Set VITE_RIDEX_ENVIRONMENT to TEST or LIVE; API access is blocked until corrected."
    : "VITE_RIDEX_ENVIRONMENT is required. Set it explicitly to TEST or LIVE; API access is blocked until configured."
  : !parsedEnvironment
    ? "Invalid VITE_RIDEX_ENVIRONMENT. Use exactly TEST or LIVE. API access is blocked until corrected."
    : "";
const apiIssue = legacyApiUrl && !configuredApiUrl
  ? "VITE_API_BASE_URL is no longer supported. Set VITE_RIDEX_API_URL; API access is blocked until corrected."
  : apiBase.issue;

export const API_BASE_URL = apiBase.value;
export const RUNTIME_CONFIG_VALID = !envIssue && !apiIssue;
export const RUNTIME_CONFIG_WARNING = [envIssue, apiIssue].filter(Boolean).join(" ");

// package.json is the single source of truth for the build and request version.
export const APP_VERSION = String(packageManifest.version || "0.0.0");
export const APP_VERSION_HEADER = `ridex-admin-web/${APP_VERSION}`;
export const APP_NAME = clean(import.meta.env.VITE_RIDEX_APP_NAME) || "RideX Admin";
export const DEBUG_ENABLED = APP_ENVIRONMENT === "TEST" && clean(import.meta.env.VITE_ENABLE_DEBUG).toLowerCase() === "true";
