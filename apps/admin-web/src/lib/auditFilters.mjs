const normalize = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "success true" : "failed false";
  if (typeof value === "object") return "";
  return String(value).trim().toLowerCase();
};

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") {
      if (typeof value === "boolean") return value ? "success true" : "failed false";
      if (typeof value === "object") {
        const nested = value.name ?? value.id ?? value.code;
        if (nested !== undefined && nested !== null) return String(nested);
      } else return String(value);
    }
  }
  return "";
}

function localStart(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function localEndExclusive(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

/**
 * Client-side filters for the currently returned audit rows only. This never expands
 * server scope and must not be presented as server-side filtering or secure export.
 */
export function auditRecordMatchesFilters(row, filters = {}) {
  const actor = normalize(firstValue(row, ["actorName", "actorId", "adminName", "adminId", "userId", "performedBy", "initiatedBy"]));
  const role = normalize(firstValue(row, ["role", "actorRole", "adminRole", "performedByRole"]));
  const target = normalize(firstValue(row, ["target", "targetType", "targetId", "resource", "resourceType", "resourceId", "entity", "entityId", "recordId"]));
  const result = normalize(firstValue(row, ["result", "outcome", "actionResult", "status", "success", "succeeded"]));

  if (filters.actor && !actor.includes(normalize(filters.actor))) return false;
  if (filters.role && !role.includes(normalize(filters.role))) return false;
  if (filters.target && !target.includes(normalize(filters.target))) return false;
  if (filters.result && !result.includes(normalize(filters.result))) return false;

  const dateFilterRequested = Boolean(filters.fromDate || filters.toDate);
  if (dateFilterRequested) {
    const dateText = firstValue(row, ["timestamp", "createdAt", "occurredAt", "eventAt", "at", "date"]);
    const epoch = Date.parse(dateText);
    if (!dateText || !Number.isFinite(epoch)) return false;
    const from = filters.fromDate ? localStart(filters.fromDate) : null;
    const to = filters.toDate ? localEndExclusive(filters.toDate) : null;
    if (filters.fromDate && from === null) return false;
    if (filters.toDate && to === null) return false;
    if (from !== null && epoch < from) return false;
    if (to !== null && epoch >= to) return false;
  }
  return true;
}

export function filterAuditRecords(records, filters = {}) {
  return Array.isArray(records) ? records.filter((row) => row && typeof row === "object" && auditRecordMatchesFilters(row, filters)) : [];
}
