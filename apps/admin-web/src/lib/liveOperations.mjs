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

/**
 * Merge all status-filtered `/admin/bookings` responses as one complete snapshot.
 * A malformed/missing batch fails closed instead of quietly showing partial data.
 */
export function mergeLiveOperationalBookingBatches(batches) {
  if (!Array.isArray(batches) || batches.length !== LIVE_OPERATIONAL_STATUSES.length) {
    throw new Error("Live Operations did not receive every required active-status result. Refresh before making an operational decision.");
  }

  const byId = new Map();
  const unidentified = [];
  batches.forEach((batch, batchIndex) => {
    if (!Array.isArray(batch)) {
      throw new Error(`The backend returned an invalid booking list for active status ${LIVE_OPERATIONAL_STATUSES[batchIndex]}.`);
    }
    for (const row of batch) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const id = String(row.id ?? row.bookingId ?? row.rideId ?? "").trim();
      if (id) byId.set(id, row);
      else unidentified.push(row);
    }
  });

  return [...byId.values(), ...unidentified].sort((a, b) => {
    const aTime = Date.parse(String(a.createdAt ?? a.updatedAt ?? ""));
    const bTime = Date.parse(String(b.createdAt ?? b.updatedAt ?? ""));
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return 0;
  });
}
