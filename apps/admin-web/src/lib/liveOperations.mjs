/**
 * Backend-confirmed active booking states for RideX Live Operations.
 * Keep aligned with services/backend/src/routes/admin.ts ACTIVE_OPERATIONAL_BOOKING_STATUSES.
 */
export const LIVE_OPERATIONAL_STATUSES = Object.freeze([
  "MATCHING",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVING",
  "DRIVER_ARRIVED",
  "STARTED",
  "IN_PROGRESS",
  "AT_RISK",
]);

const LIVE_OPERATIONAL_STATUS_SET = new Set(LIVE_OPERATIONAL_STATUSES);

/**
 * Validate, de-duplicate and sort the single combined active-booking response.
 * Fail closed if the backend returns a non-active or malformed operational record.
 */
export function normalizeLiveOperationalBookings(result) {
  if (!Array.isArray(result)) {
    throw new Error("Live Operations did not receive a valid active-booking list. Refresh before making an operational decision.");
  }

  const byId = new Map();
  const unidentified = [];
  for (const row of result) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("The backend returned an invalid booking record for Live Operations.");
    }

    const status = String(row.status ?? "").trim().toUpperCase();
    if (!LIVE_OPERATIONAL_STATUS_SET.has(status)) {
      throw new Error(`The backend returned a non-active booking status: ${status || "MISSING"}.`);
    }

    const id = String(row.id ?? row.bookingId ?? row.rideId ?? "").trim();
    if (id) byId.set(id, row);
    else unidentified.push(row);
  }

  return [...byId.values(), ...unidentified].sort((a, b) => {
    const aTime = Date.parse(String(a.createdAt ?? a.updatedAt ?? ""));
    const bTime = Date.parse(String(b.createdAt ?? b.updatedAt ?? ""));
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return 0;
  });
}