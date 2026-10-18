export type RideType = "CITY_RIDE" | "SHARING_RIDE" | "INTERCITY_RIDE";
export type ServiceType = "PASSENGER" | "PARCEL" | "GOODS" | "EVENT";

/** Canonical service/vehicle mapping. Backend remains authoritative for eligibility and booking validation. */
export const RIDEX_SERVICE_TAXONOMY = {
  passengerCountRequired: { CITY_RIDE: false, SHARING_RIDE: true, INTERCITY_RIDE: true, EVENT_RIDE: true },
  requiredVehicleAttributes: {
    EVENT: ["operationalVehicleType", "speed", "seating"],
    PARCEL: ["operationalVehicleType", "speed", "range", "payload"],
    GOODS: ["operationalVehicleType", "speed", "range", "payload"],
  },
  serviceVehicleCategories: {
    PASSENGER: ["PASSENGER_E_RICKSHAW", "PASSENGER_ELECTRIC_AUTO"],
    PARCEL: ["CARGO_DELIVERY"],
    GOODS: ["CARGO_DELIVERY"],
    EVENT: ["PASSENGER_E_RICKSHAW", "PASSENGER_ELECTRIC_AUTO"],
  },
  passengerVehicleCategories: ["PASSENGER_E_RICKSHAW", "PASSENGER_ELECTRIC_AUTO"],
  parcelServiceSubtypes: ["CITY_LOGISTIC_PARCEL", "QUICK_LOGISTIC_PARCEL"],
  event: { availabilityRideType: "EVENT_RIDE", persistedRideType: "CITY_RIDE", serviceSubtype: "EVENT_RIDE" },
} as const;

export type VehicleCatalogEntry = {
  code: string;
  categoryCode: string;
  categoryName: string;
  name: string;
  vehicleClass?: string;
  vehicleSubClass?: string;
  operationalVehicleType: "E_RICKSHAW" | "PICKUP_TRUCK";
  typeDescription?: string;
  speed?: string;
  seating?: string | null;
  payload?: string | null;
  range?: string | null;
  useCases?: string[];
  goodsEligible: boolean;
  defaultCapacity: number;
  eligibleRideTypes: string[];
  sortOrder?: number;
};

export function flattenVehicleCatalog(payload: any): VehicleCatalogEntry[] {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.categories)
      ? payload.categories.flatMap((category: any) => Array.isArray(category?.vehicles) ? category.vehicles : [])
      : [];
  return rows.filter((row: any) => row && typeof row.code === "string") as VehicleCatalogEntry[];
}

export function rideTypeLabel(rideType: RideType): string {
  switch (rideType) {
    case "CITY_RIDE": return "Full Ride";
    case "SHARING_RIDE": return "Share Ride";
    case "INTERCITY_RIDE": return "Connection Ride";
  }
}

export function eligiblePassengerVehicles(catalog: VehicleCatalogEntry[], rideType: RideType) {
  return catalog
    .filter((vehicle) => (RIDEX_SERVICE_TAXONOMY.passengerVehicleCategories as readonly string[]).includes(vehicle.categoryCode))
    .filter((vehicle) => vehicle.eligibleRideTypes.includes(rideType))
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
}

export function eligibleEventVehicles(catalog: VehicleCatalogEntry[]) {
  return catalog
    .filter((vehicle) =>
      (RIDEX_SERVICE_TAXONOMY.passengerVehicleCategories as readonly string[]).includes(vehicle.categoryCode),
    )
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
}

export function eligibleLogisticVehicles(catalog: VehicleCatalogEntry[], service: "PARCEL" | "GOODS") {
  const token = service === "PARCEL" ? "LOGISTIC_PARCEL" : "LOGISTIC_GOODS";
  return catalog
    .filter((vehicle) => (RIDEX_SERVICE_TAXONOMY.serviceVehicleCategories[service] as readonly string[]).includes(vehicle.categoryCode))
    .filter((vehicle) => vehicle.eligibleRideTypes.includes(token) && vehicle.goodsEligible === true)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
}

export function maxPassengerCount(vehicle?: VehicleCatalogEntry | null) {
  return Math.max(1, Number(vehicle?.defaultCapacity ?? 1));
}
