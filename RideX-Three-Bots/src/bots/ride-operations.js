/**
 * Bot 2 — Ride Operations.
 * Produces a recommendation only. Booking/driver assignment writes remain owned
 * by the authoritative RideX Backend API and are disabled in this starter.
 */
const finite = (value) => Number.isFinite(Number(value));

export class RideOperationsBot {
  constructor({ mode = "dry-run" } = {}) {
    this.mode = mode === "dry-run" ? "dry-run" : "guarded";
    this.writesEnabled = false;
  }

  validateLocation(location) {
    if (!location || typeof location !== "object") return { valid: false, reason: "LOCATION_MISSING" };
    if (!finite(location.latitude) || !finite(location.longitude)) return { valid: false, reason: "LOCATION_INVALID" };
    const lat = Number(location.latitude), lon = Number(location.longitude);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { valid: false, reason: "LOCATION_OUT_OF_RANGE" };
    return { valid: true, latitude: lat, longitude: lon };
  }

  planAssignment({ bookingId, serviceType, pickup, candidates }) {
    if (!String(bookingId || "").trim()) return { ok: false, reason: "BOOKING_ID_REQUIRED", mode: this.mode };
    const checkedLocation = this.validateLocation(pickup);
    if (!checkedLocation.valid) return { ok: false, reason: checkedLocation.reason, mode: this.mode };
    if (!Array.isArray(candidates)) return { ok: false, reason: "CANDIDATES_MUST_BE_ARRAY", mode: this.mode };

    const eligible = candidates.filter((driver) =>
      driver && driver.isOnline === true &&
      driver.isApproved === true &&
      driver.isAvailable === true &&
      (!Array.isArray(driver.serviceTypes) || driver.serviceTypes.includes(serviceType)) &&
      this.validateLocation(driver.location).valid
    );

    // The caller must obtain candidates from an authorized Backend endpoint.
    // This basic starter ranks by straight-line distance; production matching
    // should use the approved backend routing/eligibility policy.
    const distanceKm = (a, b) => {
      const rad = (x) => x * Math.PI / 180;
      const dLat = rad(b.latitude - a.latitude);
      const dLon = rad(b.longitude - a.longitude);
      const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    };

    const ranked = eligible.map((driver) => ({
      driverId: String(driver.driverId || ""),
      distanceKm: Number(distanceKm(checkedLocation, driver.location).toFixed(3))
    })).filter((x) => x.driverId).sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      ok: true,
      mode: this.mode,
      action: "RECOMMEND_ONLY",
      writesEnabled: false,
      bookingId: String(bookingId),
      serviceType: String(serviceType || ""),
      eligibleCount: ranked.length,
      recommendation: ranked[0] || null,
      candidates: ranked,
      note: "No assignment was written. Confirm eligibility and commit through the authoritative Backend API."
    };
  }

  status() {
    return { name: "ride-operations", mode: this.mode, writesEnabled: false };
  }
}
