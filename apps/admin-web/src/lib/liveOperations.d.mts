export interface LiveOperationalBooking {
  id?: string;
  bookingId?: string;
  rideId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export const LIVE_OPERATIONAL_STATUSES: readonly [
  "MATCHING",
  "DRIVER_ASSIGNED",
  "DRIVER_ARRIVING",
  "DRIVER_ARRIVED",
  "STARTED",
  "IN_PROGRESS",
  "AT_RISK"
];

export declare function normalizeLiveOperationalBookings(result: unknown): Record<string, unknown>[];
