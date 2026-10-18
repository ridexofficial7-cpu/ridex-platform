import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, MapPinned, ReceiptText, RefreshCw, Save, Search, UploadCloud } from "lucide-react";
import type { AdminContext, Environment, Screen, WorkspaceConfig } from "../types";
import { ApiError, request, WORKSPACES } from "../lib/api";
import { API_CONTRACT_STATUS, RIDEX_API, resourcePath, withQuery } from "../lib/apiContract";
import { useSessionDraft } from "../lib/draftStorage";
import { Button, Card, EmptyState, Notice, PixelLoader, StatusPill } from "../components/ui";
import { GeoMap } from "../components/GeoMap";
import { VehicleCatalogPage } from "./VehicleCatalogPage";
import { GatewayPage } from "./GatewayPage";
import { AvailabilityPage } from "./AvailabilityPage";
import { RouteBuilderPage } from "./RouteBuilderPage";
import { isSensitiveDisplayField, redactForDisplay, safeDisplayJson } from "../lib/displayData";
import { filterAuditRecords, type AuditFilters } from "../lib/auditFilters.mjs";
import { maskCustomerField, maskEmail, maskPhone } from "../lib/privacyDisplay.mjs";
import { LIVE_OPERATIONAL_STATUSES, mergeLiveOperationalBookingBatches } from "../lib/liveOperations.mjs";
import { useLanguage } from "../lib/i18n";

type Row = Record<string, any>;
type SortMode = "newest" | "oldest" | "name" | "status";
type AuditServerFilters = { module: string; entityType: string; entityId: string };
const DISPLAY_PAGE_SIZE = 25;
// Fifth-failure alert delivery requires verified backend event/provider evidence; this UI source alone does not prove delivery.
type Field = { key:string; label:string; type?:"text"|"number"|"percent"|"textarea"|"select"|"checkbox"|"json"|"csv"; placeholder?:string; options?:{value:string;label:string}[]; required?:boolean; helper?:string; maxLength?:number; confirmationOnly?:boolean; };
type ActionDef = { id:string; title:string; description:string; method:"POST"|"PUT"|"PATCH"|"DELETE"|"GET"; path:(values:Record<string,string>)=>string; fields?:Field[]; dangerous?:boolean; confirmationKey?:string|string[]; submitLabel?:string; requiresVerifiedContract?:boolean; };
const API_CONTRACTS_VERIFIED = String(API_CONTRACT_STATUS) === "VERIFIED_AGAINST_BACKEND_SOURCE";

/**
 * Narrow allowlist for mutations whose router, method, request fields and
 * server-side authorization have been confirmed directly in backend source.
 * This does not mark the overall Admin API inventory as verified.
 */
function hasVerifiedMutationContract(def: ActionDef): boolean {
  const keys = (def.fields ?? []).map((field) => field.key).sort();


  if (
    def.id === "permissions" &&
    def.method === "POST" &&
    def.dangerous === true &&
    def.path({ roleId: "RIDEX_ROLE_ID" }) === `${RIDEX_API.admin.roles}/RIDEX_ROLE_ID/permissions` &&
    def.confirmationKey === "CHANGE PERMISSIONS"
  ) {
    const permissionIds = (def.fields ?? []).find((field) => field.key === "permissionIds");
    const confirmation = (def.fields ?? []).find((field) => field.key === "confirmation");
    return keys.length === 3 && keys[0] === "confirmation" && keys[1] === "permissionIds" && keys[2] === "roleId" &&
      permissionIds?.required === true && confirmation?.required === true && confirmation.placeholder === "CHANGE PERMISSIONS";
  }

  if (
    def.id === "revoke" &&
    def.method === "DELETE" &&
    def.dangerous === true &&
    def.path({ sessionId: "RIDEX_SESSION_ID" }) === `${RIDEX_API.admin.adminPresence}/sessions/RIDEX_SESSION_ID` &&
    def.confirmationKey === "REVOKE SESSION"
  ) {
    const sessionId = (def.fields ?? []).find((field) => field.key === "sessionId");
    const confirmation = (def.fields ?? []).find((field) => field.key === "confirmation");
    return keys.length === 2 && keys[0] === "confirmation" && keys[1] === "sessionId" &&
      sessionId?.required === true && confirmation?.required === true && confirmation.placeholder === "REVOKE SESSION";
  }

  if (
    def.id === "revokeAll" &&
    def.method === "POST" &&
    def.dangerous === true &&
    def.path({ adminId: "RIDEX_ADMIN_ID" }) === `${RIDEX_API.admin.adminPresence}/admins/RIDEX_ADMIN_ID/revoke-all` &&
    def.confirmationKey === "REVOKE ALL SESSIONS"
  ) {
    const adminId = (def.fields ?? []).find((field) => field.key === "adminId");
    const confirmation = (def.fields ?? []).find((field) => field.key === "confirmation");
    return keys.length === 2 && keys[0] === "adminId" && keys[1] === "confirmation" &&
      adminId?.required === true && confirmation?.required === true && confirmation.placeholder === "REVOKE ALL SESSIONS";
  }

  if (
    def.id === "internalNote" &&
    def.method === "POST" &&
    def.path({ caseId: "RIDEX_CASE_ID" }) === `${RIDEX_API.support.adminCases}/RIDEX_CASE_ID/internal-notes`
  ) {
    const note = (def.fields ?? []).find((field) => field.key === "note");
    return keys.length === 2 && keys[0] === "caseId" && keys[1] === "note" &&
      note?.type === "textarea" && note.required === true && (note.maxLength ?? 0) <= 5000;
  }

  if (
    def.id === "escalate" &&
    def.method === "PATCH" &&
    def.path({ caseId: "RIDEX_CASE_ID" }) === `${RIDEX_API.support.adminCases}/RIDEX_CASE_ID/escalation`
  ) {
    const fields = def.fields ?? [];
    const level = fields.find((field) => field.key === "escalationLevel");
    const role = fields.find((field) => field.key === "escalationRole");
    const levels = (level?.options ?? []).map((option) => option.value).sort();
    return keys.length === 3 && keys[0] === "caseId" && keys[1] === "escalationLevel" && keys[2] === "escalationRole" &&
      level?.type === "select" && levels.join(",") === "CITY,GLOBAL,STATE" && role?.required === true;
  }

  if (
    def.id === "create" &&
    def.method === "POST" &&
    def.path({}) === RIDEX_API.admin.backups &&
    !def.dangerous
  ) {
    const fields = def.fields ?? [];
    const scope = fields.find((field) => field.key === "scope");
    const confirmation = fields.find((field) => field.key === "confirmation");
    return keys.length === 2 && keys[0] === "confirmation" && keys[1] === "scope" &&
      scope?.type === "select" && scope.options?.length === 1 && scope.options[0]?.value === "FULL" &&
      confirmation?.required !== true;
  }

  if (
    def.id === "restore" &&
    def.method === "POST" &&
    def.dangerous === true &&
    def.path({ backupId: "RIDEX_BACKUP_ID" }) === `${RIDEX_API.admin.backups}/RIDEX_BACKUP_ID/restore` &&
    Array.isArray(def.confirmationKey) &&
    def.confirmationKey.includes("RESTORE TEST SNAPSHOT") &&
    def.confirmationKey.includes("RESTORE PRODUCTION SNAPSHOT")
  ) {
    const fields = def.fields ?? [];
    return keys.length === 2 && keys[0] === "backupId" && keys[1] === "confirmation" &&
      fields.find((field) => field.key === "backupId")?.required === true &&
      fields.find((field) => field.key === "confirmation")?.required === true;
  }

  if (
    def.id === "save" &&
    def.method === "PUT" &&
    def.path({}) === RIDEX_API.admin.driverCommission
  ) {
    const percentKeys = (def.fields ?? [])
      .filter((field) => field.type === "percent")
      .map((field) => field.key)
      .sort();
    return keys.length === 3 &&
      keys[0] === "NEW_DRIVER" &&
      keys[1] === "TOP_100" &&
      keys[2] === "TOP_DRIVER" &&
      percentKeys.length === 3 &&
      percentKeys[0] === "NEW_DRIVER" &&
      percentKeys[1] === "TOP_100" &&
      percentKeys[2] === "TOP_DRIVER";
  }

  if (
    def.id === "update" &&
    def.method === "PATCH" &&
    def.path({ caseId: "RIDEX_CASE_ID" }) === `${RIDEX_API.support.adminCases}/RIDEX_CASE_ID`
  ) {
    const status = (def.fields ?? []).find((field) => field.key === "status");
    const reason = (def.fields ?? []).find((field) => field.key === "changeReason");
    const statusValues = (status?.options ?? []).map((option) => option.value);
    return keys.length === 5 &&
      keys[0] === "assignedAdminId" &&
      keys[1] === "caseId" &&
      keys[2] === "changeReason" &&
      keys[3] === "priority" &&
      keys[4] === "status" &&
      status?.type === "select" &&
      ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"].every((value) => statusValues.includes(value)) &&
      reason?.type === "textarea" &&
      reason.required === true &&
      reason.maxLength === 2000;
  }

  return false;
}

function rows(value:unknown):Row[]{
  if(Array.isArray(value)) return value.filter(Boolean) as Row[];
  if(value && typeof value === "object"){ const root=value as Row; for(const key of ["items","records","rows","results","purposes","history","drivers","bookings","customers","states","cities","locations","routes","admins","roles","permissions","settlements","backups","testRuns","testers","events","payments","promotions","cases","alerts","vehicles"]){ if(Array.isArray(root[key])) return root[key].filter(Boolean); } }
  return [];
}
function scalar(value:unknown):string{ if(value===null||value===undefined||value==="") return "—"; if(typeof value==="string"||typeof value==="number"||typeof value==="boolean") return String(value); if(Array.isArray(value)) return `${value.length} items`; try{return JSON.stringify(value);}catch{return "[object]";} }
function rowIdentity(row: Row | null | undefined): string {
  if (!row) return "";
  for (const key of ["id", "_id", "bookingId", "rideId", "driverId", "customerId", "adminId", "cityId", "stateId", "locationId", "routeId", "eventId", "caseId", "paymentId", "settlementId", "sessionId", "promotionId", "ruleId", "zoneId", "backupId", "purposeCode"]) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return `${key}:${String(value)}`;
  }
  return "";
}
function primaryLabel(row:Row, index:number){ return String(row.name ?? row.fullName ?? row.title ?? row.purposeCode ?? row.code ?? row.mobile ?? row.identifier ?? row.id ?? `Record ${index+1}`); }
function secondaryLabel(row:Row, screen?:Screen){ const mobile = typeof row.mobile === "string" && ["admins", "sessions"].includes(String(screen)) ? maskPhone(row.mobile) : row.mobile; const email = typeof row.email === "string" && ["admins", "sessions"].includes(String(screen)) ? maskEmail(row.email) : row.email; const bits=[mobile,email,row.cityName ?? row.city,row.stateName ?? row.state,row.status ?? row.approvalStatus ?? row.verificationStatus,row.purposeCategory,row.deliveryMethod].map(scalar).filter(v=>v!=="—"); return bits.slice(0,3).join(" • ") || "Backend record"; }
import { AssetManager } from "../components/AssetManager";
import { PermissionGate } from "../components/PermissionGate";
import { DeliveryHealthPanel, PublicLinksPanel, ScopeAssignmentPanel } from "../components/AdminCoveragePanels";
import { LocationRoutePage } from "./LocationRoutePage";
import { OtpConfigurationWorkspace } from "./OtpConfigurationWorkspace";
import { EventsPanel, type BlueprintApiRequest } from "../AdminBlueprintPanels";

function detailEntries(row:Row, screen?: Screen){
  // Old/new configuration payloads stay hidden until the backend's dedicated audit-detail
  // permission contract has been supplied and verified. Backend-side scope/redaction remains mandatory.
  const auditValuePayload = /^(oldValue|newValue|before|after|previousValue|nextValue|changeSet|beforeState|afterState)$/i;
  const entries = Object.entries(row).filter(([key])=>!isSensitiveDisplayField(key) && !(screen === "audit" && auditValuePayload.test(key)));
  if (screen === "audit") {
    const preferred = /^(timestamp|createdAt|occurredAt|actorId|actorName|adminId|role|actorRole|action|target|targetId|result|success|requestId|auditId|reason|version|previousVersion|nextVersion)$/i;
    entries.sort(([a], [b]) => Number(preferred.test(b)) - Number(preferred.test(a)));
  }
  return entries.slice(0,24).map(([key,value])=>{
    const driverScreen = ["drivers", "driversOps", "vehicles", "kyc", "workingRoutes"].includes(String(screen));
    const adminIdentityValue = ["admins", "sessions"].includes(String(screen)) && typeof value === "string"
      ? /^(mobile|phone|contactNumber)$/i.test(key) ? maskPhone(value) : /^(email)$/i.test(key) ? maskEmail(value) : value
      : value;
    const safeValue = screen === "customers" && key.toLowerCase() === "mobile"
      ? (row.mobile ? maskPhone(row.mobile) : undefined)
      : (screen === "customers" || screen === "support") ? maskCustomerField(key, value) : adminIdentityValue;
    const operationalContactObject = ["live", "rides"].includes(String(screen)) && ["customer", "assignedDriver", "driver", "rideRequests", "ratings", "payment"].includes(key) && value !== null && typeof value === "object";
    const driverRelatedObject = driverScreen && ["user", "payoutProfile", "location", "vehicles", "workingRoutes"].includes(key) && value !== null && typeof value === "object";
    const customerRelatedObject = screen === "customers" && ["user", "bookings", "ratings", "supportCases", "sosEvents"].includes(key) && value !== null && typeof value === "object";
    const adminRelatedObject = ["admins", "scopeAssignments"].includes(String(screen)) && ["user", "role", "permissions", "admin"].includes(key) && value !== null && typeof value === "object";
    let displayValue: unknown = screen === "audit" && value !== null && typeof value === "object"
      ? "[Nested audit payload hidden pending verified audit-detail permissions]"
      : operationalContactObject || driverRelatedObject || customerRelatedObject || adminRelatedObject
        ? redactForDisplay(safeValue, 0, true)
        : safeValue;
    if (driverScreen && typeof value === "string" && /^(mobile|phone|contactNumber|email)$/i.test(key)) {
      displayValue = /email/i.test(key) ? maskEmail(value) : maskPhone(value);
    } else if (driverScreen && /^(address|homeAddress|workAddress|latitude|longitude|pickupAddress|dropAddress)$/i.test(key)) {
      displayValue = "[REDACTED FOR PRIVACY]";
    }
    return [key, redactForDisplay(displayValue, 0, screen === "support" || screen === "audit")] as [string, unknown];
  });
}
function sortRows(list: Row[], mode: SortMode): Row[] {
  return list.map((row, index) => ({ row, index })).sort((a, b) => {
    if (mode === "name") return primaryLabel(a.row, a.index).localeCompare(primaryLabel(b.row, b.index), "en", { sensitivity: "base" }) || a.index - b.index;
    if (mode === "status") return statusText(a.row).localeCompare(statusText(b.row)) || a.index - b.index;
    const dateOf = (row: Row) => Date.parse(String(row.updatedAt ?? row.createdAt ?? row.timestamp ?? row.date ?? ""));
    const at = dateOf(a.row), bt = dateOf(b.row);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return mode === "newest" ? bt - at : at - bt;
    if (Number.isFinite(at) !== Number.isFinite(bt)) return Number.isFinite(at) ? -1 : 1;
    return a.index - b.index;
  }).map(({ row }) => row);
}
function SortSelector({ value, onChange }: { value: SortMode; onChange: (mode: SortMode) => void }) {
  const { t } = useLanguage();
  return <label className="rx-sort-control"><span className="rx-sr-only">{t("common.sortRecords", "Sort records")}</span><select aria-label={t("common.sortRecords", "Sort records")} value={value} onChange={(event) => onChange(event.target.value as SortMode)}><option value="newest">{t("common.newestFirst", "Newest first")}</option><option value="oldest">{t("common.oldestFirst", "Oldest first")}</option><option value="name">{t("common.nameAZ", "Name A–Z")}</option><option value="status">{t("common.statusAZ", "Status A–Z")}</option></select></label>;
}
function RecordPager({ total, page, pageSize = DISPLAY_PAGE_SIZE, onPage }: { total: number; page: number; pageSize?: number; onPage: (next: number) => void }) {
  const { t } = useLanguage();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, first + pageSize - 1);
  return <div className="rx-pagination" aria-label={t("common.recordPagination", "Record pagination")}><span>{t("common.showingRecords", "Showing {first}–{last} of {total} loaded records").replace("{first}", String(first)).replace("{last}", String(last)).replace("{total}", String(total))}</span><div><button type="button" disabled={page <= 0} onClick={() => onPage(Math.max(0, page - 1))}>{t("common.previous", "Previous")}</button><span aria-live="polite">{t("common.pageOf", "Page {page} of {pageCount}").replace("{page}", String(page + 1)).replace("{pageCount}", String(pageCount))}</span><button type="button" disabled={page + 1 >= pageCount} onClick={() => onPage(Math.min(pageCount - 1, page + 1))}>{t("common.next", "Next")}</button></div></div>;
}
function searchPlaceholder(screen:Screen){ if(["locations","quickLocations","states","cities","routeBuilder","sharingRoutes","workingRoutes"].includes(screen)) return "Search name, city, address, route or ID"; if(["drivers","driversOps","kyc","vehicles"].includes(screen)) return "Search driver, mobile, vehicle or ID"; if(["rides","live","quickRide"].includes(screen)) return "Search ride, customer, driver, pickup or destination"; if(["customers"].includes(screen)) return "Search customer, mobile or ID"; if(["admins","sessions"].includes(screen)) return "Search admin, role or session"; return "Search this workspace"; }
const MAP_PRIMARY_SCREENS = new Set<Screen>(["live", "routeBuilder", "sharingRoutes", "cityZones"]);
const MAP_SUPPORT_SCREENS = new Set<Screen>(["driversOps", "drivers", "workingRoutes", "locations", "quickLocations", "rides", "safety", "events"]);

function workspacePresentation(screen: Screen): "map-primary" | "map-support" | "list-primary" {
  if (MAP_PRIMARY_SCREENS.has(screen)) return "map-primary";
  if (MAP_SUPPORT_SCREENS.has(screen)) return "map-support";
  return "list-primary";
}

function needsMap(screen:Screen){ return MAP_PRIMARY_SCREENS.has(screen) || MAP_SUPPORT_SCREENS.has(screen); }
function statusText(row: Row): string {
  const values = [row.status,row.state,row.approvalStatus,row.verificationStatus,row.paymentStatus,row.rideStatus,row.reviewStatus,row.lifecycleStatus,row.resultStatus,row.outcome,row.result];
  if (typeof row.success === "boolean") values.push(row.success ? "SUCCESS" : "FAILED");
  return values.filter(v=>v!==undefined&&v!==null).map(v=>String(v)).join(" ").toUpperCase();
}
function recordStatus(row: Row): string {
  const explicit = row.status ?? row.approvalStatus ?? row.verificationStatus ?? row.state ?? row.paymentStatus ?? row.rideStatus ?? row.reviewStatus ?? row.lifecycleStatus ?? row.resultStatus ?? row.outcome ?? row.result;
  if (explicit !== undefined && explicit !== null && String(explicit).trim()) return String(explicit);
  if (typeof row.success === "boolean") return row.success ? "SUCCESS" : "FAILED";
  return "AVAILABLE";
}
function statFor(screen:Screen, list:Row[], key:string){
  const k=key.toLowerCase();
  if(k==="total") return list.length;
  if(k==="active"||k==="online"||k==="available"||k==="approved"||k==="verified"||k==="open"||k==="success"||k==="paid"||k==="delivered"||k==="in progress"||k==="ongoing") return list.filter(r=>{
    const t=statusText(r);
    const boolMap:Record<string,unknown>={active:r.active ?? r.isActive, online:r.online ?? r.isOnline, available:r.available ?? r.isAvailable, approved:r.approved, verified:r.verified, open:r.open, success:r.success, paid:r.paid, delivered:r.delivered, "in progress":r.inProgress, ongoing:r.ongoing};
    if(boolMap[k] === true) return true;
    const patterns:Record<string,RegExp>={active:/ACTIVE|LIVE/,online:/ONLINE/,available:/AVAILABLE/,approved:/APPROVED/,verified:/VERIFIED/,open:/OPEN/,success:/SUCCESS|SUCCEEDED/,paid:/PAID/,delivered:/DELIVERED/,"in progress":/IN_PROGRESS|IN PROGRESS|ONGOING/,ongoing:/ONGOING/}; return patterns[k]?.test(t)??false;
  }).length;
  if(k==="pending"||k==="under review") return list.filter(r=>/PENDING|REVIEW|UNDER_REVIEW/.test(statusText(r))).length;
  if(k==="failed"||k==="rejected"||k==="cancelled") return list.filter(r=>/FAILED|REJECTED|CANCELLED|CANCELED|ERROR/.test(statusText(r))).length;
  if(k==="completed"||k==="resolved") return list.filter(r=>/COMPLETED|SUCCESS|SUCCEEDED|SETTLED|RESOLVED/.test(statusText(r))).length;
  if(k==="expired") return list.filter(r=>/EXPIRED/.test(statusText(r))).length;
  if(k==="escalated") return list.filter(r=>/ESCALATED/.test(statusText(r))).length;
  if(k==="read") return list.filter(r=>/READ/.test(statusText(r))).length;
  if(k==="inactive") return list.filter(r=>/INACTIVE|DISABLED|SUSPENDED/.test(statusText(r))).length;
  if(k==="refunded") return list.filter(r=>/REFUNDED/.test(statusText(r))).length;
  return 0;
}
function summaryLabels(screen:Screen):string[] {
  if(["live","rides","quickRide"].includes(screen)) return ["Total","Pending","In Progress","Completed","Cancelled"];
  if(["drivers","driversOps"].includes(screen)) return ["Total","Online","Available","Approved","Pending"];
  if(["vehicles"].includes(screen)) return ["Total","Active","Verified","Pending","Rejected"];
  if(["kyc"].includes(screen)) return ["Total","Approved","Pending","Under Review","Rejected"];
  if(["customers"].includes(screen)) return ["Total","Active","Inactive","Pending","Failed"];
  if(["states","cities","locations","quickLocations","cityZones"].includes(screen)) return ["Total","Active","Inactive","Pending","Rejected"];
  if(["routesOps","workingRoutes","routeBuilder","sharingRoutes","routeRules"].includes(screen)) return ["Total","Active","Pending","Completed","Rejected"];
  if(["payments"].includes(screen)) return ["Total","Success","Pending","Failed","Refunded"];
  if(["finance"].includes(screen)) return ["Total","Pending","Approved","Paid","Failed"];
  if(["pricing"].includes(screen)) return ["Total","Active","Inactive","Pending","Failed"];
  if(["promotions"].includes(screen)) return ["Total","Active","Pending","Expired","Failed"];
  if(["safety"].includes(screen)) return ["Total","Active","Pending","Resolved","Failed"];
  if(["support"].includes(screen)) return ["Total","Open","Pending","Resolved","Escalated"];
  if(["notifications"].includes(screen)) return ["Total","Delivered","Pending","Failed","Read"];
  if(["admins"].includes(screen)) return ["Total","Approved","Pending","Inactive","Rejected"];
  if(["sessions"].includes(screen)) return ["Total","Active","Expired","Revoked","Failed"];
  if(["audit"].includes(screen)) return ["Total","Success","Failed","Pending","Rejected"];
  if(["setup"].includes(screen)) return ["Total","Completed","Pending","Failed","Active"];
  if(["dataMerge"].includes(screen)) return ["Total","Pending","Approved","Completed","Rejected"];
  if(["backup"].includes(screen)) return ["Total","Active","Completed","Failed","Pending"];
  if(["events"].includes(screen)) return ["Total","Active","Pending","Completed","Cancelled"];
  return ["Total","Active","Pending","Failed","Rejected"];
}

function getActions(screen: Screen): ActionDef[] {
  switch (screen) {
    case "backup":
      return [
        { id: "create", title: "Create verified backup", description: "Creates a backend-verified database snapshot. Production requires explicit confirmation.", method: "POST", path: () => RIDEX_API.admin.backups, fields: [{ key: "scope", label: "Backup Scope", type: "select", options: [{ value: "FULL", label: "FULL" }] }, { key: "confirmation", label: "Production confirmation (only required in LIVE)", type: "text", placeholder: "CREATE PRODUCTION BACKUP" }], submitLabel: "Create Backup" },
        { id: "restore", title: "Restore verified backup", description: "Restores an existing verified snapshot. This is a destructive operation and must be confirmed exactly by environment.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.backups, v.backupId, "restore"), fields: [{ key: "backupId", label: "Backup ID", required: true }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "RESTORE TEST SNAPSHOT or RESTORE PRODUCTION SNAPSHOT" }], dangerous: true, confirmationKey: ["RESTORE TEST SNAPSHOT", "RESTORE PRODUCTION SNAPSHOT"], submitLabel: "Restore Backup" },
        { id: "failover", title: "Check failover readiness", description: "Reads the backend readiness state for an external recovery supervisor.", method: "GET", path: () => RIDEX_API.admin.failoverReadiness, submitLabel: "Check Readiness" },
      ];
    case "commission":
      return [{ id: "save", title: "Driver commission", description: "Updates Super Admin commission tiers. Enter percentages; the UI converts them to backend decimal rates.", method: "PUT", path: () => RIDEX_API.admin.driverCommission, fields: [{ key: "TOP_DRIVER", label: "Top Driver %", type: "percent", required: true, placeholder: "4" }, { key: "TOP_100", label: "Top 100 %", type: "percent", required: true, placeholder: "5" }, { key: "NEW_DRIVER", label: "New Driver %", type: "percent", required: true, placeholder: "15" }] }];
    case "otp":
      return [
        { id: "savePurpose", title: "Create or update OTP purpose", description: "Backend source confirms PUT /admin/configuration/otp/purposes/:purposeCode. UI writes remain blocked until changeReason is persisted in the required security audit record.", method: "PUT", path: (v) => resourcePath(RIDEX_API.admin.otpConfigurations, v.purposeCode), fields: [{ key: "purposeCode", label: "Purpose Code (ROLE.CATEGORY.EXACT_ACTION)", required: true }, { key: "purposeCategory", label: "Purpose Category", required: true }, { key: "deliveryMethod", label: "Delivery Method", type: "select", options: [{ value: "PROVIDER_OTP", label: "PROVIDER_OTP" }, { value: "PUSH", label: "PUSH" }], required: true }, { key: "expirySeconds", label: "Expiry Seconds", type: "number", required: true }, { key: "wrongAttemptLimit", label: "Wrong Attempt Limit", type: "number", required: true }, { key: "resendIntervalSeconds", label: "Resend Interval Seconds", type: "number", required: true }, { key: "maxResendLimit", label: "Maximum Resends", type: "number", required: true }, { key: "cooldownSeconds", label: "Cooldown Seconds", type: "number", required: true }, { key: "notificationRetryCount", label: "Notification Retry Count", type: "number", required: true }, { key: "notificationRetryIntervalSeconds", label: "Notification Retry Interval Seconds", type: "number", required: true }, { key: "changeReason", label: "Change Reason", type: "textarea", required: true, maxLength: 500 }], submitLabel: "Save OTP Purpose", requiresVerifiedContract: true },
        { id: "history", title: "OTP purpose history", description: "Loads saved versions for one purpose code without changing state.", method: "GET", path: (v) => resourcePath(RIDEX_API.admin.otpConfigurations, v.purposeCode, "history"), fields: [{ key: "purposeCode", label: "Purpose Code", required: true }], submitLabel: "Load Purpose History" },
        { id: "globalHistory", title: "OTP global configuration history", description: "Reads global versions, operation IDs and affected purpose codes.", method: "GET", path: () => RIDEX_API.admin.otpGlobalHistory, submitLabel: "Load Global History" },
        { id: "rollback", title: "Rollback global OTP configuration", description: "Backend rollback is global and creates a new version. Mutation remains blocked until the operator's change reason is durably included in the full security audit.", method: "POST", path: () => RIDEX_API.admin.otpRollback, fields: [{ key: "targetVersion", label: "Target Global Version", type: "number", required: true }, { key: "changeReason", label: "Change Reason", type: "textarea", required: true, maxLength: 500 }], dangerous: true, submitLabel: "Rollback Global OTP Configuration", requiresVerifiedContract: true },
        { id: "deletePurpose", title: "Permanently delete OTP purpose", description: "Destructive operation. This action cannot be restored. Writes remain blocked because the backend delete audit does not yet prove that the supplied change reason is recorded in the required security audit.", method: "DELETE", path: (v) => resourcePath(RIDEX_API.admin.otpConfigurations, v.purposeCode), fields: [{ key: "purposeCode", label: "Exact Purpose Code", required: true }, { key: "changeReason", label: "Reason for deletion", type: "textarea", required: true, maxLength: 500 }, { key: "confirmation", label: "Type DELETE OTP PURPOSE to confirm", required: true, placeholder: "DELETE OTP PURPOSE", confirmationOnly: true }], dangerous: true, confirmationKey: "DELETE OTP PURPOSE", submitLabel: "Permanently Delete OTP Purpose", requiresVerifiedContract: true },
      ];
    case "kyc":
    case "vehicles":
      return [
        { id: "vehicleReview", title: "Review driver vehicle", description: "Updates a driver vehicle review status using the backend review endpoint.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.drivers, v.driverId, "vehicles", v.vehicleId, "review"), fields: [{ key: "driverId", label: "Driver ID", required: true }, { key: "vehicleId", label: "Vehicle ID", required: true }, { key: "status", label: "Status", type: "select", options: [{ value: "VERIFIED", label: "VERIFIED" }, { value: "ACTIVE", label: "ACTIVE" }, { value: "REJECTED", label: "REJECTED" }, { value: "INACTIVE", label: "INACTIVE" }, { value: "PENDING", label: "PENDING" }, { value: "UNDER_REVIEW", label: "UNDER_REVIEW" }] }, { key: "changeReason", label: "Change Reason" }], submitLabel: "Review Vehicle" },
        { id: "documentReview", title: "Review driver document", description: "Uses the backend document-review endpoint. Allowed statuses are APPROVED, REJECTED and UNDER_REVIEW; rejection requires a reason. Mutation remains blocked until the exact write contract and geographic authorization are approved.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.drivers, v.driverId, "documents", v.documentId, "review"), fields: [{ key: "driverId", label: "Driver ID", required: true }, { key: "documentId", label: "Document ID", required: true }, { key: "status", label: "Review Status", type: "select", options: [{ value: "APPROVED", label: "APPROVED" }, { value: "REJECTED", label: "REJECTED" }, { value: "UNDER_REVIEW", label: "UNDER_REVIEW" }] }, { key: "rejectionReason", label: "Rejection Reason (required when REJECTED)", type: "textarea", maxLength: 500 }], submitLabel: "Review Document" },
      ];
    case "workingRoutes":
      return [
        { id: "create", title: "Add driver working route", description: "Adds a route to the selected driver. The backend enforces the maximum of five active routes.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.drivers, v.driverId, "working-routes"), fields: [{ key: "driverId", label: "Driver ID", required: true }, { key: "name", label: "Route Name", required: true }, { key: "sequence", label: "Sequence", type: "number" }, { key: "startAddress", label: "Start Address" }, { key: "endAddress", label: "End Address" }, { key: "startLat", label: "Start Latitude", type: "number" }, { key: "startLng", label: "Start Longitude", type: "number" }, { key: "endLat", label: "End Latitude", type: "number" }, { key: "endLng", label: "End Longitude", type: "number" }, { key: "active", label: "Active", type: "checkbox" }], submitLabel: "Create Route" },
        { id: "review", title: "Review working route", description: "Approves, rejects, resets or inactivates a driver working route.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.drivers, v.driverId, "working-routes", v.routeId, "review"), fields: [{ key: "driverId", label: "Driver ID", required: true }, { key: "routeId", label: "Route ID", required: true }, { key: "status", label: "Review Status", type: "select", options: [{ value: "APPROVED", label: "APPROVED" }, { value: "REJECTED", label: "REJECTED" }, { value: "PENDING", label: "PENDING" }, { value: "INACTIVE", label: "INACTIVE" }] }, { key: "changeReason", label: "Change Reason" }], submitLabel: "Review Route" },
        { id: "delete", title: "Delete working route", description: "Permanently deletes the selected working route using the backend delete endpoint.", method: "DELETE", path: (v) => resourcePath(RIDEX_API.admin.drivers, v.driverId, "working-routes", v.routeId), fields: [{ key: "driverId", label: "Driver ID", required: true }, { key: "routeId", label: "Route ID", required: true }, { key: "changeReason", label: "Change Reason" }], dangerous: true, submitLabel: "Delete Route" },
      ];
    case "drivers":
    case "driversOps":
      return [
        { id: "status", title: "Update driver status", description: "Uses the backend status endpoint with permission checks and confirmation for suspension.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.drivers, v.driverId, "status"), fields: [{ key: "driverId", label: "Driver ID", required: true }, { key: "status", label: "Status", type: "select", options: [{ value: "ACTIVE", label: "ACTIVE" }, { value: "OFFLINE", label: "OFFLINE" }, { value: "SUSPENDED", label: "SUSPENDED" }] }, { key: "confirmation", label: "Suspension confirmation (only when SUSPENDED)", placeholder: "SUSPEND DRIVER" }], dangerous: true, confirmationKey: "SUSPEND DRIVER", submitLabel: "Update Status" },
        { id: "verification", title: "Update driver verification", description: "Uses the backend KYC/verification readiness checks before APPROVED is accepted.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.drivers, v.driverId, "verification"), fields: [{ key: "driverId", label: "Driver ID", required: true }, { key: "verificationStatus", label: "Verification Status", type: "select", options: [{ value: "PENDING", label: "PENDING" }, { value: "UNDER_REVIEW", label: "UNDER_REVIEW" }, { value: "APPROVED", label: "APPROVED" }, { value: "REJECTED", label: "REJECTED" }] }, { key: "changeReason", label: "Change Reason" }], submitLabel: "Update Verification" },
        { id: "top", title: "Set / remove Top Driver", description: "Super Admin only. Select a city to mark the driver as a Top Driver for that city.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.drivers, v.driverId, "top-driver"), fields: [{ key: "driverId", label: "Driver ID", required: true }, { key: "cityId", label: "City ID", required: true }], submitLabel: "Set Top Driver" },
        { id: "remove-top", title: "Remove Top Driver", description: "Super Admin only. Deactivates the Top Driver mapping for a driver/city.", method: "DELETE", path: (v) => withQuery(resourcePath(RIDEX_API.admin.drivers, v.driverId, "top-driver"), { cityId: v.cityId }), fields: [{ key: "driverId", label: "Driver ID", required: true }, { key: "cityId", label: "City ID", required: true }], submitLabel: "Remove Top Driver" },
      ];
    case "admins":
      return [
        { id: "create", title: "Create admin account", description: "Admin creation stays blocked: backend creates PENDING accounts but does not persist the required stateId/cityId assignment. Do not create an unscoped Admin until a scoped creation/assignment API and direct-API tests are available.", method: "POST", path: () => RIDEX_API.admin.admins, fields: [{ key: "name", label: "Name", required: true }, { key: "mobile", label: "Mobile", required: true }, { key: "email", label: "Email" }, { key: "role", label: "Role", required: true, placeholder: "STATE_ADMIN / CITY_ADMIN / ..." }, { key: "workingLocation", label: "Working Location" }, { key: "department", label: "Department" }, { key: "operatingRegion", label: "Operating Region" }, { key: "workAddress", label: "Work Address" }, { key: "requestedRole", label: "Requested Role" }, { key: "accessReason", label: "Access Reason", type: "textarea" }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "CREATE ADMIN" }], dangerous: true, confirmationKey: "CREATE ADMIN", submitLabel: "Create Admin" },
        { id: "approve", title: "Approve admin", description: "Super Admin approval flow. Backend requires exact confirmation.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.admins, v.adminId, "approve"), fields: [{ key: "adminId", label: "Admin ID", required: true }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "APPROVE ADMIN" }], dangerous: true, confirmationKey: "APPROVE ADMIN", submitLabel: "Approve" },
        { id: "reject", title: "Reject admin", description: "Super Admin rejection flow. Backend requires exact confirmation.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.admins, v.adminId, "reject"), fields: [{ key: "adminId", label: "Admin ID", required: true }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "REJECT ADMIN" }], dangerous: true, confirmationKey: "REJECT ADMIN", submitLabel: "Reject" },
        { id: "suspend", title: "Suspend admin", description: "Suspends another admin. Self-suspension is rejected by the backend.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.admins, v.adminId, "suspend"), fields: [{ key: "adminId", label: "Admin ID", required: true }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "SUSPEND ADMIN" }], dangerous: true, confirmationKey: "SUSPEND ADMIN", submitLabel: "Suspend" },
        { id: "reactivate", title: "Reactivate admin", description: "Reactivates a suspended admin subject to backend permissions.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.admins, v.adminId, "reactivate"), fields: [{ key: "adminId", label: "Admin ID", required: true }], submitLabel: "Reactivate" },
        { id: "application", title: "Update admin application details", description: "Updates working location, department, operating region, work address, requested role and access reason.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.admins, v.adminId, "application-details"), fields: [{ key: "adminId", label: "Admin ID", required: true }, { key: "workingLocation", label: "Working Location" }, { key: "department", label: "Department" }, { key: "operatingRegion", label: "Operating Region" }, { key: "workAddress", label: "Work Address" }, { key: "requestedRole", label: "Requested Role" }, { key: "accessReason", label: "Access Reason", type: "textarea" }], submitLabel: "Save Application" },
      ];
    case "roles":
      return [{ id: "permissions", title: "Replace role permissions", description: "Replaces the selected role permission set. Enter comma-separated Permission IDs. Backend requires admins:MANAGE_PERMISSIONS, exact confirmation and writes before/after permission snapshots to audit. System-role changes are Super Admin-only.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.roles, v.roleId, "permissions"), fields: [{ key: "roleId", label: "Role ID", required: true }, { key: "permissionIds", label: "Permission IDs (comma-separated)", required: true }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "CHANGE PERMISSIONS" }], dangerous: true, confirmationKey: "CHANGE PERMISSIONS", submitLabel: "Update Permissions", requiresVerifiedContract: true }];
    case "setup":
      return [
        { id: "seed", title: "Seed TEST data", description: "Creates the backend-approved TEST fixture set. TEST-only and requires exact confirmation.", method: "POST", path: () => RIDEX_API.admin.testDataSeed, fields: [{ key: "confirmation", label: "Confirmation", required: true, placeholder: "SEED RIDEX V3.5 TEST DATA" }], dangerous: true, confirmationKey: "SEED RIDEX V3.5 TEST DATA", submitLabel: "Seed TEST Data" },
        { id: "delete", title: "Delete TEST data", description: "Deletes TEST fixture data. TEST-only and requires exact confirmation.", method: "DELETE", path: () => RIDEX_API.admin.testData, fields: [{ key: "confirmation", label: "Confirmation", required: true, placeholder: "DELETE RIDEX V3.5 TEST DATA" }], dangerous: true, confirmationKey: "DELETE RIDEX V3.5 TEST DATA", submitLabel: "Delete TEST Data" },
        { id: "pickup", title: "Setup test pickup driver", description: "Creates the backend-defined TEST pickup-truck driver fixture.", method: "POST", path: () => RIDEX_API.admin.setupTestPickup, fields: [{ key: "confirmation", label: "Confirmation", required: true, placeholder: "SETUP TEST PICKUP" }], dangerous: true, confirmationKey: "SETUP TEST PICKUP", submitLabel: "Setup Pickup" },
        { id: "passenger", title: "Setup test passenger", description: "Creates the backend-defined TEST passenger fixture. TEST-only and requires exact confirmation.", method: "POST", path: () => RIDEX_API.admin.setupTestPassenger, fields: [{ key: "confirmation", label: "Confirmation", required: true, placeholder: "SETUP TEST PASSENGER" }], dangerous: true, confirmationKey: "SETUP TEST PASSENGER", submitLabel: "Setup Passenger" },
      ];
    case "platform":
      return [
        { id: "environment", title: "Environment control", description: "The locked backend only permits an explicit TEST activation here. PRODUCTION is entered through the release deployment flow.", method: "PUT", path: () => RIDEX_API.admin.platformEnvironment, fields: [{ key: "environment", label: "Target Environment", type: "select", options: [{ value: "TEST", label: "TEST" }] }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "SET ENVIRONMENT TO TEST" }], dangerous: true, confirmationKey: "SET ENVIRONMENT TO TEST", submitLabel: "Set TEST" },
        { id: "addTester", title: "Add TEST tester", description: "Adds a mobile number to the backend-approved tester list.", method: "POST", path: () => RIDEX_API.admin.platformTesters, fields: [{ key: "mobile", label: "Mobile", required: true }, { key: "label", label: "Label" }], submitLabel: "Add Tester" },
        { id: "removeTester", title: "Remove TEST tester", description: "Removes an approved tester by mobile number.", method: "DELETE", path: (v) => resourcePath(RIDEX_API.admin.platformTesters, v.mobile), fields: [{ key: "mobile", label: "Mobile", required: true }], submitLabel: "Remove Tester" },
        { id: "releaseCreate", title: "Create release", description: "Registers a release in TEST with version, label, checksum/source hash and notes.", method: "POST", path: () => RIDEX_API.admin.platformReleases, fields: [{ key: "version", label: "Version", required: true }, { key: "sourceLabel", label: "Source Label" }, { key: "checksum", label: "Checksum" }, { key: "sourceHash", label: "Source Hash" }, { key: "notes", label: "Notes", type: "textarea" }], submitLabel: "Create Release" },
        { id: "testStart", title: "Start release testing", description: "Moves a release into TESTING through the backend release lifecycle.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.platformReleases, v.releaseId, "test-start"), fields: [{ key: "releaseId", label: "Release ID", required: true }], submitLabel: "Start Testing" },
        { id: "testComplete", title: "Complete release test", description: "Records passed/failed/error counts and produces the backend PASS/FAILED state.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.platformReleases, v.releaseId, "test-complete"), fields: [{ key: "releaseId", label: "Release ID", required: true }, { key: "passed", label: "Passed", type: "number", required: true }, { key: "failed", label: "Failed", type: "number", required: true }, { key: "errors", label: "Errors", type: "number", required: true }, { key: "testerMobile", label: "Approved Tester Mobile" }, { key: "name", label: "Test Run Name" }, { key: "notes", label: "Notes", type: "textarea" }], submitLabel: "Complete Test" },
        { id: "approveRelease", title: "Approve TEST release", description: "Allows a PASSED TEST release to enter the approved state.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.platformReleases, v.releaseId, "approve"), fields: [{ key: "releaseId", label: "Release ID", required: true }], submitLabel: "Approve Release" },
        { id: "promote", title: "Promote to production", description: "Starts the backend deployment handoff from an APPROVED TEST release. Runtime activation occurs on the deployed production process.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.platformReleases, v.releaseId, "promote"), fields: [{ key: "releaseId", label: "Release ID", required: true }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "PROMOTE TO PRODUCTION" }], dangerous: true, confirmationKey: "PROMOTE TO PRODUCTION", submitLabel: "Promote" },
        { id: "activate", title: "Acknowledge production activation", description: "Acknowledges activation from a PRODUCTION runtime; the backend rejects this call from TEST.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.platformReleases, v.releaseId, "activate-production"), fields: [{ key: "releaseId", label: "Release ID", required: true }], submitLabel: "Activate Production" },
        { id: "rollbackRelease", title: "Rollback production release", description: "Creates a rollback release from the previous deployed production release. Backend requires exact confirmation.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.platformReleases, v.releaseId, "rollback"), fields: [{ key: "releaseId", label: "Deployed Release ID", required: true }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "ROLLBACK PRODUCTION" }], dangerous: true, confirmationKey: "ROLLBACK PRODUCTION", submitLabel: "Rollback" },
        { id: "appLinks", title: "Public app download links", description: "Saving stays blocked: the backend records before/after configuration but does not persist an operator change reason in the audit record. Enable only after the backend audit contract is updated and verified.", method: "PUT", path: () => RIDEX_API.admin.appDownloadLinks, fields: [{ key: "customerUrl", label: "Customer App URL", required: true }, { key: "driverUrl", label: "Driver App URL", required: true }, { key: "enabled", label: "Enabled", type: "checkbox" }], submitLabel: "Save App Links", requiresVerifiedContract: true },
      ];
    case "reports":
      return [];
    case "dataMerge":
      return [
        { id: "merge", title: "Create data-merge review job", description: "Creates a review-controlled historical/current merge job in the backend.", method: "POST", path: () => RIDEX_API.admin.dataMerge, fields: [{ key: "name", label: "Job Name", required: true, placeholder: "Historical + Current Review" }, { key: "sourceScope", label: "Source Scope", placeholder: "HISTORICAL_CURRENT" }, { key: "sourceQuery", label: "Source Query (JSON object)", type: "json", required: true, placeholder: '{"routeIds":["route-id-1"],"targetDataset":"CURRENT"}' }], submitLabel: "Create Merge Job" },
        { id: "executeMerge", title: "Execute approved merge", description: "Executes a reviewed merge job against the backend target dataset.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.dataMerge, v.mergeId, "execute"), fields: [{ key: "mergeId", label: "Merge Job ID", required: true }, { key: "targetDataset", label: "Target Dataset", type: "select", required: true, options: [{ value: "CURRENT", label: "CURRENT" }, { value: "HISTORICAL", label: "HISTORICAL" }] }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "EXECUTE REVIEWED MERGE" }], dangerous: true, confirmationKey: "EXECUTE REVIEWED MERGE", submitLabel: "Execute Merge" },
        { id: "reviewMerge", title: "Review merge job", description: "Marks a merge job approved or rejected using the backend review endpoint.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.dataMerge, v.mergeId, "review"), fields: [{ key: "mergeId", label: "Merge Job ID", required: true }, { key: "approved", label: "Approved", type: "checkbox" }], submitLabel: "Save Review" },
      ];
    case "sharingRoutes":
      return [
        { id: "create", title: "Create Sharing Ride route", description: "Creates a shared-route definition. Active routes must have at least two active points; points are sent as JSON.", method: "POST", path: () => RIDEX_API.admin.sharedRoutes, fields: [{ key: "name", label: "Route Name", required: true }, { key: "city", label: "City" }, { key: "cityId", label: "City ID" }, { key: "cityZoneId", label: "City Zone ID" }, { key: "selectionMode", label: "Selection Mode", type: "select", options: [{ value: "AUTO_NEAREST", label: "AUTO_NEAREST" }, { value: "CUSTOMER_SELECTED", label: "CUSTOMER_SELECTED" }] }, { key: "active", label: "Active", type: "checkbox" }, { key: "points", label: "Points JSON", type: "json", required: true, placeholder: '[{"sequence":1,"name":"Point A","address":"...","latitude":25.1,"longitude":85.1,"active":true}]' }], submitLabel: "Create Shared Route" },
        { id: "update", title: "Edit Sharing Ride route", description: "Updates route metadata through the backend shared-route edit endpoint.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.sharedRoutes, v.routeId), fields: [{ key: "routeId", label: "Route ID", required: true }, { key: "name", label: "Route Name" }, { key: "city", label: "City" }, { key: "cityId", label: "City ID" }, { key: "cityZoneId", label: "City Zone ID" }, { key: "selectionMode", label: "Selection Mode", type: "select", options: [{ value: "AUTO_NEAREST", label: "AUTO_NEAREST" }, { value: "CUSTOMER_SELECTED", label: "CUSTOMER_SELECTED" }] }, { key: "active", label: "Active", type: "checkbox" }], submitLabel: "Save Shared Route" },
        { id: "addPoint", title: "Add shared-route point", description: "Adds a point to an existing shared route with validated coordinates and sequence.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.sharedRoutes, v.routeId, "points"), fields: [{ key: "routeId", label: "Route ID", required: true }, { key: "sequence", label: "Sequence", type: "number", required: true }, { key: "name", label: "Point Name", required: true }, { key: "address", label: "Address", required: true }, { key: "latitude", label: "Latitude", type: "number", required: true }, { key: "longitude", label: "Longitude", type: "number", required: true }, { key: "active", label: "Active", type: "checkbox" }], submitLabel: "Add Point" },
        { id: "editPoint", title: "Edit shared-route point", description: "Updates an existing route point using the backend point endpoint.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.sharedRoutePoints, v.pointId), fields: [{ key: "pointId", label: "Point ID", required: true }, { key: "sequence", label: "Sequence", type: "number" }, { key: "name", label: "Point Name" }, { key: "address", label: "Address" }, { key: "latitude", label: "Latitude", type: "number" }, { key: "longitude", label: "Longitude", type: "number" }, { key: "active", label: "Active", type: "checkbox" }], submitLabel: "Save Point" },
        { id: "deactivatePoint", title: "Deactivate shared-route point", description: "Deactivates a point while preserving backend route constraints.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.sharedRoutePoints, v.pointId, "deactivate"), fields: [{ key: "pointId", label: "Point ID", required: true }], submitLabel: "Deactivate Point" },
      ];
    case "notifications":
      return [{ id: "broadcast", title: "Broadcast notification", description: "Sends an Admin broadcast through the backend notification service. Audience and message are validated by the backend.", method: "POST", path: () => RIDEX_API.admin.notificationsBroadcast, fields: [{ key: "audience", label: "Audience", required: true, placeholder: "CUSTOMERS / DRIVERS / ALL" }, { key: "title", label: "Title", required: true }, { key: "body", label: "Body", type: "textarea", required: true }], submitLabel: "Send Broadcast" }];
    case "promotions":
      return [{ id: "create", title: "Create promotion", description: "Creates a backend promotion record.", method: "POST", path: () => RIDEX_API.admin.promotions, fields: [{ key: "code", label: "Code", required: true }, { key: "description", label: "Description" }, { key: "discountType", label: "Discount Type", required: true, placeholder: "PERCENT / FIXED" }, { key: "discountValue", label: "Discount Value", type: "number", required: true }, { key: "maxDiscount", label: "Max Discount", type: "number" }, { key: "minFare", label: "Min Fare", type: "number" }, { key: "rideScope", label: "Ride Scope", placeholder: "ALL" }, { key: "validFrom", label: "Valid From", required: true }, { key: "validUntil", label: "Valid Until", required: true }], submitLabel: "Create Promotion" }];
    case "matching":
      return [{ id:"save", title:"Matching Configuration", description:"Updates the deterministic matching configuration for the active environment. The backend validates every field and versions successful changes.", method:"PUT", path:()=>RIDEX_API.admin.matchingConfiguration, fields:[
        {key:"defaultMode",label:"Default Mode",type:"select",options:[{value:"HYBRID",label:"HYBRID"},{value:"AUTOMATIC",label:"AUTOMATIC"},{value:"ADMIN_CONTROLLED",label:"ADMIN_CONTROLLED"}]},
        {key:"locationMatchRadiusMeters",label:"Location Match Radius (m)",type:"number"},{key:"pickupRadiusMeters",label:"Pickup Radius (m)",type:"number"},{key:"dropRadiusMeters",label:"Drop Radius (m)",type:"number"},
        {key:"maxDetourKm",label:"Max Detour (km)",type:"number"},{key:"maxPickupEtaMinutes",label:"Max Pickup ETA (min)",type:"number"},{key:"gpsFreshnessSeconds",label:"GPS Freshness (s)",type:"number"},{key:"offerTimeoutSeconds",label:"Offer Timeout (s)",type:"number"},{key:"retryCount",label:"Retry Count",type:"number"},{key:"maxPickupDistanceKm",label:"Max Pickup Distance (km)",type:"number"},
        {key:"fallbackEnabled",label:"Fallback Enabled",type:"checkbox"},{key:"fallbackLevels",label:"Fallback Levels (comma-separated)",type:"csv"},{key:"onlineOnly",label:"Online Only",type:"checkbox"},{key:"excludeBusyDrivers",label:"Exclude Busy Drivers",type:"checkbox"},
        {key:"scheduledEnabled",label:"Scheduled Enabled",type:"checkbox"},
        {key:"speedKmh",label:"Speed (km/h)",type:"number"},{key:"distanceWeight",label:"Distance Weight",type:"number"},{key:"etaWeight",label:"ETA Weight",type:"number"},{key:"sharedDetourKm",label:"Shared Detour (km)",type:"number"}
      ], submitLabel:"Save Matching Configuration"}];
    case "events":
      return [
        {id:"create",title:"Create Event",description:"Creates an event with 6–10 geographic stops and at least one session. Enter stops and sessions as JSON arrays; backend validates all coordinates and times.",method:"POST",path:()=>RIDEX_API.admin.events,fields:[{key:"name",label:"Event Name",required:true},{key:"description",label:"Description",type:"textarea"},{key:"startsAt",label:"Starts At"},{key:"endsAt",label:"Ends At"},{key:"stops",label:"Stops JSON",type:"json",required:true,placeholder:'[{"name":"Stop 1","address":"...","latitude":25.1,"longitude":85.1}]'},{key:"sessions",label:"Sessions JSON",type:"json",required:true,placeholder:'[{"startsAt":"2026-10-10T09:00:00+05:30","endsAt":"2026-10-10T11:00:00+05:30","startSequence":1,"endSequence":6,"capacity":20,"fare":30}]'}],submitLabel:"Create Event"},
        {id:"update",title:"Edit Draft Event",description:"Updates name, description or event time. Published events must be unpublished before editing.",method:"PATCH",path:v=>resourcePath(RIDEX_API.admin.events, v.eventId),fields:[{key:"eventId",label:"Event ID",required:true},{key:"name",label:"Name"},{key:"description",label:"Description",type:"textarea"},{key:"startsAt",label:"Starts At"},{key:"endsAt",label:"Ends At"}],submitLabel:"Save Event"},
        {id:"publish",title:"Publish Event",description:"Publishes a valid 6–10 stop event and opens its draft sessions.",method:"POST",path:v=>resourcePath(RIDEX_API.admin.events, v.eventId, "publish"),fields:[{key:"eventId",label:"Event ID",required:true}],submitLabel:"Publish"},
        {id:"unpublish",title:"Unpublish Event",description:"Unpublishes an event only when it has no active bookings.",method:"POST",path:v=>resourcePath(RIDEX_API.admin.events, v.eventId, "unpublish"),fields:[{key:"eventId",label:"Event ID",required:true}],submitLabel:"Unpublish"},
        {id:"delete",title:"Delete Event",description:"Deletes an event when the backend confirms there are no active bookings.",method:"DELETE",path:v=>resourcePath(RIDEX_API.admin.events, v.eventId),fields:[{key:"eventId",label:"Event ID",required:true}],dangerous:true,submitLabel:"Delete Event"}
      ];
    case "fieldOps":
      return [];
    case "support":
      return [
        { id:"update", title:"Update support case", description:"Status and assignment changes require an audited reason. The backend must validate the current state, scope and allowed transition, persist changeReason in the audit record, and only allow REOPENED from RESOLVED or CLOSED.", method:"PATCH", path:(v)=>resourcePath(RIDEX_API.support.adminCases, v.caseId), fields:[{key:"caseId",label:"Case ID",required:true},{key:"status",label:"Status",type:"select",options:[{value:"",label:"No change"},{value:"OPEN",label:"OPEN"},{value:"IN_PROGRESS",label:"IN_PROGRESS"},{value:"RESOLVED",label:"RESOLVED"},{value:"CLOSED",label:"CLOSED"},{value:"REOPENED",label:"REOPENED"}]},{key:"priority",label:"Priority",type:"select",options:[{value:"",label:"No change"},{value:"LOW",label:"LOW"},{value:"NORMAL",label:"NORMAL"},{value:"HIGH",label:"HIGH"},{value:"URGENT",label:"URGENT"}]},{key:"assignedAdminId",label:"Assigned Admin ID"},{key:"changeReason",label:"Reason for update",type:"textarea",required:true,maxLength:2000}], submitLabel:"Save Case", requiresVerifiedContract:true },
        { id:"internalNote", title:"Add internal note", description:"Adds an Admin-only internal note. Do not include passwords, OTPs, full payment payloads or unnecessary personal data. The UI generates an Idempotency-Key automatically.", method:"POST", path:(v)=>resourcePath(RIDEX_API.support.adminCases, v.caseId, "internal-notes"), fields:[{key:"caseId",label:"Case ID",required:true},{key:"note",label:"Internal Note",type:"textarea",required:true,maxLength:2000}], submitLabel:"Add Note", requiresVerifiedContract:true },
        { id:"escalate", title:"Escalate support case", description:"Routes the case to CITY, STATE or GLOBAL escalation using the backend escalation endpoint.", method:"PATCH", path:(v)=>resourcePath(RIDEX_API.support.adminCases, v.caseId, "escalation"), fields:[{key:"caseId",label:"Case ID",required:true},{key:"escalationLevel",label:"Escalation Level",type:"select",options:[{value:"CITY",label:"CITY"},{value:"STATE",label:"STATE"},{value:"GLOBAL",label:"GLOBAL"}]},{key:"escalationRole",label:"Escalation Role",required:true}], submitLabel:"Escalate", requiresVerifiedContract:true },
        { id:"supportMessage", title:"Reply to customer/driver", description:"Admin reply uses an idempotent backend route, but source review did not find an explicit case-level scope check in this handler. This action remains blocked until the backend authorization gap is fixed.", method:"POST", path:(v)=>resourcePath(RIDEX_API.support.adminCases, v.caseId, "messages"), fields:[{key:"caseId",label:"Case ID",required:true},{key:"message",label:"Message",type:"textarea",required:true,maxLength:2000}], submitLabel:"Send Reply", requiresVerifiedContract:true }
      ];

    case "quickRide":
      return [{ id: "create", title: "Quick Ride", description: "Uses the real backend quick-create endpoint. The endpoint only requires a valid Customer ID; the underlying booking router remains the source of truth for booking details.", method: "POST", path: () => RIDEX_API.admin.quickBooking, fields: [{ key: "customerId", label: "Customer ID", required: true }], submitLabel: "Create Quick Ride" }];
    case "finance":
      return [
        { id: "pay", title: "Approve and pay settlement", description: "Admin finance endpoint requires a valid Idempotency-Key and exact PAY confirmation. The UI generates the key per submission.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.settlements, v.settlementId, "approve-and-pay"), fields: [{ key: "settlementId", label: "Settlement ID", required: true }, { key: "mode", label: "Payout Mode", type: "select", options: [{ value: "IMPS", label: "IMPS" }, { value: "NEFT", label: "NEFT" }] }, { key: "confirmation", label: "Confirmation", required: true, placeholder: "PAY" }], dangerous: true, confirmationKey: "PAY", submitLabel: "Approve & Pay" },
        { id: "reconcile", title: "Reconcile payout attempt", description: "Runs the backend payout reconciliation endpoint for one payout attempt.", method: "POST", path: (v) => resourcePath(RIDEX_API.admin.payoutsReconcile, v.attemptId), fields: [{ key: "attemptId", label: "Payout Attempt ID", required: true }], submitLabel: "Reconcile" },
      ];
    case "pricing":
      return [{ id: "createPricing", title: "Create pricing rule", description: "Creates a deterministic pricing rule through the backend operations API. This mutation stays blocked until its complete request, authorization and geographic-scope contract is verified.", method: "POST", path: () => RIDEX_API.admin.pricingRules, requiresVerifiedContract: true, fields: [
        { key: "name", label: "Name", required: true, maxLength: 120 },
        { key: "serviceType", label: "Service Type" }, { key: "bookingType", label: "Booking Type" }, { key: "rideType", label: "Ride Type" }, { key: "vehicleType", label: "Vehicle Type" }, { key: "zoneId", label: "Zone ID" },
        { key: "dayOfWeek", label: "Day of Week" }, { key: "startTime", label: "Start Time", placeholder: "HH:mm" }, { key: "endTime", label: "End Time", placeholder: "HH:mm" },
        { key: "demandMin", label: "Demand Minimum", type: "number" }, { key: "demandMax", label: "Demand Maximum", type: "number" },
        { key: "minFare", label: "Minimum Fare", type: "number" }, { key: "maxFare", label: "Maximum Fare", type: "number" }, { key: "baseFare", label: "Base Fare", type: "number" },
        { key: "perKm", label: "Per Km", type: "number" }, { key: "perMinute", label: "Per Minute", type: "number" }, { key: "waitingPerMinute", label: "Waiting / Minute", type: "number" }, { key: "weightPerKg", label: "Weight / Kg", type: "number" },
        { key: "multiplier", label: "Multiplier", type: "number", placeholder: "1" }, { key: "priority", label: "Priority", type: "number", placeholder: "0" }, { key: "active", label: "Active", type: "checkbox" }, { key: "metadata", label: "Metadata JSON", type: "json" },
        { key: "changeReason", label: "Change Reason", type: "textarea", required: true, maxLength: 500, helper: "Explain why this pricing rule is being proposed. The backend remains authoritative for validation and audit." }
      ], submitLabel: "Create Pricing Rule" }];
    case "locations":
      return [{ id: "create", title: "Create location", description: "Creates an operational location through the backend location API.", method: "POST", path: () => RIDEX_API.admin.locations, fields: [{ key: "name", label: "Name", required: true }, { key: "city", label: "City", required: true }, { key: "state", label: "State", required: true }, { key: "category", label: "Category", placeholder: "LANDMARK" }, { key: "type", label: "Type", placeholder: "LANDMARK" }, { key: "address", label: "Address", required: true }, { key: "latitude", label: "Latitude", type: "number", required: true }, { key: "longitude", label: "Longitude", type: "number", required: true }, { key: "cityId", label: "City ID" }, { key: "pincode", label: "Pincode" }, { key: "pickupAllowed", label: "Pickup Allowed", type: "checkbox" }, { key: "dropAllowed", label: "Drop Allowed", type: "checkbox" }, { key: "pickupRadiusMeters", label: "Pickup Radius (m)", type: "number" }, { key: "dropRadiusMeters", label: "Drop Radius (m)", type: "number" }, { key: "active", label: "Active", type: "checkbox" }], submitLabel: "Create Location" }];
    case "routeBuilder":
    case "routesOps":
      return [
        { id: "create", title: "Create operational route", description: "Creates an Admin route through the backend route API.", method: "POST", path: () => RIDEX_API.admin.routes, fields: [{ key: "startLocationId", label: "Start Location ID", required: true }, { key: "endLocationId", label: "End Location ID", required: true }, { key: "stopIds", label: "Stop Location IDs (comma-separated)", type: "csv" }, { key: "allowedDriverIds", label: "Allowed Driver IDs (comma-separated)", type: "csv" }, { key: "zoneIds", label: "Zone IDs (comma-separated)", type: "csv" }, { key: "name", label: "Route Name", required: true }, { key: "city", label: "City", required: true }, { key: "cityId", label: "City ID" }, { key: "vehicleType", label: "Vehicle Type" }, { key: "serviceType", label: "Service Type" }, { key: "matchingMode", label: "Matching Mode" }, { key: "selectionMode", label: "Selection Mode" }, { key: "workingDays", label: "Working Days (comma-separated)", type: "csv" }, { key: "workingStart", label: "Working Start" }, { key: "workingEnd", label: "Working End" }, { key: "pickupRadiusMeters", label: "Pickup Radius (m)", type: "number" }, { key: "dropRadiusMeters", label: "Drop Radius (m)", type: "number" }, { key: "maxDetourKm", label: "Max Detour (km)", type: "number" }, { key: "maxPickupEtaMinutes", label: "Max Pickup ETA (min)", type: "number" }, { key: "gpsFreshnessSeconds", label: "GPS Freshness (s)", type: "number" }, { key: "active", label: "Active", type: "checkbox" }], submitLabel: "Create Route" },
        { id: "update", title: "Edit operational route", description: "Updates route metadata/topology through the backend. The backend blocks topology changes after bookings exist.", method: "PATCH", path: (v) => resourcePath(RIDEX_API.admin.routes, v.routeId), fields: [{ key: "routeId", label: "Route ID", required: true }, { key: "name", label: "Route Name" }, { key: "city", label: "City" }, { key: "cityId", label: "City ID" }, { key: "startLocationId", label: "Start Location ID" }, { key: "endLocationId", label: "End Location ID" }, { key: "stopIds", label: "Stop Location IDs (comma-separated)", type: "csv" }, { key: "allowedDriverIds", label: "Allowed Driver IDs (comma-separated)", type: "csv" }, { key: "zoneIds", label: "Zone IDs (comma-separated)", type: "csv" }, { key: "vehicleType", label: "Vehicle Type" }, { key: "serviceType", label: "Service Type" }, { key: "matchingMode", label: "Matching Mode" }, { key: "selectionMode", label: "Selection Mode" }, { key: "workingDays", label: "Working Days (comma-separated)", type: "csv" }, { key: "workingStart", label: "Working Start" }, { key: "workingEnd", label: "Working End" }, { key: "pickupRadiusMeters", label: "Pickup Radius (m)", type: "number" }, { key: "dropRadiusMeters", label: "Drop Radius (m)", type: "number" }, { key: "maxDetourKm", label: "Max Detour (km)", type: "number" }, { key: "maxPickupEtaMinutes", label: "Max Pickup ETA (min)", type: "number" }, { key: "gpsFreshnessSeconds", label: "GPS Freshness (s)", type: "number" }, { key: "active", label: "Active", type: "checkbox" }], submitLabel: "Save Route" }
      ];
    case "cities":
      return [{ id: "create", title: "Create city", description: "Creates a city with geographic and operating metadata.", method: "POST", path: () => RIDEX_API.admin.cities, fields: [{ key: "name", label: "Name", required: true }, { key: "city", label: "City", required: true }, { key: "code", label: "Code", required: true }, { key: "stateId", label: "State ID", required: true }, { key: "state", label: "State" }, { key: "centerLat", label: "Center Latitude", type: "number" }, { key: "centerLng", label: "Center Longitude", type: "number" }, { key: "operatingStart", label: "Operating Start" }, { key: "operatingEnd", label: "Operating End" }, { key: "active", label: "Active", type: "checkbox" }, { key: "serviceAvailable", label: "Service Available", type: "checkbox" }], submitLabel: "Create City" }];
    case "states":
      return [{ id: "create", title: "Create state", description: "Creates a state master record through the backend.", method: "POST", path: () => RIDEX_API.admin.states, fields: [{ key: "name", label: "Name", required: true }, { key: "code", label: "Code", required: true }, { key: "countryCode", label: "Country Code", required: true }, { key: "active", label: "Active", type: "checkbox" }], submitLabel: "Create State" }];
    case "monitoring":
      return [{ id: "status", title: "Failover readiness", description: "Reads live health and recovery readiness from the backend without inventing synthetic status.", method: "GET", path: () => RIDEX_API.admin.recoveryStatus, submitLabel: "Refresh Recovery Status" }];
    default:
      return [];
  }
}

function actionInitials(fields?:Field[]){ return Object.fromEntries((fields??[]).map(f=>[f.key,f.type==="select"?(f.options?.[0]?.value??""):f.type==="checkbox"?"true":""])); }

function prefillForAction(def:ActionDef, selected:Row|null):Record<string,string>{
  const out=actionInitials(def.fields);
  if(!selected) return out;
  const aliases:Record<string,string[]>={
    adminId:["adminId","id"], driverId:["driverId","id"], customerId:["customerId","id"], bookingId:["bookingId","rideId","id"], rideId:["rideId","bookingId","id"],
    cityId:["cityId","id"], locationId:["locationId","id"], stateId:["stateId","id"], zoneId:["zoneId","id"], routeId:["routeId","id"], releaseId:["releaseId","id"],
    backupId:["backupId","id"], promotionId:["promotionId","id"], pathId:["ruleId","id"], ruleId:["ruleId","id"], settlementId:["settlementId","id"], paymentId:["paymentId","id"],
    sessionId:["sessionId","id"], roleId:["roleId","id"], documentId:["documentId","id"], vehicleId:["vehicleId","id"], eventId:["eventId","id"], testerMobile:["testerMobile","mobile"], mobile:["mobile"],
    name:["name","fullName","title"], code:["code"], address:["address"], city:["cityName","city"], state:["stateName","state"], country:["country","countryCode"],
    latitude:["latitude","lat","centerLat"], longitude:["longitude","lng","centerLng"], active:["active","isActive"], isActive:["isActive","active"]
  };
  for(const field of def.fields??[]){
    const keys=aliases[field.key]??[field.key];
    for(const key of keys){ if(selected[key]!==undefined&&selected[key]!==null){
      const v=selected[key]; out[field.key]=typeof v==='boolean'?String(v):typeof v==='object'?JSON.stringify(v):String(v); break;
    }}
  }
  return out;
}

function FieldInput({field,value,onChange}:{field:Field;value:string;onChange:(v:string)=>void}){
  if(field.type==="textarea"||field.type==="json"||field.type==="csv") return <textarea rows={field.type==="json"?7:4} value={value} onChange={e=>onChange(e.target.value)} placeholder={field.placeholder} required={field.required} maxLength={field.maxLength}/>;
  if(field.type==="select") return <select value={value} onChange={e=>onChange(e.target.value)} required={field.required}>{field.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  if(field.type==="checkbox") return <input type="checkbox" checked={value==="true"} onChange={e=>onChange(e.target.checked?"true":"false")}/>;
  return <input type={field.type==="number"||field.type==="percent"?"number":"text"} value={value} onChange={e=>onChange(e.target.value)} placeholder={field.placeholder} required={field.required} maxLength={field.maxLength}/>;
}

function ActionCard({def,onDone,selected,draftNamespace="workspace"}:{def:ActionDef;onDone:()=>void;selected?:Row|null;draftNamespace?:string}){
  const selectedKey = rowIdentity(selected);
  const draftKey = `ridex-admin-action-${draftNamespace}-${def.id}-${selectedKey || "new"}`;
  const safeToPersist = !def.dangerous && !(def.fields ?? []).some((field) => /password|token|secret|otp|one.?time.?code|api.?key|private.?key|confirmation|authorization|note|message|mobile|phone|email|address|location|latitude|longitude|customer|driver|account|attachment|url|identity|document|pan|aadhaar/i.test(`${field.key} ${field.label}`));
  const [values,setValues]=useSessionDraft<Record<string,string>>(draftKey,prefillForAction(def,selected??null),safeToPersist);
  const [retryKey,setRetryKey]=useState<{fingerprint:string;key:string}|null>(null);
  // The parent keys this card by action + selected record identity. Data refreshes for
  // the same record therefore do not remount the card or erase typed values.
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [resultData,setResultData]=useState<unknown>(null);
  const contractBlocked = def.method !== "GET" &&
    (def.requiresVerifiedContract === true || !API_CONTRACTS_VERIFIED) &&
    !hasVerifiedMutationContract(def);
  const submit=async(e:FormEvent)=>{ e.preventDefault(); setBusy(true); setError(""); setMessage(""); setResultData(null);
    try{
      if (contractBlocked) throw new ApiError("This action is blocked until its route, request schema, permissions and geographic scope are verified against the backend source.", 501);
      if (def.id === "update" && !["status", "priority", "assignedAdminId"].some((key) => String(values[key] ?? "").trim())) throw new ApiError("Choose a status, priority or assigned Admin change.", 400);
      if (def.id === "documentReview" && values.status === "REJECTED" && !String(values.rejectionReason ?? "").trim()) throw new ApiError("A rejection reason is required when rejecting a driver document.", 400);
      if(def.dangerous&&def.confirmationKey){ const accepted=Array.isArray(def.confirmationKey)?def.confirmationKey:[def.confirmationKey]; if(!accepted.includes((values.confirmation??"").trim())) throw new ApiError(`Confirmation must exactly match one of: ${accepted.join(" / ")}`,400); }
      const path=def.path(values); let body:any=undefined;
      if(def.method!=="GET"){
        body={}; for(const field of def.fields??[]){ if(field.key==="pathId" || field.confirmationOnly) continue; const raw=values[field.key]??"";
          if(field.type==="number") body[field.key]=raw===""?undefined:Number(raw); else if(field.type==="percent") body[field.key]=raw===""?undefined:Number(raw)/100; else if(field.type==="checkbox") body[field.key]=raw==="true"; else if(field.type==="json") body[field.key]=raw===""?undefined:JSON.parse(raw); else if(field.type==="csv"||["permissionIds","stopIds","allowedDriverIds","zoneIds","fallbackLevels"].includes(field.key)) body[field.key]=raw.split(",").map(v=>v.trim()).filter(Boolean); else if(raw!==""||field.required||(def.id === "documentReview" && field.key === "rejectionReason" && values.status === "REJECTED")) body[field.key]=raw;
        }
      }
      const headers = new Headers();
      if (def.method !== "GET") {
        // Reuse the same idempotency key when the operator retries an identical action after an uncertain response.
        const fingerprint = `${def.method}\n${path}\n${JSON.stringify(body ?? null)}`;
        const current = retryKey?.fingerprint === fingerprint ? retryKey : null;
        const key = current?.key ?? `ridex-admin-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
        headers.set("Idempotency-Key", key);
        if (!current) setRetryKey({ fingerprint, key });
      }
      const response=await request<any>(path,{method:def.method,body:body===undefined?undefined:JSON.stringify(body),headers});
      setRetryKey(null);
      if (def.method === "GET") setResultData(response);
      setMessage(String(response?.message ?? (def.method === "GET" ? "Read completed. Returned data is shown below after privacy filtering." : "Action completed successfully."))); onDone();
    }catch(err){ setError(err instanceof ApiError?`${err.message}${err.status?` · HTTP ${err.status}`:""}`:err instanceof Error?err.message:"Action failed"); } finally{setBusy(false);}
  };
  return <Card title={def.title} eyebrow={def.dangerous?"HIGH-RISK ACTION":"BACKEND ACTION"}><p className="rx-action-desc">{def.description}</p><form className="rx-form rx-action-form" onSubmit={submit}>{(def.fields??[]).map(field=>{const rejectionRequired=def.id==="documentReview"&&field.key==="rejectionReason"&&values.status==="REJECTED";const displayField=rejectionRequired?{...field,required:true,label:"Rejection Reason (required)"}:field;return <label key={field.key}>{displayField.label}<FieldInput field={displayField} value={values[field.key]??""} onChange={v=>setValues(c=>({...c,[field.key]:v}))}/>{field.helper?<small>{field.helper}</small>:null}</label>;})}{def.dangerous&&def.confirmationKey?<Notice tone="warning">Exact confirmation required: <strong>{Array.isArray(def.confirmationKey)?def.confirmationKey.join(" / "):def.confirmationKey}</strong></Notice>:null}{contractBlocked?<Notice tone="warning">Blocked pending backend contract verification. No request will be sent for this action.</Notice>:null}{error?<Notice tone="danger">{error}</Notice>:null}{message?<Notice>{message}</Notice>:null}{resultData!==null?<details className="rx-action-result"><summary>Returned backend data (sensitive fields redacted)</summary><pre>{safeDisplayJson(resultData)}</pre></details>:null}<Button loading={busy} disabled={busy || contractBlocked}>{def.submitLabel??"Run action"}<Save size={15}/></Button></form></Card>;
}

function objectSummary(data: unknown): {label:string;value:string;hint:string}[] {
  if(!data || typeof data !== "object" || Array.isArray(data)) return [];
  const entries=Object.entries(data as Record<string, unknown>).filter(([key,value])=>{
    const k=key.toLowerCase();
    return value!==undefined && value!==null && typeof value!=="object" && !k.includes("token") && !k.includes("secret") && !k.includes("password") && !k.includes("key");
  }).slice(0,5);
  return entries.map(([key,value])=>({label:key.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase()),value:scalar(value),hint:"Backend field"}));
}
function OverviewCards({screen,list,data}:{screen:Screen;list:Row[];data:unknown}){
  const labels=summaryLabels(screen);
  if(list.length) return <div className="rx-stats-grid rx-workspace-stats">{labels.map(label=><div className="rx-stat-card" key={label}><span>{label}</span><strong>{statFor(screen,list,label)}</strong><small>{label==="Total"?"Backend records":`${label} in current result set`}</small></div>)}</div>;
  const summaries=objectSummary(data);
  if(!summaries.length) return null;
  return <div className="rx-stats-grid rx-workspace-stats">{summaries.map(item=><div className="rx-stat-card" key={item.label}><span>{item.label}</span><strong className="rx-stat-value-text">{item.value}</strong><small>{item.hint}</small></div>)}</div>;
}
function SearchSuggestions({screen, rawList, search, setSearch}:{screen:Screen;rawList:Row[];search:string;setSearch:(v:string)=>void}){
  const locationLike=["locations","quickLocations","states","cities","cityZones","routeBuilder","sharingRoutes","workingRoutes"].includes(screen);
  if(!locationLike||!search.trim()) return null;
  const q=search.trim().toLowerCase();
  const suggestions=rawList.map((row,index)=>({label:primaryLabel(row,index), detail:String(row.address??row.cityName??row.city??row.stateName??row.state??""), text:JSON.stringify(row).toLowerCase()})).filter(x=>x.text.includes(q)).slice(0,8);
  if(!suggestions.length) return null;
  return <div className="rx-search-suggestions" role="listbox">{suggestions.map((s,i)=><button key={`${s.label}-${i}`} type="button" onClick={()=>setSearch(s.label)}><strong>{s.label}</strong>{s.detail?<small>{s.detail}</small>:null}</button>)}</div>;
}

function RecordList({list,selected,onSelect,screen}:{list:Row[];selected:Row|null;onSelect:(row:Row)=>void;screen:Screen}){
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [list]);
  if(!list.length) return <EmptyState title="No matching records" description="Try another search term or refresh the backend data."/>;
  const pageCount = Math.max(1, Math.ceil(list.length / DISPLAY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = list.slice(safePage * DISPLAY_PAGE_SIZE, (safePage + 1) * DISPLAY_PAGE_SIZE);
  return <><div className="rx-record-grid">{visible.map((row,index)=><button type="button" key={String(row.id??row._id??index)} className={`rx-record-card ${selected===row?"selected":""}`} onClick={()=>onSelect(row)}><div className="rx-record-main"><strong>{primaryLabel(row,safePage * DISPLAY_PAGE_SIZE + index)}</strong><span>{secondaryLabel(row, screen)}</span></div><StatusPill value={recordStatus(row)}/><span className="rx-record-id">{String(row.id??"")}</span></button>)}</div><RecordPager total={list.length} page={safePage} onPage={setPage}/></>;
}

function DetailCard({row,screen}:{row:Row|null;screen:Screen}){
  if(!row) return <aside className="rx-detail-aside"><Card title="Select a record" eyebrow="DETAIL"><div className="rx-detail-empty"><MapPinned size={20}/><p>Select a row to open its backend-authoritative details.</p></div></Card></aside>;
  return <aside className="rx-detail-aside"><Card title={primaryLabel(row,0)} eyebrow={`${screen.toUpperCase()} DETAIL`} action={<StatusPill value={recordStatus(row)}/>}><div className="rx-selected-banner"><strong>Selected record</strong><span>Actions below use this record where a confirmed backend mutation exists.</span></div><div className="rx-detail-grid">{detailEntries(row, screen).map(([key,value])=><div key={key} className="rx-detail-item"><span>{key}</span><strong>{scalar(value)}</strong></div>)}</div></Card></aside>;
}

function AssetCatalog(){ const slots=[
  ["Customer · Login Promotional","Login / promotional area","1200 × 600 px","2:1","JPG / PNG / WebP"],
  ["Driver · Login Promotional","Login / promotional area","1200 × 600 px","2:1","JPG / PNG / WebP"],
  ["Customer · Vehicle","Vehicle selection","800 × 800 px","1:1","PNG / WebP"],
  ["Driver · Vehicle","Vehicle/reference display","800 × 800 px","1:1","PNG / WebP"],
  ["Customer + Driver · Display","Untouchable display/ad screen","1200 × 675 px","16:9","JPG / PNG / WebP"],
  ["System · Logo","Branding","512 × 512 px","1:1","PNG / WebP / SVG"],
]; return <div className="rx-asset-catalog">{slots.map(([name,use,size,ratio,fmt])=><div className="rx-asset-slot-card" key={name}><div className="rx-asset-slot-preview"><UploadCloud size={22}/><span>Default asset</span></div><div><strong>{name}</strong><small>{use}</small><div className="rx-asset-specs"><span><b>Recommended</b>{size}</span><span><b>Ratio</b>{ratio}</span><span><b>Format</b>{fmt}</span></div></div></div>)}</div>; }

function getEditActions(screen:Screen):ActionDef[]{
  switch(screen){
    case "cityZones": return [
      {id:"createZone",title:"Create City Zone",description:"Creates a geographic operating zone using the confirmed backend city-zone API.",method:"POST",path:()=>RIDEX_API.admin.cityZones,fields:[{key:"name",label:"Zone Name",required:true},{key:"city",label:"City",required:true},{key:"country",label:"Country Code",placeholder:"IN"},{key:"centerLat",label:"Center Latitude",type:"number",required:true},{key:"centerLng",label:"Center Longitude",type:"number",required:true},{key:"radiusKm",label:"Radius (km)",type:"number",required:true},{key:"active",label:"Active",type:"checkbox"},{key:"connectionPoint",label:"Connection Point",type:"checkbox"}],submitLabel:"Create Zone"},
      {id:"editZone",title:"Edit City Zone",description:"Updates an existing city-zone boundary through the confirmed backend PATCH endpoint.",method:"PATCH",path:v=>resourcePath(RIDEX_API.admin.cityZones, v.zoneId),fields:[{key:"zoneId",label:"Zone ID",required:true},{key:"name",label:"Zone Name"},{key:"city",label:"City"},{key:"country",label:"Country Code"},{key:"centerLat",label:"Center Latitude",type:"number"},{key:"centerLng",label:"Center Longitude",type:"number"},{key:"radiusKm",label:"Radius (km)",type:"number"},{key:"active",label:"Active",type:"checkbox"},{key:"connectionPoint",label:"Connection Point",type:"checkbox"}],submitLabel:"Save Zone"}
    ];
    case "states": return [{id:"editState",title:"Edit State",description:"Updates an existing State Master record through the confirmed backend PATCH endpoint.",method:"PATCH",path:v=>resourcePath(RIDEX_API.admin.states, v.stateId),fields:[{key:"stateId",label:"State ID",required:true},{key:"name",label:"Name"},{key:"code",label:"Code"},{key:"countryCode",label:"Country Code"},{key:"active",label:"Active",type:"checkbox"}],submitLabel:"Save State"}];
    case "cities": return [{id:"editCity",title:"Edit City",description:"Updates an existing City Master record through the confirmed backend PATCH endpoint.",method:"PATCH",path:v=>resourcePath(RIDEX_API.admin.cities, v.cityId),fields:[{key:"cityId",label:"City ID",required:true},{key:"name",label:"Name"},{key:"code",label:"Code"},{key:"operatingStart",label:"Operating Start"},{key:"operatingEnd",label:"Operating End"},{key:"timezone",label:"Timezone"},{key:"centerLat",label:"Center Latitude",type:"number"},{key:"centerLng",label:"Center Longitude",type:"number"},{key:"active",label:"Active",type:"checkbox"},{key:"serviceAvailable",label:"Service Available",type:"checkbox"}],submitLabel:"Save City"}];
    case "locations": return [{id:"editLocation",title:"Edit Location",description:"Updates an operational Location Master record, including optional private image upload via the existing backend contract.",method:"PATCH",path:v=>resourcePath(RIDEX_API.admin.locations, v.locationId),fields:[{key:"locationId",label:"Location ID",required:true},{key:"name",label:"Name"},{key:"city",label:"City"},{key:"cityId",label:"City ID"},{key:"pincode",label:"Pincode"},{key:"category",label:"Category"},{key:"type",label:"Type"},{key:"address",label:"Address"},{key:"latitude",label:"Latitude",type:"number"},{key:"longitude",label:"Longitude",type:"number"},{key:"pickupAllowed",label:"Pickup Allowed",type:"checkbox"},{key:"dropAllowed",label:"Drop Allowed",type:"checkbox"},{key:"pickupRadiusMeters",label:"Pickup Radius (m)",type:"number"},{key:"dropRadiusMeters",label:"Drop Radius (m)",type:"number"},{key:"active",label:"Active",type:"checkbox"}],submitLabel:"Save Location"}];
    case "pricing": return [{id:"editPricing",title:"Edit Pricing Rule",description:"Updates an existing pricing rule through the backend operations API. Include only fields to change; the mutation remains blocked until request, authorization and geographic scope are verified.",method:"PATCH",path:v=>resourcePath(RIDEX_API.admin.pricingRules, v.pathId),requiresVerifiedContract:true,fields:[{key:"pathId",label:"Rule ID",required:true,helper:"The selected rule ID is used in the URL and is not sent as an editable field."},{key:"name",label:"Name",maxLength:120},{key:"serviceType",label:"Service Type"},{key:"bookingType",label:"Booking Type"},{key:"rideType",label:"Ride Type"},{key:"vehicleType",label:"Vehicle Type"},{key:"zoneId",label:"Zone ID"},{key:"dayOfWeek",label:"Day of Week"},{key:"startTime",label:"Start Time",placeholder:"HH:mm"},{key:"endTime",label:"End Time",placeholder:"HH:mm"},{key:"demandMin",label:"Demand Minimum",type:"number"},{key:"demandMax",label:"Demand Maximum",type:"number"},{key:"priority",label:"Priority",type:"number"},{key:"minFare",label:"Minimum Fare",type:"number"},{key:"maxFare",label:"Maximum Fare",type:"number"},{key:"baseFare",label:"Base Fare",type:"number"},{key:"perKm",label:"Per Km",type:"number"},{key:"perMinute",label:"Per Minute",type:"number"},{key:"waitingPerMinute",label:"Waiting / Minute",type:"number"},{key:"weightPerKg",label:"Weight / Kg",type:"number"},{key:"multiplier",label:"Multiplier",type:"number"},{key:"active",label:"Active",type:"checkbox"},{key:"metadata",label:"Metadata JSON",type:"json"},{key:"changeReason",label:"Change Reason",type:"textarea",required:true,maxLength:500,helper:"Explain why this pricing rule is being changed; this value is sent for the backend audit."}],submitLabel:"Save Pricing Rule"}];
    case "promotions": return [{id:"editPromotion",title:"Edit Promotion",description:"Updates an existing promotion using the backend edit endpoint. Use the active switch for lifecycle control.",method:"PATCH",path:v=>resourcePath(RIDEX_API.admin.promotions, v.promotionId),fields:[{key:"promotionId",label:"Promotion ID",required:true},{key:"description",label:"Description"},{key:"isActive",label:"Active",type:"checkbox"}],submitLabel:"Save Promotion"}];
    default: return [];
  }
}

function extraForScreen(screen:Screen,onDone:()=>void,selected:Row|null){
  if(screen==="sessions") return <div className="rx-action-grid"><ActionCard def={{id:"revoke",title:"Revoke one Admin session",description:"Uses the backend revoke-session endpoint. Exact confirmation is required.",method:"DELETE",path:v=>resourcePath(RIDEX_API.admin.adminPresence, "sessions", v.sessionId),fields:[{key:"sessionId",label:"Session ID",required:true},{key:"confirmation",label:"Confirmation",required:true,placeholder:"REVOKE SESSION"}],dangerous:true,confirmationKey:"REVOKE SESSION",requiresVerifiedContract:true}} onDone={onDone} selected={selected}/><ActionCard def={{id:"revokeAll",title:"Revoke all sessions for Admin",description:"Super Admin only. Backend revokes all sessions for the selected Admin.",method:"POST",path:v=>resourcePath(RIDEX_API.admin.adminPresence, "admins", v.adminId, "revoke-all"),fields:[{key:"adminId",label:"Admin ID",required:true},{key:"confirmation",label:"Confirmation",required:true,placeholder:"REVOKE ALL SESSIONS"}],dangerous:true,confirmationKey:"REVOKE ALL SESSIONS",requiresVerifiedContract:true}} onDone={onDone} selected={selected}/></div>;
  if(screen==="assets") return <><Card title="Asset Catalog" eyebrow="SYSTEM CONFIGURATION"><AssetManager/></Card></>;
  return null;
}


function coreOpsMeta(screen: Screen, row: Row, index: number) {
  const status = String(row.status ?? row.approvalStatus ?? row.verificationStatus ?? row.rideStatus ?? row.driverStatus ?? row.state ?? "AVAILABLE");
  if (["live", "rides"].includes(screen)) {
    return {
      title: primaryLabel(row, index),
      line1: [row.serviceSubtype ?? row.rideType ?? row.serviceType, row.customerName ?? row.customer?.fullName, row.driverName ?? row.driver?.fullName].map(scalar).filter(v => v !== "—").slice(0, 3).join(" • "),
      line2: [row.pickupAddress ?? row.pickup ?? row.origin, row.dropAddress ?? row.destination ?? row.dropoff].map(scalar).filter(v => v !== "—").slice(0, 2).join(" → "),
      status,
      tag: row.etaMinutes !== undefined ? `ETA ${scalar(row.etaMinutes)} min` : row.distanceKm !== undefined ? `${scalar(row.distanceKm)} km` : "Operational ride",
    };
  }
  if (["drivers", "driversOps"].includes(screen)) {
    const vehicleCount = Array.isArray(row.vehicles) ? row.vehicles.length : row.vehicleCount ?? row.vehicle?.length ?? undefined;
    const driverMobile = row.mobile ?? row.user?.mobile;
    const city = row.cityName ?? row.city?.name ?? row.city;
    const state = row.stateName ?? row.state?.name ?? row.state;
    const driverName = row.fullName ?? row.name ?? row.driverName ?? row.user?.fullName;
    return {
      title: String(driverName ?? (driverMobile ? maskPhone(driverMobile) : undefined) ?? primaryLabel(row, index)),
      line1: [driverMobile ? maskPhone(driverMobile) : undefined, city, state].map(scalar).filter(v => v !== "—").slice(0, 3).join(" • "),
      line2: [row.serviceMode ?? row.mode, row.driverStatus ?? row.status, vehicleCount !== undefined ? `${scalar(vehicleCount)} vehicle${Number(vehicleCount) === 1 ? "" : "s"}` : undefined].map(scalar).filter(v => v !== "—").slice(0, 3).join(" • "),
      status: row.driverStatus ?? status,
      tag: row.online || row.isOnline ? "ONLINE" : row.available || row.isAvailable ? "AVAILABLE" : "Driver",
    };
  }
  if (screen === "kyc") {
    const docs = Array.isArray(row.documents) ? row.documents.length : row.documentCount;
    const driverMobile = row.mobile ?? row.user?.mobile;
    const city = row.cityName ?? row.city?.name ?? row.city;
    const state = row.stateName ?? row.state?.name ?? row.state;
    return {
      title: row.driverName ?? row.fullName ?? row.user?.fullName ?? (driverMobile ? maskPhone(driverMobile) : undefined) ?? primaryLabel(row, index),
      line1: [driverMobile ? maskPhone(driverMobile) : undefined, city, state].map(scalar).filter(v => v !== "—").slice(0, 3).join(" • "),
      line2: [row.kycStatus ?? row.verificationStatus ?? row.status, docs !== undefined ? `${scalar(docs)} document${Number(docs) === 1 ? "" : "s"}` : undefined].map(scalar).filter(v => v !== "—").join(" • "),
      status: row.kycStatus ?? row.verificationStatus ?? status,
      tag: row.updatedAt ? `Updated ${new Date(String(row.updatedAt)).toLocaleDateString()}` : "Verification queue",
    };
  }
  const customerMobile = row.mobile ?? row.user?.mobile;
  const customerEmail = row.email ?? row.user?.email;
  const customerTitle = screen === "customers"
    ? String(row.fullName ?? row.name ?? row.customerName ?? (customerMobile ? maskPhone(customerMobile) : undefined) ?? `Customer ${index + 1}`)
    : primaryLabel(row, index);
  return {
    title: customerTitle,
    line1: [customerMobile ? maskPhone(customerMobile) : undefined, customerEmail ? maskEmail(customerEmail) : undefined].map(scalar).filter(v => v !== "—").slice(0, 2).join(" • "),
    line2: [row.cityName ?? row.city?.name ?? row.cityId, row.stateName ?? row.state?.name ?? row.stateId].map(scalar).filter(v => v !== "—").slice(0, 2).join(" • "),
    status,
    tag: row.createdAt ? `Joined ${new Date(String(row.createdAt)).toLocaleDateString()}` : "Customer",
  };
}

function CoreOpsBoard({ screen, cfg, data, loading, error, lastLoadedAt, search, setSearch, statusFilter, setStatusFilter, sortMode, setSortMode, list, rawList, selected, setSelected, onRetry, actions, draftNamespace }: {
  screen: Screen; cfg: WorkspaceConfig; data: unknown; loading: boolean; error: string; lastLoadedAt: string; search: string; setSearch: (v: string) => void; statusFilter: string; setStatusFilter: (v: string) => void; sortMode: SortMode; setSortMode: (mode: SortMode) => void; list: Row[]; rawList: Row[]; selected: Row | null; setSelected: (r: Row | null) => void; onRetry: () => void; actions: ActionDef[]; draftNamespace: string;
}) {
  const { t } = useLanguage();
  const [page, setPage] = useState(0);
  const [bookingDetail, setBookingDetail] = useState<Row | null>(null);
  const [bookingDetailKey, setBookingDetailKey] = useState("");
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false);
  const [bookingDetailError, setBookingDetailError] = useState("");
  const [driverDetail, setDriverDetail] = useState<Row | null>(null);
  const [driverDetailKey, setDriverDetailKey] = useState("");
  const [driverDetailLoading, setDriverDetailLoading] = useState(false);
  const [driverDetailError, setDriverDetailError] = useState("");
  const [customerDetail, setCustomerDetail] = useState<Row | null>(null);
  const [customerDetailKey, setCustomerDetailKey] = useState("");
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const [customerDetailError, setCustomerDetailError] = useState("");
  useEffect(() => setPage(0), [screen, search, statusFilter, sortMode, list.length]);
  const selectedBookingId = String(selected?.id ?? selected?.bookingId ?? selected?.rideId ?? "").trim();
  useEffect(() => {
    if (screen !== "rides" || !selectedBookingId) {
      setBookingDetail(null);
      setBookingDetailKey("");
      setBookingDetailError("");
      setBookingDetailLoading(false);
      return;
    }
    let active = true;
    setBookingDetail(null);
    setBookingDetailKey("");
    setBookingDetailError("");
    setBookingDetailLoading(true);
    request<Row>(resourcePath(RIDEX_API.admin.bookings, selectedBookingId))
      .then((record) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) throw new ApiError("The booking detail endpoint returned an invalid record.", 502);
        if (active) { setBookingDetail(record); setBookingDetailKey(selectedBookingId); }
      })
      .catch((cause) => {
        if (!active) return;
        setBookingDetailError(cause instanceof ApiError ? `${cause.message}${cause.status ? ` · HTTP ${cause.status}` : ""}` : cause instanceof Error ? cause.message : "Unable to load booking details.");
      })
      .finally(() => { if (active) setBookingDetailLoading(false); });
    return () => { active = false; };
  }, [screen, selectedBookingId]);
  const selectedDriverId = String(selected?.id ?? selected?.driverId ?? "").trim();
  const isDriverDetailScreen = ["drivers", "driversOps", "vehicles", "kyc", "workingRoutes"].includes(screen);
  useEffect(() => {
    if (!isDriverDetailScreen || !selectedDriverId) {
      setDriverDetail(null);
      setDriverDetailKey("");
      setDriverDetailError("");
      setDriverDetailLoading(false);
      return;
    }
    let active = true;
    setDriverDetail(null);
    setDriverDetailKey("");
    setDriverDetailError("");
    setDriverDetailLoading(true);
    request<Row>(resourcePath(RIDEX_API.admin.drivers, selectedDriverId))
      .then((record) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) throw new ApiError("The driver detail endpoint returned an invalid record.", 502);
        if (active) { setDriverDetail(record); setDriverDetailKey(selectedDriverId); }
      })
      .catch((cause) => {
        if (!active) return;
        setDriverDetailError(cause instanceof ApiError ? `${cause.message}${cause.status ? ` · HTTP ${cause.status}` : ""}` : cause instanceof Error ? cause.message : "Unable to load driver details.");
      })
      .finally(() => { if (active) setDriverDetailLoading(false); });
    return () => { active = false; };
  }, [isDriverDetailScreen, selectedDriverId]);
  const selectedCustomerId = String(selected?.id ?? selected?.customerId ?? "").trim();
  useEffect(() => {
    if (screen !== "customers" || !selectedCustomerId) {
      setCustomerDetail(null);
      setCustomerDetailKey("");
      setCustomerDetailError("");
      setCustomerDetailLoading(false);
      return;
    }
    let active = true;
    setCustomerDetail(null);
    setCustomerDetailKey("");
    setCustomerDetailError("");
    setCustomerDetailLoading(true);
    request<Row>(resourcePath(RIDEX_API.admin.customers, selectedCustomerId))
      .then((record) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) throw new ApiError("The customer detail endpoint returned an invalid record.", 502);
        if (active) { setCustomerDetail(record); setCustomerDetailKey(selectedCustomerId); }
      })
      .catch((cause) => {
        if (!active) return;
        setCustomerDetailError(cause instanceof ApiError ? `${cause.message}${cause.status ? ` · HTTP ${cause.status}` : ""}` : cause instanceof Error ? cause.message : "Unable to load customer details.");
      })
      .finally(() => { if (active) setCustomerDetailLoading(false); });
    return () => { active = false; };
  }, [screen, selectedCustomerId]);
  const detailRow = screen === "rides"
    ? (bookingDetailKey === selectedBookingId ? bookingDetail : null) ?? selected
    : isDriverDetailScreen
      ? (driverDetailKey === selectedDriverId ? driverDetail : null) ?? selected
      : screen === "customers"
        ? (customerDetailKey === selectedCustomerId ? customerDetail : null) ?? selected
        : selected;
  const pageCount = Math.max(1, Math.ceil(list.length / DISPLAY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const metaList = list.slice(safePage * DISPLAY_PAGE_SIZE, (safePage + 1) * DISPLAY_PAGE_SIZE);
  const hasMap = ["live", "rides", "drivers", "driversOps"].includes(screen);
  const statusOptions = Array.from(new Set(rawList.map(r => String(r.status ?? r.approvalStatus ?? r.verificationStatus ?? r.rideStatus ?? r.driverStatus ?? r.state ?? "").toUpperCase()).filter(Boolean))).slice(0, 10);
  const selectedMeta = detailRow ? coreOpsMeta(screen, detailRow, 0) : null;
  return <div className={`rx-page rx-core-ops-page rx-core-ops-${screen}`}>
    <div className="rx-page-head">
      <div><div className="rx-eyebrow">{cfg.eyebrow}</div><h1>{t(`nav.${screen}`, cfg.title)}</h1><p>{t(`workspace.${screen}.description`, cfg.desc)}</p></div>
      <div className="rx-core-ops-head-actions"><span className="rx-live-chip">{screen === "kyc" ? "REVIEW QUEUE" : "OPERATIONS"}</span><Button variant="secondary" loading={loading} onClick={onRetry} disabled={loading}><RefreshCw size={15}/>{t("common.refresh", "Refresh")}</Button></div>
    </div>
    <Notice>{screen === "kyc" ? "Verification decisions remain backend-authoritative and auditable." : screen === "live" ? `Live Operations includes active booking statuses only: ${LIVE_OPERATIONAL_STATUSES.join(", ")}. The backend returns at most 200 bookings per status; use this as a recent operational result set, not a complete history count.` : screen === "rides" ? "The backend booking list returns at most 200 recent records. Search and filters apply only to this loaded set; full history/pagination has not been verified." : screen === "customers" ? "The backend customer list returns up to 200 records. Search and filters apply only to this loaded set; customer details may include related bookings and support history." : "Operational scope is enforced by the backend; this workspace never expands the returned dataset."}</Notice>
    {screen === "customers" ? <Notice tone="info">Customer mobile/email are masked in summaries. Nested contact, address and location fields are redacted in related detail payloads. Geographic-scope enforcement is required on the backend for State/City Admin access.</Notice> : null}
    {isDriverDetailScreen ? <Notice tone="info">Driver contact fields are masked in the summary/detail display. The reviewed driver-list route has no explicit pagination contract, so search and status filters apply only to the response already loaded. Geographic scope for STATE/CITY Admins must be enforced by the backend before these records are enabled for them.</Notice> : null}
    {error ? <div className="rx-inline-error"><Notice tone="danger">{error}</Notice><Button variant="secondary" onClick={onRetry}>Retry</Button></div> : null}
    {error && data !== null ? <Notice tone="warning">Showing the last successful response from {lastLoadedAt || "an earlier fetch"}; these records may be stale.</Notice> : null}
    <div className="rx-core-ops-stats">
      <div><span>{t("common.records", "Records")}</span><strong>{loading ? "…" : rawList.length}</strong><small>{t("common.backendResultSet", "Backend result set")}</small></div>
      <div><span>{t("common.visible", "Visible")}</span><strong>{loading ? "…" : list.length}</strong><small>{t("common.currentFilters", "After current filters")}</small></div>
      <div><span>{t("common.selected", "Selected")}</span><strong>{selected ? "1" : "0"}</strong><small>{t("common.detailContext", "Detail context")}</small></div>
      <div><span>{t("common.lastFetch", "Last fetch")}</span><strong className="rx-core-time">{lastLoadedAt || "—"}</strong><small>{error ? t("common.needsAttention", "Needs attention") : t("common.backendResponse", "Backend response")}</small></div>
    </div>
    {hasMap ? <div className="rx-core-ops-map"><GeoMap data={data} title={`${cfg.title} operational map`} height={390}/></div> : null}
    <div className={`rx-core-ops-layout ${hasMap ? "has-map" : "no-map"}`}>
      <Card title={`${cfg.title} queue`} eyebrow={lastLoadedAt ? `LAST FETCH ${lastLoadedAt}` : "BACKEND DATA"}>
        <div className="rx-toolbar">
          <div className="rx-search-wrap"><label className="rx-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={searchPlaceholder(screen)}/></label><SearchSuggestions screen={screen} rawList={rawList} search={search} setSearch={setSearch}/></div>
          <div className="rx-filter-row"><SortSelector value={sortMode} onChange={setSortMode}/>{statusOptions.length ? <select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="ALL">{t("common.allStatuses", "All statuses")}</option>{statusOptions.map(v => <option key={v} value={v}>{v}</option>)}</select> : null}<span className="rx-count">{loading ? t("common.loading", "Loading…") : t("common.filteredCount", "{count} filtered").replace("{count}", String(list.length))}</span></div>
        </div>
        {loading ? <PixelLoader variant="center" label={`Loading ${cfg.title}…`}/> : data === null && error ? <EmptyState title={`${cfg.title} unavailable`} description="The initial backend request failed. Retry to load records; an error is not treated as an empty dataset."/> : metaList.length ? <><div className="rx-core-ops-list">{metaList.map((row, index) => { const globalIndex = safePage * DISPLAY_PAGE_SIZE + index; const meta = coreOpsMeta(screen, row, globalIndex); return <button key={String(row.id ?? row._id ?? globalIndex)} className={`rx-core-op-row ${selected === row ? "selected" : ""}`} type="button" onClick={() => setSelected(row)}><div className="rx-core-op-index">{String(globalIndex + 1).padStart(2, "0")}</div><div className="rx-core-op-main"><strong>{meta.title}</strong><span>{meta.line1 || "Backend record"}</span><small>{meta.line2 || "No secondary operational context returned"}</small></div><div className="rx-core-op-side"><StatusPill value={String(meta.status)}/><small>{meta.tag}</small></div></button>; })}</div><RecordPager total={list.length} page={safePage} onPage={setPage}/></> : <EmptyState title={`No ${cfg.title.toLowerCase()} records`} description="No backend records match the current search or status filter."/>}
      </Card>
      <Card title={selected ? "Operational details" : "Select an item"} eyebrow="DETAIL">
        {screen === "rides" && bookingDetailLoading ? <Notice>Loading full booking details from the backend…</Notice> : null}
        {screen === "rides" && bookingDetailError ? <Notice tone="warning">The separate detail request failed. Available fields below come from the selected booking-list record; details not returned by that list may be missing. {bookingDetailError}</Notice> : null}
        {isDriverDetailScreen && driverDetailLoading ? <Notice>Loading full driver details from the backend…</Notice> : null}
        {isDriverDetailScreen && driverDetailError ? <Notice tone="warning">The separate driver detail request failed. Available fields below come from the selected driver-list record; details not returned by that list may be missing. {driverDetailError}</Notice> : null}
        {screen === "customers" && customerDetailLoading ? <Notice>Loading full customer details from the backend…</Notice> : null}
        {screen === "customers" && customerDetailError ? <Notice tone="warning">The separate customer detail request failed. Available fields below come from the selected customer-list record; related history may be missing. {customerDetailError}</Notice> : null}
        {screen === "customers" && selected && (selected.isRestricted === true || selected.accountRestricted === true || selected.restricted === true || /^(RESTRICTED|SUSPENDED|BLOCKED)$/i.test(String(selected.accountStatus ?? selected.status ?? ""))) ? <Notice tone="warning">{t("common.customerRestrictedNote", "This account is marked as restricted by the backend. No account state has been changed here.")}</Notice> : null}
        {selected && selectedMeta ? <div className="rx-core-detail"><div className="rx-core-detail-head"><div><strong>{selectedMeta.title}</strong><span>{selectedMeta.line1 || "Backend record"}</span></div><StatusPill value={String(selectedMeta.status)}/></div><div className="rx-core-detail-strip"><span>{selectedMeta.tag}</span><span>{screen === "kyc" ? "Review actions are available below when supported." : "Backend state is authoritative."}</span></div><div className="rx-detail-grid">{detailEntries(detailRow ?? selected, screen).map(([key, value]) => <div key={key} className="rx-detail-item"><span>{key}</span><strong>{scalar(value)}</strong></div>)}</div>{screen === "kyc" && detailRow ? <DriverDocumentsPanel key={String(detailRow.id ?? detailRow.driverId ?? "selected-driver")} driverId={String(detailRow.id ?? detailRow.driverId ?? "")} documents={Array.isArray(detailRow.documents) ? detailRow.documents as Row[] : []}/> : null}{screen === "customers" ? <CustomerRelatedContext row={detailRow ?? selected} /> : null}</div> : <div className="rx-detail-empty"><MapPinned size={20}/><p>Select an item to inspect the backend-authoritative operational snapshot.</p></div>}
      </Card>
    </div>
    {actions.length ? <div className="rx-action-grid">{actions.map(def => <ActionCard key={`${def.id}-${rowIdentity(selected)}`} def={def} selected={selected} onDone={onRetry} draftNamespace={draftNamespace}/>)}</div> : null}
    <details className="rx-guide"><summary>How this workspace works</summary><div className="rx-guide-grid"><div><strong>1 · Filter</strong><span>Search the returned backend records and narrow by a known status.</span></div><div><strong>2 · Inspect</strong><span>Select one record to review its operational identifiers and state.</span></div><div><strong>3 · Act</strong><span>Use only the backend-confirmed actions shown below the workspace.</span></div></div></details>
  </div>;
}

function DriverDocumentsPanel({ driverId, documents }: { driverId: string; documents: Row[] }) {
  const [busyDocumentId, setBusyDocumentId] = useState("");
  const [error, setError] = useState("");
  const [signedLink, setSignedLink] = useState<{ documentId: string; url: string; expiresIn: number } | null>(null);
  const safeDocuments = documents.filter((document) => document && typeof document === "object" && String(document.id ?? "").trim());
  const generateLink = async (document: Row) => {
    const documentId = String(document.id ?? "").trim();
    if (!driverId || !documentId || document.hasFile !== true) {
      setError("A stored document file is not available for this record.");
      setSignedLink(null);
      return;
    }
    setBusyDocumentId(documentId);
    setError("");
    setSignedLink(null);
    try {
      const response = await request<{ url?: string; expiresIn?: number; documentId?: string }>(resourcePath(RIDEX_API.admin.drivers, driverId, "documents", documentId, "url"));
      if (String(response.documentId ?? "") !== documentId || typeof response.url !== "string" || !response.url.trim()) {
        throw new ApiError("The document-link endpoint returned an invalid response.", 502);
      }
      const parsed = new URL(response.url);
      const secureProtocol = parsed.protocol === "https:";
      const loopbackHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname);
      const expiresIn = Number(response.expiresIn);
      if ((!secureProtocol && !loopbackHttp) || parsed.username || parsed.password || !Number.isFinite(expiresIn) || expiresIn < 1 || expiresIn > 600) {
        throw new ApiError("The document-link response did not meet the secure URL / expiry policy.", 502);
      }
      setSignedLink({ documentId, url: parsed.href, expiresIn });
    } catch (cause) {
      setError(cause instanceof ApiError ? `${cause.message}${cause.status ? ` · HTTP ${cause.status}` : ""}` : cause instanceof Error ? cause.message : "Unable to generate a secure document link.");
    } finally {
      setBusyDocumentId("");
    }
  };
  return <Card title="KYC documents" eyebrow="PRIVATE DOCUMENTS">
    <Notice>Document access uses the backend’s audited, short-lived signed URL. Raw storage paths are never displayed; the link is kept in memory only.</Notice>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {!safeDocuments.length ? <EmptyState title="No document metadata returned" description="The driver detail response did not include document records. Refresh or confirm onboarding documents in the backend."/> : <div className="rx-kyc-document-list">{safeDocuments.slice(0, 20).map((document) => {
      const documentId = String(document.id);
      const linkIsCurrent = signedLink?.documentId === documentId;
      return <div className="rx-kyc-document-row" key={documentId}>
        <div className="rx-kyc-document-meta"><strong>{String(document.documentType ?? document.type ?? "Driver document")}</strong><span>{[document.status, document.documentVersion ? `Version ${document.documentVersion}` : undefined, document.createdAt ? new Date(String(document.createdAt)).toLocaleDateString() : undefined].filter(Boolean).join(" · ") || "Backend document record"}</span>{document.rejectionReason ? <small>Rejection reason: {String(document.rejectionReason).slice(0, 500)}</small> : null}</div>
        {linkIsCurrent ? <a className="rx-kyc-open-link" href={signedLink.url} target="_blank" rel="noopener noreferrer">Open document (link expires in {signedLink.expiresIn}s) <ExternalLink size={14}/></a> : <Button type="button" variant="secondary" disabled={busyDocumentId !== "" || document.hasFile !== true} loading={busyDocumentId === documentId} onClick={() => void generateLink(document)}>{document.hasFile === true ? "Generate secure link" : "File unavailable"}</Button>}
      </div>;
    })}</div>}
  </Card>;
}

function CustomerRelatedContext({ row }: { row: Row }) {
  const recentRides = Array.isArray(row.recentRides) ? row.recentRides.slice(0, 5) : Array.isArray(row.rides) ? row.rides.slice(0, 5) : Array.isArray(row.bookings) ? row.bookings.slice(0, 5) : [];
  const supportCases = Array.isArray(row.supportCases) ? row.supportCases.slice(0, 5) : Array.isArray(row.cases) ? row.cases.slice(0, 5) : [];
  const renderItem = (item: unknown, index: number, kind: "ride" | "case") => {
    const value = item && typeof item === "object" ? item as Row : {};
    const identifier = kind === "ride" ? value.bookingId ?? value.rideId ?? value.id : value.caseId ?? value.id;
    const state = value.status ?? value.rideStatus ?? value.caseStatus ?? value.result;
    const when = value.createdAt ?? value.timestamp ?? value.updatedAt;
    return <li key={String(identifier ?? `${kind}-${index}`)}><strong>{kind === "ride" ? "Ride" : "Case"} {scalar(identifier)}</strong><span>{[state, when].map(scalar).filter(v => v !== "—").join(" · ") || "Backend record"}</span></li>;
  };
  return <section className="rx-customer-related" aria-label="Customer related records">
    <h3>Recent backend-linked activity</h3>
    <div className="rx-customer-related-grid">
      <div><h4>Recent rides</h4>{recentRides.length ? <ul>{recentRides.map((item, index) => renderItem(item, index, "ride"))}</ul> : <p>No recent rides were included in this customer response. This panel does not call an unverified endpoint.</p>}</div>
      <div><h4>Support cases</h4>{supportCases.length ? <ul>{supportCases.map((item, index) => renderItem(item, index, "case"))}</ul> : <p>No support cases were included in this customer response. This panel does not call an unverified endpoint.</p>}</div>
    </div>
  </section>;
}

export function businessControlMeta(screen: Screen, row: Row, index: number) {
  const status = String(row.status ?? row.state ?? row.paymentStatus ?? row.payoutStatus ?? row.settlementStatus ?? row.caseStatus ?? row.notificationStatus ?? row.lifecycleStatus ?? row.resultStatus ?? "AVAILABLE");
  if (screen === "payments") {
    return { title: primaryLabel(row,index), line1: [row.amount, row.currency, row.method ?? row.paymentMethod, row.provider].map(scalar).filter(v=>v!=="—").slice(0,4).join(" • "), line2: [row.bookingId ?? row.rideId, row.customerName ?? row.customer?.fullName, row.driverName ?? row.driver?.fullName].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), status, tag: row.transactionId ? `TX ${scalar(row.transactionId)}` : "Payment record" };
  }
  if (screen === "finance") {
    return { title: primaryLabel(row,index), line1: [row.driverName ?? row.driver?.fullName, row.amount, row.currency].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), line2: [row.payoutId ?? row.settlementId, row.period ?? row.settlementPeriod, row.provider ?? row.payoutProvider].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), status, tag: row.netAmount !== undefined ? `Net ${scalar(row.netAmount)}` : "Settlement record" };
  }
  if (screen === "pricing") {
    return { title: primaryLabel(row,index), line1: [row.serviceType, row.bookingType, row.rideType].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), line2: [row.vehicleType, row.zoneId ?? row.zone, row.priority].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), status, tag: row.multiplier !== undefined ? `×${scalar(row.multiplier)}` : "Pricing rule" };
  }
  if (screen === "commission") {
    return { title: primaryLabel(row,index), line1: [row.category, row.tier, row.rate ?? row.percentage].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), line2: [row.effectiveFrom, row.effectiveTo, row.active ?? row.isActive].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), status, tag: "Commission configuration" };
  }
  if (screen === "promotions") {
    return { title: primaryLabel(row,index), line1: [row.code ?? row.promoCode, row.discountType, row.discountValue].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), line2: [row.startsAt ?? row.startDate, row.endsAt ?? row.endDate, row.usageLimit].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), status: row.isActive === false ? "INACTIVE" : status, tag: row.code ? `Code ${scalar(row.code)}` : "Promotion" };
  }
  if (screen === "safety") {
    return { title: primaryLabel(row,index), line1: [row.driverName ?? row.driver?.fullName, row.customerName ?? row.customer?.fullName, row.location].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), line2: [row.rideId ?? row.bookingId, row.type ?? row.alertType, row.priority ?? row.severity].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), status, tag: row.priority ?? row.severity ? `Priority ${scalar(row.priority ?? row.severity)}` : "Safety case" };
  }
  if (screen === "support") {
    return { title: primaryLabel(row,index), line1: [row.customerName ?? row.customer?.fullName, row.driverName ?? row.driver?.fullName, row.category].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), line2: [row.caseId ?? row.id, row.assignee ?? row.assignedTo, row.createdAt].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), status, tag: row.priority ? `Priority ${scalar(row.priority)}` : "Support case" };
  }
  if (screen === "notifications") {
    return { title: primaryLabel(row,index), line1: [row.channel, row.audience ?? row.userType, row.template ?? row.templateCode].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), line2: [row.requestId ?? row.idempotencyKey, row.sentAt ?? row.createdAt, row.attempts].map(scalar).filter(v=>v!=="—").slice(0,3).join(" • "), status, tag: row.channel ? String(row.channel) : "Notification" };
  }
  return { title: primaryLabel(row,index), line1: secondaryLabel(row), line2: [row.createdAt,row.updatedAt].map(scalar).filter(v=>v!=="—").slice(0,2).join(" • "), status, tag: "Record" };
}

function SupportCaseTimeline({ row }: { row: Row }) {
  const { t } = useLanguage();
  const rawTimeline = row.timeline ?? row.events ?? row.history ?? row.activity ?? row.comments;
  const timeline = Array.isArray(rawTimeline) ? rawTimeline.slice(0, 50) : [];
  return <section className="rx-support-timeline" aria-label={t("support.timelineTitle", "Support case timeline")}>
    <h3>{t("support.timelineTitle", "Case timeline")}</h3>
    {timeline.length ? <ol>{timeline.map((item: unknown, index: number) => {
      const event = item && typeof item === "object" ? item as Row : { message: String(item ?? "") };
      const safe = redactForDisplay(event, 0, true) as Row;
      const label = String(safe.title ?? safe.action ?? safe.event ?? safe.status ?? "Update");
      const message = String(safe.message ?? safe.note ?? safe.description ?? "");
      const when = String(safe.createdAt ?? safe.timestamp ?? safe.at ?? safe.date ?? "");
      const actor = String(safe.actorName ?? safe.changedByName ?? safe.authorName ?? "");
      return <li key={String(event.id ?? event.eventId ?? `${when}-${index}`)}><div><strong>{label}</strong>{when ? <time>{when}</time> : null}</div>{actor ? <small>{actor}</small> : null}{message ? <p>{message}</p> : null}</li>;
    })}</ol> : <p className="rx-muted">{t("support.noTimeline", "No case timeline was returned by the backend. Timeline/mutation availability must be confirmed with the support API contract.")}</p>}
  </section>;
}

function SupportCaseDetailPanel({ caseId }: { caseId: string }) {
  const { t } = useLanguage();
  const [detail, setDetail] = useState<Row | null>(null);
  const [notes, setNotes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notesError, setNotesError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError(""); setNotesError("");
    const [caseResult, notesResult] = await Promise.allSettled([
      request<Row>(resourcePath(RIDEX_API.support.adminCases, caseId)),
      request<Row[]>(resourcePath(RIDEX_API.support.adminCases, caseId, "internal-notes")),
    ]);
    if (caseResult.status === "fulfilled" && caseResult.value && typeof caseResult.value === "object" && !Array.isArray(caseResult.value)) setDetail(caseResult.value);
    else { setDetail(null); setError(caseResult.status === "rejected" ? (caseResult.reason instanceof Error ? caseResult.reason.message : "Case detail could not be loaded.") : "Case detail response was invalid."); }
    if (notesResult.status === "fulfilled" && Array.isArray(notesResult.value)) setNotes(notesResult.value.filter((row) => row && typeof row === "object" && !Array.isArray(row)) as Row[]);
    else { setNotes([]); setNotesError(notesResult.status === "rejected" ? (notesResult.reason instanceof Error ? notesResult.reason.message : "Internal notes could not be loaded.") : "Internal notes response was invalid."); }
    setLoading(false);
  }, [caseId]);
  useEffect(() => { void load(); }, [load]);
  const safeText = (value: unknown) => {
    const safe = redactForDisplay(value, 0, true);
    return typeof safe === "string" || typeof safe === "number" ? String(safe).slice(0, 2000) : "Not returned";
  };
  const messages = detail && Array.isArray(detail.messages) ? (detail.messages as Row[]).slice(-100) : [];
  return <section className="rx-support-detail-feed" aria-label="Support case conversation and internal notes">
    <div className="rx-support-detail-toolbar"><h3>{t("support.detailTitle", "Case conversation & notes")}</h3><Button type="button" variant="secondary" loading={loading} disabled={loading} onClick={() => void load()}><RefreshCw size={14}/>{t("common.refresh", "Refresh")}</Button></div>
    {loading && !detail ? <PixelLoader variant="center" label={t("support.detailLoading", "Loading case details and internal notes…")}/> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {detail ? <>
      <div className="rx-support-detail-facts">
        {([ ["Subject", detail.subject], ["Status", detail.status], ["Priority", detail.priority], ["Category", detail.category], ["Created", detail.createdAt], ["Updated", detail.updatedAt] ] as Array<[string, unknown]>).map(([label, value]) => <div key={label}><span>{label}</span><strong>{safeText(value)}</strong></div>)}
      </div>
      <h4>{t("support.publicConversation", "Public conversation")}</h4>
      {messages.length ? <ol className="rx-support-feed-list">{messages.map((message, index) => <li key={String(message.id ?? `${message.createdAt ?? "message"}-${index}`)}><div><strong>{safeText(message.senderType ?? "Message")}</strong><time>{safeText(message.createdAt)}</time></div><p>{safeText(message.message)}</p>{message.attachmentUrl ? <small>{t("support.attachmentHidden", "Attachment reference hidden. Use only a verified time-limited attachment flow.")}</small> : null}</li>)}</ol> : <p className="rx-muted">{t("support.noMessages", "No conversation messages were returned for this case.")}</p>}
    </> : null}
    <div className="rx-support-internal-notes"><h4>{t("support.internalNotes", "Internal notes")}</h4>
      {notesError ? <Notice tone="warning">{notesError}</Notice> : notes.length ? <ol className="rx-support-feed-list">{notes.map((note, index) => <li key={String(note.id ?? `${note.createdAt ?? "note"}-${index}`)}><div><strong>{t("support.internalNoteLabel", "Internal note")}</strong><time>{safeText(note.createdAt)}</time></div><p>{safeText(note.note)}</p></li>)}</ol> : <p className="rx-muted">{t("support.noInternalNotes", "No internal notes were returned.")}</p>}
    </div>
  </section>;
}

function BusinessControlBoard({ screen, cfg, data, loading, error, lastLoadedAt, search, setSearch, statusFilter, setStatusFilter, sortMode, setSortMode, list, selected, setSelected, onRetry, actions, draftNamespace }: {
  screen: Screen; cfg: WorkspaceConfig; data: unknown; loading: boolean; error: string; lastLoadedAt: string; search: string; setSearch:(v:string)=>void; statusFilter:string; setStatusFilter:(v:string)=>void; sortMode: SortMode; setSortMode: (mode: SortMode) => void; list: Row[]; selected: Row|null; setSelected:(v:Row|null)=>void; onRetry:()=>void; actions:ActionDef[]; draftNamespace: string;
}) {
  const { t } = useLanguage();
  const rawList = rows(data);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [screen, search, statusFilter, sortMode, list.length]);
  const pageCount = Math.max(1, Math.ceil(list.length / DISPLAY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleList = list.slice(safePage * DISPLAY_PAGE_SIZE, (safePage + 1) * DISPLAY_PAGE_SIZE);
  const meta = selected ? businessControlMeta(screen, selected, Math.max(0, rawList.indexOf(selected))) : null;
  const statusOptions = Array.from(new Set(rawList.map(r=>String(r.status ?? r.state ?? r.paymentStatus ?? r.payoutStatus ?? r.settlementStatus ?? r.caseStatus ?? r.notificationStatus ?? "").toUpperCase()).filter(Boolean))).slice(0,10);
  const labels = summaryLabels(screen);
  return <div className={`rx-page rx-business-board rx-business-${screen}`}>
    <div className="rx-page-head"><div><div className="rx-eyebrow">{cfg.eyebrow}</div><h1>{t(`nav.${screen}`, cfg.title)}</h1><p>{t(`workspace.${screen}.description`, cfg.desc)}</p></div><Button variant="secondary" loading={loading} onClick={onRetry} disabled={loading}><RefreshCw size={15}/>{t("common.refresh", "Refresh")}</Button></div>
    <div className="rx-control-context"><span>Scope: authorized backend data</span><span>{screen === "payments" || screen === "finance" ? "Money state is backend authoritative." : screen === "support" || screen === "safety" ? "Case state and actions remain backend authoritative." : "Configuration/data changes use confirmed backend actions only."}</span>{lastLoadedAt?<span>Updated {lastLoadedAt}</span>:null}</div>
    {error?<Notice tone="danger">{error}</Notice>:null}
    {error && data !== null ? <Notice tone="warning">Showing the last successful response from {lastLoadedAt || "an earlier fetch"}; these records may be stale.</Notice> : null}
    {screen === "support" ? <Notice tone="info">{t("support.contractNotice", "Case actions, assignment, notes and state transitions are available only when their exact backend endpoints and authorization contract are confirmed.")}</Notice> : null}
    {!loading ? <div className="rx-business-kpis">{labels.map(label=><div key={label} className="rx-business-kpi"><span>{label}</span><strong>{statFor(screen, rawList, label)}</strong></div>)}</div> : null}
    <div className="rx-business-toolbar"><label className="rx-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={searchPlaceholder(screen)}/></label><div className="rx-filter-row"><SortSelector value={sortMode} onChange={setSortMode}/>{statusOptions.length?<select aria-label="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">{t("common.allStatuses", "All statuses")}</option>{statusOptions.map(s=><option key={s} value={s}>{s}</option>)}</select>:null}<span className="rx-count">{loading?t("common.loading", "Loading…"):t("common.filteredCount", "{count} filtered").replace("{count}", String(list.length))}</span></div></div>
    <div className="rx-business-layout">
      <Card title={`${cfg.title} queue`} eyebrow="BACKEND DATA" action={cfg.endpoint?<code className="rx-endpoint">GET {cfg.endpoint}</code>:null}>
        {loading ? <PixelLoader variant="center" label={`Loading ${cfg.title}…`}/> : data === null && error ? <EmptyState title={`${cfg.title} unavailable`} description="The initial backend request failed. Retry to load records; an error is not treated as an empty dataset."/> : list.length ? <><div className="rx-business-list">{visibleList.map((row,i)=>{const globalIndex=safePage * DISPLAY_PAGE_SIZE + i; const m=businessControlMeta(screen,row,globalIndex);return <button key={String(row.id ?? row.code ?? row.caseId ?? row.paymentId ?? globalIndex)} type="button" className={`rx-business-row ${selected===row?"selected":""}`} onClick={()=>setSelected(row)}><div className="rx-business-row-main"><div><strong>{m.title}</strong><span>{m.line1 || "Backend record"}</span><span>{m.line2 || ""}</span></div><div className="rx-business-row-side"><StatusPill value={m.status}/><small>{m.tag}</small></div></div></button>})}</div><RecordPager total={list.length} page={safePage} onPage={setPage}/></> : <EmptyState title={`No ${cfg.title.toLowerCase()} records`} description="No backend records match the current search or status filter."/>}
      </Card>
      <Card title={selected ? "Selected details" : "Select a record"} eyebrow="DETAIL">
        {selected && meta ? <div className="rx-business-detail"><div className="rx-business-detail-head"><div><strong>{meta.title}</strong><span>{meta.line1 || "Backend record"}</span></div><StatusPill value={meta.status}/></div><div className="rx-business-detail-callout"><span>{meta.tag}</span><span>Backend remains the source of truth.</span></div><div className="rx-detail-grid">{detailEntries(selected, screen).map(([key,value])=><div key={key} className="rx-detail-item"><span>{key}</span><strong>{scalar(value)}</strong></div>)}</div>
          {screen === "support" ? <SupportCaseDetailPanel key={String(selected.id ?? selected.caseId ?? "selected-case")} caseId={String(selected.id ?? selected.caseId ?? "")}/> : null}
        </div> : <div className="rx-detail-empty"><ReceiptText size={20}/><p>Select a record to inspect operational or financial details without leaving the workspace.</p></div>}
      </Card>
    </div>
    {actions.length ? <div className="rx-action-grid">{actions.map(def=><ActionCard key={`${def.id}-${rowIdentity(selected)}`} def={def} selected={selected} onDone={onRetry} draftNamespace={draftNamespace}/>)}</div> : null}
    <details className="rx-guide"><summary>How this workspace works</summary><div className="rx-guide-grid"><div><strong>1 · Find</strong><span>Search or filter the backend-authoritative records.</span></div><div><strong>2 · Inspect</strong><span>Select a record for identifiers, state and returned context.</span></div><div><strong>3 · Act</strong><span>Use only the confirmed backend controls shown below.</span></div></div></details>
  </div>;
}

function AuditFilterPanel({ value, onChange, rowCount, timezone, serverFilters, onApplyServerFilters }: { value: AuditFilters; onChange: (next: AuditFilters) => void; rowCount: number; timezone: string; serverFilters: AuditServerFilters; onApplyServerFilters: (next: AuditServerFilters) => void }) {
  const [serverDraft, setServerDraft] = useState<AuditServerFilters>(serverFilters);
  useEffect(() => setServerDraft(serverFilters), [serverFilters]);
  const update = (key: keyof AuditFilters, nextValue: string) => onChange({ ...value, [key]: nextValue });
  const updateServer = (key: keyof AuditServerFilters, nextValue: string) => setServerDraft((previous) => ({ ...previous, [key]: nextValue }));
  const clear = () => {
    onChange({ fromDate: "", toDate: "", actor: "", role: "", target: "", result: "" });
    const empty = { module: "", entityType: "", entityId: "" };
    setServerDraft(empty);
    onApplyServerFilters(empty);
  };
  const dateRangeInvalid = Boolean(value.fromDate && value.toDate && value.fromDate > value.toDate);
  return <Card title="Audit filters" eyebrow="BACKEND + CURRENT RESPONSE">
    <Notice tone="info">Module, entity type and entity ID are sent to the backend. Date, actor, role, target and result filters apply to the CURRENT RESPONSE ONLY (the rows returned by the backend). The backend returns at most 300 newest records per request; no full audit export is available. Detail payloads remain redacted.</Notice>
    <div className="rx-audit-server-filter-grid" aria-label="Backend audit filters">
      <label>Module <input value={serverDraft.module} onChange={event => updateServer("module", event.target.value)} placeholder="e.g. otp-security" maxLength={100}/></label>
      <label>Entity type <input value={serverDraft.entityType} onChange={event => updateServer("entityType", event.target.value)} placeholder="e.g. OtpPurpose" maxLength={100}/></label>
      <label>Entity ID <input value={serverDraft.entityId} onChange={event => updateServer("entityId", event.target.value)} placeholder="Exact entity ID" maxLength={128}/></label>
      <Button type="button" variant="secondary" onClick={() => onApplyServerFilters(serverDraft)}>Apply backend filters</Button>
    </div>
    <div className="rx-audit-filter-grid">
      <label>From date<input type="date" value={value.fromDate ?? ""} max={value.toDate || undefined} onChange={event => update("fromDate", event.target.value)}/></label>
      <label>To date<input type="date" value={value.toDate ?? ""} min={value.fromDate || undefined} onChange={event => update("toDate", event.target.value)}/></label>
      <label>Actor ID / name<input value={value.actor ?? ""} onChange={event => update("actor", event.target.value)} placeholder="Actor" maxLength={120}/></label>
      <label>Role<input value={value.role ?? ""} onChange={event => update("role", event.target.value)} placeholder="Role" maxLength={80}/></label>
      <label>Target / resource<input value={value.target ?? ""} onChange={event => update("target", event.target.value)} placeholder="Target" maxLength={120}/></label>
      <label>Result<input value={value.result ?? ""} onChange={event => update("result", event.target.value)} placeholder="Success / failed" maxLength={80}/></label>
    </div>
    <div className="rx-audit-filter-footer"><span>Displayed timezone: {timezone || "Local browser timezone"} · {rowCount} matching loaded rows</span><Button type="button" variant="secondary" onClick={clear}>Clear filters</Button></div>
    {dateRangeInvalid ? <Notice tone="danger">The from-date must be on or before the to-date.</Notice> : null}
    <p className="rx-muted">Audit export remains unavailable until the backend supplies a verified, permission-scoped export contract and field allowlist.</p>
  </Card>;
}

function RecoveryStatusPanel({ refreshSignal }: { refreshSignal: string }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request<Record<string, any>>(RIDEX_API.admin.recoveryStatus);
      setStatus(result && typeof result === "object" && !Array.isArray(result) ? result : null);
      setLoadedAt(new Date().toLocaleString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshSignal]);
  const verifiedBackup = status?.verifiedBackup && typeof status.verifiedBackup === "object" ? status.verifiedBackup as Record<string, any> : null;
  const showDate = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return "Not returned";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unrecognized timestamp";
  };
  return <Card title={t("recovery.statusTitle", "Recovery readiness status")} eyebrow={t("recovery.statusEyebrow", "SUPER ADMIN · BACKEND STATUS")} action={<Button type="button" variant="secondary" loading={loading} disabled={loading} onClick={() => void load()}><RefreshCw size={14}/>{t("common.refresh", "Refresh")}</Button>}>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {loading && status === null ? <PixelLoader variant="center" label={t("recovery.loading", "Loading recovery status…")}/> : null}
    {status ? <>
      <div className="rx-recovery-status-grid">
        <div className="rx-recovery-status-item"><span>{t("recovery.environment", "Requested environment")}</span><strong>{String(status.environment ?? "Not returned")}</strong></div>
        <div className="rx-recovery-status-item"><span>{t("recovery.activeEnvironment", "Active environment")}</span><strong>{String(status.activeEnvironment ?? "Not returned")}</strong></div>
        <div className="rx-recovery-status-item"><span>{t("recovery.backupReady", "Verified backup available")}</span><strong><StatusPill value={status.backupReady === true ? "READY" : status.backupReady === false ? "NOT READY" : "UNKNOWN"}/></strong></div>
        <div className="rx-recovery-status-item"><span>{t("recovery.recoveryReady", "Recovery readiness")}</span><strong><StatusPill value={status.recoveryReady === true ? "READY" : status.recoveryReady === false ? "NOT READY" : "UNKNOWN"}/></strong></div>
        <div className="rx-recovery-status-item"><span>{t("recovery.deploymentStatus", "Deployment status")}</span><strong>{String(status.deploymentStatus ?? "Not returned")}</strong></div>
        <div className="rx-recovery-status-item"><span>{t("recovery.latestBackupId", "Latest verified backup ID")}</span><strong>{String(verifiedBackup?.id ?? "None")}</strong></div>
        <div className="rx-recovery-status-item"><span>{t("recovery.latestBackupCompleted", "Latest backup completed")}</span><strong>{showDate(verifiedBackup?.completedAt)}</strong></div>
      </div>
      {status.backupReady === false ? <Notice tone="danger">{t("recovery.noVerifiedBackup", "The backend did not report a verified backup for this environment. Recovery must be treated as not ready.")}</Notice> : null}
    </> : null}
    {error && status ? <Notice tone="warning">{t("recovery.stale", "Showing the last successful recovery status; it may be stale.")} {loadedAt || ""}</Notice> : null}
    <p className="rx-muted">{t("recovery.sensitiveStorage", "Storage paths and raw backup storage keys are intentionally not shown in the browser.")}</p>
  </Card>;
}

function ReportReadinessPanel({ context }: { context: AdminContext }) {
  const { t } = useLanguage();
  const items = [
    { key: "dashboard", title: t("reports.sourceDashboard", "Dashboard summary"), status: t("reports.available", "Available"), tone: "available", detail: "Backend aggregate counts only" },
    { key: "catalog", title: t("reports.catalog", "Report catalog"), status: t("reports.notAvailable", "Not available"), tone: "unavailable", detail: t("reports.catalogDetail", "No dedicated report catalog endpoint was found in the reviewed backend source.") },
    { key: "jobs", title: t("reports.jobs", "Report jobs and history"), status: t("reports.notAvailable", "Not available"), tone: "unavailable", detail: t("reports.jobsDetail", "No verified report-job lifecycle or history endpoint was found.") },
    { key: "filters", title: t("reports.filters", "Date, timezone and scoped filters"), status: t("reports.notAvailable", "Not connected"), tone: "unavailable", detail: t("reports.filtersDetail", "These values are not sent anywhere. Date/timezone and scoped filters are not sent to the dashboard endpoint and must not be treated as applied.") },
    { key: "exports", title: t("reports.exports", "CSV / JSON / PDF export"), status: t("reports.disabled", "Disabled"), tone: "unavailable", detail: t("reports.exportsDetail", "No verified permission-scoped export route, output schema or field allowlist was found.") },
  ];
  return <div className="rx-report-readiness">
    <Card title={t("reports.availabilityTitle", "Reporting capability status")} eyebrow={t("reports.contractGate", "BACKEND CONTRACT GATE")}>
      <Notice tone="warning">{t("reports.contractNotice", "Report catalog, job state, timezone/scope query and export schema have not been verified. Only dashboard-backed metrics are displayed; report and export actions remain unavailable until the report/export contract is supplied and verified against backend source.")}</Notice>
      <div className="rx-report-availability-grid" aria-label={t("reports.availabilityTitle", "Reporting capability status")}>
        {items.map(item => <article className={`rx-report-availability-card ${item.tone}`} key={item.key}><div className="rx-report-availability-head"><strong>{item.title}</strong><span>{item.status}</span></div><p>{item.detail}</p></article>)}
      </div>
      <div className="rx-report-scope"><span>{t("reports.currentScope", "Current Admin context")}</span><strong>{context.isSuperAdmin ? "Super Admin · global dashboard context" : `${context.adminLevel}${context.stateId ? ` · State ${context.stateId}` : ""}${context.cityId ? ` · City ${context.cityId}` : ""}`}</strong><small>{t("reports.scopeNote", "This label describes the session context, not proof that dashboard aggregate counts are geographically restricted.")}</small></div>
      <Notice tone="danger">{t("reports.geographicWarning", "Backend review found dashboard aggregate count queries without explicit STATE/CITY predicates for non-Super Admin roles. Do not treat these metrics as regional totals until backend scope enforcement is verified.")}</Notice>
      <p className="rx-muted">{t("reports.noFakeExports", "Run report unavailable. No report has been run and no file has been generated or downloaded from this screen.")}</p>
    </Card>
  </div>;
}

function GenericWorkspacePage({screen,context,environment,realtime,realtimeEvent}:{screen:Screen;context:AdminContext;environment:Environment;realtime:"connecting"|"connected"|"offline";realtimeEvent:{type:string;at:string;replayGap:boolean}}){
  const { t } = useLanguage();
  const cfg=WORKSPACES[screen];
  const presentation=workspacePresentation(screen);
  const [search,setSearch]=useState(""); const [statusFilter,setStatusFilter]=useState("ALL"); const [sortMode,setSortMode]=useState<SortMode>("newest"); const [data,setData]=useState<unknown>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [lastLoadedAt,setLastLoadedAt]=useState(""); const [selected,setSelected]=useState<Row|null>(null);
  const [auditFilters, setAuditFilters] = useState<AuditFilters>({ fromDate:"", toDate:"", actor:"", role:"", target:"", result:"" });
  const [auditServerFilters, setAuditServerFilters] = useState<AuditServerFilters>({ module:"", entityType:"", entityId:"" });
  const auditServerFiltersRef = useRef<AuditServerFilters>({ module:"", entityType:"", entityId:"" });
  const requestSequence = useRef(0);
  // C045 backend source currently shows GET /admin/bookings without an explicit STATE/CITY filter.
  // Fail closed in this UI for scoped actors until the server route itself is corrected and tested.
  const bookingScopeUnverified = ["live", "rides"].includes(screen) && !context.isSuperAdmin && context.adminLevel !== "GLOBAL";
  const driverScopeUnverified = ["drivers", "driversOps", "vehicles", "kyc", "workingRoutes"].includes(screen) && !context.isSuperAdmin && context.adminLevel !== "GLOBAL";
  const customerScopeUnverified = screen === "customers" && !context.isSuperAdmin && context.adminLevel !== "GLOBAL";
  // Pricing rules can be filtered by zoneId, but backend list/create/update handlers do not yet enforce assigned STATE/CITY zone scope.
  const pricingScopeUnverified = screen === "pricing" && !context.isSuperAdmin && context.adminLevel !== "GLOBAL";
  // GET /admin/admins and GET /admin/roles return cross-scope records without visible STATE/CITY predicates.
  const adminDirectoryScopeUnverified = ["admins", "roles"].includes(screen) && !context.isSuperAdmin && context.adminLevel !== "GLOBAL";
  const superAdminWorkspaceBlocked = ["sessions", "scopeAssignments"].includes(screen) && !context.isSuperAdmin;
  const browserTimezone = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local browser timezone"; } catch { return "Local browser timezone"; } }, []);
  const [selectedRecordKey,setSelectedRecordKey]=useSessionDraft<string>(`ridex-admin-selected-record-${context.adminId || "current"}-${screen}`, "");
  const selectRecord=useCallback((row:Row|null)=>{setSelected(row);setSelectedRecordKey(row ? rowIdentity(row) : "");},[setSelectedRecordKey]);
  const load=useCallback(async()=>{
  if (["vehicleCatalog", "gateway", "availability", "routeBuilder"].includes(screen)) return;
    const sequence = ++requestSequence.current;
    if (screen === "assets") return;
    if (adminDirectoryScopeUnverified || superAdminWorkspaceBlocked) {
      setData(null);
      setSelected(null);
      setError(adminDirectoryScopeUnverified
        ? "Admin directory and role records are withheld for STATE/CITY-scoped Admins because the backend list endpoints do not visibly enforce assigned geographic scope."
        : "This workspace is restricted to Super Admin by the confirmed backend route contract.");
      setLoading(false);
      return;
    }
    if (bookingScopeUnverified || driverScopeUnverified || customerScopeUnverified) {
      setData(null);
      setSelected(null);
      setError(driverScopeUnverified
        ? "Driver, vehicle, KYC and working-route records are hidden for STATE/CITY-scoped Admins until the backend GET /admin/drivers and GET /admin/drivers/:driverId routes enforce assigned geographic scope. A UI guard does not replace backend authorization."
        : customerScopeUnverified
          ? "Customer records are hidden for STATE/CITY-scoped Admins until the backend GET /admin/customers and GET /admin/customers/:customerId routes enforce assigned geographic scope. A UI guard does not replace backend authorization."
          : pricingScopeUnverified
            ? "Pricing rules are hidden for STATE/CITY-scoped Admins until the backend pricing-rule list/create/update routes enforce assigned geographic zone scope. A UI guard does not replace backend authorization."
            : "Live Operations is hidden for STATE/CITY-scoped Admins until the backend GET /admin/bookings route is verified to enforce the assigned geographic scope. A UI guard does not replace backend authorization.");
      setLoading(false);
      return;
    }
    setLoading(true);setError("");
    try {
      let result: unknown;
      if (screen === "live") {
        if (!cfg.endpoint) throw new ApiError("Live Operations has no verified booking endpoint.", 501);
        const batches = await Promise.all(LIVE_OPERATIONAL_STATUSES.map((status) => request<unknown>(withQuery(cfg.endpoint!, { status }))));
        result = mergeLiveOperationalBookingBatches(batches);
      } else {
        const path = screen === "audit"
          ? withQuery(cfg.endpoint || "", {
              module: auditServerFiltersRef.current.module,
              entityType: auditServerFiltersRef.current.entityType,
              entityId: auditServerFiltersRef.current.entityId,
            })
          : (cfg.endpoint || "");
        result = await request<any>(path);
      }
      if (sequence !== requestSequence.current) return;
      setData(result);setLastLoadedAt(new Date().toLocaleTimeString());
      setSelected((previous)=>{if(!previous)return null;const key=rowIdentity(previous);return key ? rows(result).find((row)=>rowIdentity(row)===key) ?? null : previous;});
    } catch(e) {
      if (sequence !== requestSequence.current) return;
      setError(e instanceof ApiError?`${e.message}${e.status?` · HTTP ${e.status}`:""}`:e instanceof Error?e.message:"Unable to load workspace.");
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  },[cfg.endpoint, screen, bookingScopeUnverified, driverScopeUnverified, customerScopeUnverified, pricingScopeUnverified, adminDirectoryScopeUnverified, superAdminWorkspaceBlocked]);
  const applyServerAuditFilters = useCallback((next: AuditServerFilters) => {
    const normalized = {
      module: String(next.module ?? "").trim().slice(0, 100),
      entityType: String(next.entityType ?? "").trim().slice(0, 100),
      entityId: String(next.entityId ?? "").trim().slice(0, 128),
    };
    auditServerFiltersRef.current = normalized;
    setAuditServerFilters(normalized);
    void load();
  }, [load]);
  useEffect(()=>{setSearch("");setStatusFilter("ALL");setAuditFilters({ fromDate:"", toDate:"", actor:"", role:"", target:"", result:"" });const emptyAuditServerFilters={module:"",entityType:"",entityId:""};auditServerFiltersRef.current=emptyAuditServerFilters;setAuditServerFilters(emptyAuditServerFilters);setData(null);setSelected(null);setLastLoadedAt("");setError("");void load();return () => { requestSequence.current += 1; };},[load,screen]);
  useEffect(()=>{
    if (!selectedRecordKey || data === null) return;
    const match = rows(data).find((row) => rowIdentity(row) === selectedRecordKey);
    if (match) setSelected(match);
    else if (!loading) { setSelected(null); setSelectedRecordKey(""); }
  },[data,selectedRecordKey,loading,setSelectedRecordKey]);
  useEffect(() => {
    const relevant = (eventType: string) => {
      if (screen === "assets") return false;
      if (
    ["vehicleCatalog", "gateway", "availability", "routeBuilder"].includes(screen)
  ) {
    return false;
  }
      const t = eventType.toUpperCase();
      if (["live","rides","quickRide"].includes(screen)) return /BOOKING|RIDE|TRIP|MATCH/.test(t);
      if (["drivers","driversOps","vehicles","kyc","workingRoutes"].includes(screen)) return /DRIVER|VEHICLE|KYC|VERIFICATION/.test(t);
      if (["customers"].includes(screen)) return /CUSTOMER/.test(t);
      if (["payments","finance","commission","promotions"].includes(screen)) return /PAYMENT|PAYOUT|SETTLEMENT|COMMISSION|PROMOTION|PRICING/.test(t);
      if (["safety"].includes(screen)) return /SAFETY|SOS/.test(t);
      if (["support","notifications","deliveryHealth"].includes(screen)) return /SUPPORT|NOTIFICATION|DELIVERY|PUSH|GATEWAY|BROADCAST/.test(t);
      if (["locations","cities","states","cityZones","routesOps","routeBuilder","sharingRoutes","routeRules"].includes(screen)) return /LOCATION|CITY|ROUTE|ZONE/.test(t);
      if (["gateway"].includes(screen)) return /GATEWAY|BROADCAST|DEVICE/.test(t);
      if (["assets"].includes(screen)) return /ASSET/.test(t);
      if (["dataMerge","platform","monitoring","backup","setup","admins","roles","sessions","security","audit","scopeAssignments","publicLinks"].includes(screen)) return /ADMIN|CONFIG|PLATFORM|MERGE|BACKUP|SECURITY|SESSION|RELEASE|SCOPE|DOWNLOAD/.test(t);
      if (["events"].includes(screen)) return /EVENT|SESSION/.test(t);
      return false;
    };
    let refreshTimer: number | null = null;
    const scheduleLoad = () => {
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => { refreshTimer = null; void load(); }, 350);
    };
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type?: string } | undefined;
      if (detail?.type && relevant(detail.type)) scheduleLoad();
    };
    const handleResync = () => scheduleLoad();
    window.addEventListener("ridex-admin-realtime", handleRealtime);
    window.addEventListener("ridex-admin-realtime-resync", handleResync);
    return () => {
      window.removeEventListener("ridex-admin-realtime", handleRealtime);
      window.removeEventListener("ridex-admin-realtime-resync", handleResync);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [cfg.endpoint, screen, load]);
  const list=useMemo(()=>{const q=search.trim().toLowerCase();const filtered=rows(data).filter(row=>{const text=JSON.stringify(row).toLowerCase();const status=String(row.status??row.approvalStatus??row.verificationStatus??row.state??row.result??"").toUpperCase();return (!q||text.includes(q))&&(statusFilter==="ALL"||status===statusFilter);});const scoped=screen === "audit" ? filterAuditRecords(filtered, auditFilters) as Row[] : filtered;return sortRows(scoped, sortMode);},[data,search,statusFilter,sortMode,screen,auditFilters]);
  const canManagePermissions = context.isSuperAdmin || context.permissions.some((permission) => String(permission.module ?? "").toLowerCase() === "admins" && String(permission.action ?? "").toUpperCase() === "MANAGE_PERMISSIONS");
  const canEditSelectedRolePermissions = canManagePermissions && (context.isSuperAdmin || selected?.isSystem !== true);
  const actions=[...getActions(screen),...getEditActions(screen)].filter((action) => !(screen === "roles" && action.id === "permissions") || canEditSelectedRolePermissions); const readOnly=actions.length===0&&!needsMap(screen)&&!["monitoring","sessions","assets"].includes(screen); const statusOptions=Array.from(new Set(rows(data).map(r=>String(r.status??r.approvalStatus??r.verificationStatus??r.state??"").toUpperCase()).filter(Boolean))).slice(0,8);
  if (adminDirectoryScopeUnverified || superAdminWorkspaceBlocked) return <div className="rx-page rx-live-scope-blocked"><div className="rx-page-head"><div><div className="rx-eyebrow">SECURITY & ACCESS · SCOPE SAFETY</div><h1>{t(`nav.${screen}`, WORKSPACES[screen].title)}</h1><p>Administrative account data is withheld until the signed-in actor's access level is verified for this workspace.</p></div></div>{adminDirectoryScopeUnverified ? <Notice tone="danger">The backend Admin and Role list endpoints return global records and do not visibly filter them by the assigned STATE/CITY scope. No request is sent for this scoped view.</Notice> : <Notice tone="danger">Backend source confirms this workspace is Super Admin-only. No request is sent for this actor.</Notice>}<Notice tone="warning">This frontend guard does not replace server-side authorization. Fix and directly test geographic scope on the backend before enabling scoped Admin access.</Notice></div>;
  if (bookingScopeUnverified || driverScopeUnverified || customerScopeUnverified || pricingScopeUnverified) return <div className="rx-page rx-live-scope-blocked"><div className="rx-page-head"><div><div className="rx-eyebrow">OPERATIONS · SCOPE SAFETY</div><h1>{driverScopeUnverified || customerScopeUnverified || pricingScopeUnverified ? t(`nav.${screen}`, WORKSPACES[screen].title) : screen === "live" ? t("nav.live", "Live Operations") : t("nav.rides", "Bookings & Rides")}</h1><p>This operational view is temporarily withheld for geographic-scoped Admins.</p></div></div>{driverScopeUnverified ? <Notice tone="danger">Current backend source review found that GET /admin/drivers and GET /admin/drivers/:driverId use unscoped list/detail queries. Driver-related records are blocked rather than showing potentially out-of-scope data.</Notice> : customerScopeUnverified ? <Notice tone="danger">Current backend source review found that GET /admin/customers and GET /admin/customers/:customerId use unscoped list/detail queries. Customer records are blocked rather than showing potentially out-of-scope data.</Notice> : pricingScopeUnverified ? <Notice tone="danger">Current backend source review found that GET /admin/operations/pricing-rules accepts an optional zoneId but does not visibly restrict it to the assigned STATE/CITY scope; POST/PATCH also lack a visible zone-scope check. Pricing rules are blocked rather than exposing or changing out-of-scope regional configuration.</Notice> : <Notice tone="danger">Current backend source review found that GET /admin/bookings and GET /admin/bookings/:bookingId do not visibly apply the assigned STATE/CITY scope to their booking queries. This screen is blocked rather than showing potentially out-of-scope booking data.</Notice>}<Notice tone="warning">This is a frontend mitigation only. The backend routes must enforce geographic scope and pass direct-API negative tests before these screens can be re-enabled for STATE/CITY Admins.</Notice></div>;

  if (screen === "vehicleCatalog") return <VehicleCatalogPage />;
  if (screen === "gateway") return <GatewayPage />;
  if (screen === "availability") return <AvailabilityPage />;
  if (screen === "routeBuilder") return <RouteBuilderPage context={context} />;
  if (screen === "otp") return <OtpConfigurationWorkspace context={context} data={data} loading={loading} error={error} lastLoadedAt={lastLoadedAt} onRefresh={load} />;
  if (screen === "deliveryHealth") return <div className="rx-page rx-workspace-page rx-delivery-health-page"><div className="rx-page-head"><div><div className="rx-eyebrow">{cfg.eyebrow}</div><h1>{t(`nav.${screen}`, cfg.title)}</h1><p>{t(`workspace.${screen}.description`, cfg.desc)}</p></div><Button variant="secondary" loading={loading} disabled={loading} onClick={() => void load()}><RefreshCw size={15}/>{t("common.refresh", "Refresh")}</Button></div>{error ? <Notice tone="danger">{error}</Notice> : null}{loading && data === null ? <PixelLoader variant="center" label="Loading signed-in account device health…"/> : null}{!loading && data === null && error ? <EmptyState title="Delivery health unavailable" description="The backend did not return device health. Retry after confirming API access."/> : null}{screen === "deliveryHealth" ? <DeliveryHealthPanel data={data} lastLoadedAt={lastLoadedAt} realtime={realtime} realtimeEvent={realtimeEvent}/> : null}</div>;
  if (["live", "rides", "drivers", "driversOps", "kyc", "customers"].includes(screen)) {
    return <CoreOpsBoard screen={screen} cfg={cfg} data={data} loading={loading} error={error} lastLoadedAt={lastLoadedAt} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} sortMode={sortMode} setSortMode={setSortMode} list={list} rawList={rows(data)} selected={selected} setSelected={selectRecord} onRetry={load} actions={actions} draftNamespace={`${context.adminId}-${screen}`}/>;
  }
  if (["states", "cities", "locations", "quickLocations", "cityZones", "routesOps", "workingRoutes", "sharingRoutes", "routeRules"].includes(screen)) {
    return <LocationRoutePage screen={screen} context={context} />;
  }
  if (["payments", "finance", "pricing", "commission", "promotions", "safety", "support", "notifications"].includes(screen)) {
    return <BusinessControlBoard screen={screen} cfg={cfg} data={data} loading={loading} error={error} lastLoadedAt={lastLoadedAt} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} sortMode={sortMode} setSortMode={setSortMode} list={list} selected={selected} setSelected={selectRecord} onRetry={load} actions={actions} draftNamespace={`${context.adminId}-${screen}`}/>;
  }
  return <div className={`rx-page rx-workspace-page rx-workspace-${presentation} rx-screen-${screen}`}>
    <div className="rx-page-head"><div><div className="rx-eyebrow">{cfg.eyebrow}</div><h1>{t(`nav.${screen}`, cfg.title)}</h1><p>{t(`workspace.${screen}.description`, cfg.desc)}</p></div><Button variant="secondary" loading={loading} onClick={load} disabled={loading}><RefreshCw size={15}/>{t("common.refresh", "Refresh")}</Button></div>
    <Notice>{context.isSuperAdmin?"Super Admin · global authorized workspace.":"Admin scope is enforced by the backend; the UI only displays what the current actor is allowed to access."}</Notice>
    {error?<Notice tone="danger">{error}</Notice>:null}
    {error && data !== null ? <Notice tone="warning">The last successful dataset is retained and may be stale (last fetch: {lastLoadedAt || "unknown"}).</Notice> : null}
    {screen === "audit" ? <AuditFilterPanel value={auditFilters} onChange={setAuditFilters} rowCount={list.length} timezone={browserTimezone} serverFilters={auditServerFilters} onApplyServerFilters={applyServerAuditFilters}/> : null}
    {screen === "reports" ? <Notice tone="info">{t("reports.contractNotice", "This view displays dashboard-backed metrics only. The report/export contract has not been verified against backend source.")}</Notice> : null}
    {screen === "reports" ? <ReportReadinessPanel context={context}/> : null}
    {screen === "backup" ? <RecoveryStatusPanel refreshSignal={lastLoadedAt}/> : null}
    {screen === "scopeAssignments" ? <PermissionGate context={context} module="admin" action="scope" fallback={<Notice tone="danger">Geographic scope assignment requires the explicitly authorized Super Admin context. No assignment controls are available to this actor.</Notice>}><ScopeAssignmentPanel context={context} data={data} selected={selected}/></PermissionGate> : null}
    {screen === "publicLinks" ? <PublicLinksPanel data={data} environment={environment}/> : null}
    {!loading&&data!==null?<OverviewCards screen={screen} list={rows(data)} data={data}/>:null}
    {presentation==="map-primary"&&needsMap(screen)?<div className="rx-workspace-map-primary"><GeoMap data={data} title={`${cfg.title} map`} height={430}/></div>:null}
    <div className={`rx-workspace-layout rx-layout-${presentation}`}>
      <Card title={`${cfg.title} records`} eyebrow={lastLoadedAt?`LAST FETCH ${lastLoadedAt}`:"BACKEND DATA"} action={cfg.endpoint?<code className="rx-endpoint">GET {cfg.endpoint}</code>:null}>
        <div className="rx-toolbar"><div className="rx-search-wrap"><label className="rx-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={searchPlaceholder(screen)}/></label><SearchSuggestions screen={screen} rawList={rows(data)} search={search} setSearch={setSearch}/></div><div className="rx-filter-row"><SortSelector value={sortMode} onChange={setSortMode}/>{statusOptions.length?<select aria-label="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">{t("common.allStatuses", "All statuses")}</option>{statusOptions.map(s=><option value={s} key={s}>{s}</option>)}</select>:null}<span className="rx-count">{loading?t("common.loading", "Loading…"):t("common.filteredCount", "{count} filtered").replace("{count}", String(list.length))}</span></div></div>
        {loading?<PixelLoader variant="center" label={`Loading ${cfg.title}…`}/>:data===null&&error?<EmptyState title={`${cfg.title} unavailable`} description="The initial request did not return a dataset. Retry instead of treating this as an empty workspace."/>:list.length?<RecordList list={list} selected={selected} onSelect={selectRecord} screen={screen}/>:<EmptyState title="No records" description="The last successful backend response contains no records matching this view or filter."/>}
      </Card>
      {presentation==="map-support"&&needsMap(screen)?<div className="rx-workspace-map-support"><GeoMap data={data} title={`${cfg.title} map`} height={320}/></div>:null}
      <DetailCard row={selected} screen={screen}/>
    </div>
    {actions.length?<div className="rx-action-grid">{actions.map(def=><ActionCard key={`${def.id}-${rowIdentity(selected)}`} def={def} selected={selected} onDone={load} draftNamespace={`${context.adminId}-${screen}`}/>)}</div>:null}
    {extraForScreen(screen,load,selected)}
    {screen==="backup"?<Card title="Recovery safety" eyebrow="IMPORTANT"><Notice tone="warning">Restore is destructive. The backend remains authoritative for checksum, environment confirmation and recovery protection.</Notice></Card>:null}
    {readOnly?<div className="rx-source-note"><ExternalLink size={13}/> This page is read/refresh oriented because no mutation endpoint is confirmed for the exact workspace. Backend data remains the source of truth.</div>:null}
    {screen!=="assets"&&!readOnly?<details className="rx-guide"><summary>About this workspace</summary><div className="rx-guide-grid"><div><strong>1 · Search</strong><span>Search backend records by the identifiers relevant to this workspace.</span></div><div><strong>2 · Select</strong><span>Select an item to open backend-authoritative details and related controls.</span></div><div><strong>3 · Edit & Save</strong><span>Where a confirmed mutation exists, actions call that exact backend endpoint.</span></div></div></details>:null}
  </div>;
}


function EventsWorkspace({ context }: { context: AdminContext }) {
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; message: string } | null>(null);
  const apiRequest: BlueprintApiRequest = useCallback(async <T = unknown,>(path: string, options?: RequestInit) => {
    const data = await request<T>(path, options ?? {});
    const envelope = data && typeof data === "object" ? data as unknown as Record<string, unknown> : null;
    if (envelope?.success === false) {
      const message = envelope.message;
      throw new ApiError(typeof message === "string" ? message : "Backend rejected the event operation.");
    }
    return { success: true, data };
  }, []);
  const notify = useCallback((type: "success" | "error" | "info", message: string) => {
    setNotice({ tone: type === "error" ? "danger" : type, message });
  }, []);

  return <div className="rx-page">
    <div className="rx-page-head"><div><div className="rx-eyebrow">RIDES & SERVICES</div><h1>Events & Sessions</h1><p>Set up a fixed route with 6–10 stops. Saved locations or Google Places can fill address and coordinates; the backend remains authoritative.</p></div></div>
    <Notice>Keep the event draft here while you work. The form and stop list are saved in this browser tab and are scoped to your Admin account; passwords, OTPs, tokens and secrets are never stored as drafts.</Notice>
    {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
    <EventsPanel apiRequest={apiRequest} notify={notify} draftNamespace={context.adminId || "current"} mutationsEnabled={API_CONTRACTS_VERIFIED} />
  </div>;
}

export interface WorkspacePageProps {
  screen: Screen;
  context: AdminContext;
  environment: Environment;
  realtime: "connecting" | "connected" | "offline";
  realtimeEvent: { type: string; at: string; replayGap: boolean };
}

export function WorkspacePage(props: WorkspacePageProps) {
  if (props.screen === "backup" && !props.context.isSuperAdmin) {
    return <div className="rx-page rx-recovery-access-blocked"><Card title="Backup & Recovery" eyebrow="SUPER ADMIN ONLY"><Notice tone="danger">Backup snapshots, recovery status and restore operations are restricted to Super Admin. The backend enforces this restriction too. No recovery request was sent for this view.</Notice></Card></div>;
  }
  if (props.screen === "services") {
    return (
      <Card title="Services" eyebrow="BACKEND CONTRACT">
        <Notice tone="info">
          The backend does not expose a general GET /meta endpoint. No unsupported API request was sent.
          Use Vehicle Catalog for supported vehicle catalog data. Service-specific configuration requires
          a separately verified backend API contract.
        </Notice>
      </Card>
    );
  }
  if (props.screen === "events") return <EventsWorkspace context={props.context} />;
  return <GenericWorkspacePage {...props} />;
}
