/**
 * RideX shared event/session contract.
 *
 * Event / Sessional Ride frontend contract.
 * Backend implementation is intentionally isolated behind these paths so the
 * mobile UX does not need to change when the event tables/API are introduced.
 */

export type EventStop = {
  id: string;
  name: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  sequence: number;
};

export type EventSession = {
  id: string;
  startAt: string;
  endAt: string;
  status?: string;
  fare?: number | null;
  capacity?: number | null;
};

export type RideXEventDefinition = {
  id: string;
  title: string;
  description?: string;
  city?: string;
  bannerUrl?: string;
  status?: string;
  serviceType: "EVENT";
  rideType: "CITY_RIDE";
  serviceSubtype: "EVENT_RIDE";
  stops: EventStop[];
  sessions: EventSession[];
};

export const RIDEX_EVENT_API = {
  published: "/events/published",
  booking: "/customer/events/bookings",
  availability: "/booking-options",
} as const;

export const RIDEX_EVENT_SERVICE_TYPE = "EVENT" as const;
export const RIDEX_EVENT_RIDE_TYPE = "EVENT_RIDE" as const;

export function normalizeEventDefinition(value: any): RideXEventDefinition {
  const stopsRaw = Array.isArray(value?.stops)
    ? value.stops
    : Array.isArray(value?.eventStops)
      ? value.eventStops
      : [];
  const sessionsRaw = Array.isArray(value?.sessions)
    ? value.sessions
    : Array.isArray(value?.eventSessions)
      ? value.eventSessions
      : [];

  const stops: EventStop[] = stopsRaw
    .map((stop: any, index: number): EventStop => ({
      id: String(stop?.id ?? stop?.stopId ?? `stop-${index + 1}`),
      name: String(stop?.name ?? stop?.title ?? `Stop ${index + 1}`),
      address: String(stop?.address ?? stop?.location ?? ""),
      latitude: Number.isFinite(Number(stop?.latitude)) ? Number(stop.latitude) : null,
      longitude: Number.isFinite(Number(stop?.longitude)) ? Number(stop.longitude) : null,
      sequence: Number.isFinite(Number(stop?.sequence)) ? Number(stop.sequence) : index + 1,
    }))
    .sort((a: EventStop, b: EventStop) => a.sequence - b.sequence);

  const sessions: EventSession[] = sessionsRaw.map((session: any, index: number): EventSession => ({
    id: String(session?.id ?? `session-${index + 1}`),
    startAt: String(session?.startAt ?? session?.startTime ?? ""),
    endAt: String(session?.endAt ?? session?.endTime ?? ""),
    status: session?.status ? String(session.status) : undefined,
    fare: Number.isFinite(Number(session?.fare)) ? Number(session.fare) : null,
    capacity: Number.isFinite(Number(session?.capacity)) ? Number(session.capacity) : null,
  }));

  return {
    id: String(value?.id ?? value?.eventId ?? ""),
    title: String(value?.title ?? value?.name ?? "RideX Event"),
    description: value?.description ? String(value.description) : undefined,
    city: value?.city ? String(value.city) : undefined,
    bannerUrl: value?.bannerUrl ? String(value.bannerUrl) : undefined,
    status: value?.status ? String(value.status) : undefined,
    serviceType: "EVENT",
    rideType: "CITY_RIDE",
    serviceSubtype: "EVENT_RIDE",
    stops,
    sessions,
  };
}

export function localEventPreview(): RideXEventDefinition[] {
  return [
    {
      id: "preview-city-festival",
      title: "City Festival Shuttle",
      description: "Frontend preview for the Admin-published Event / Sessional Ride flow.",
      city: "Preview City",
      status: "PUBLISHED_PREVIEW",
      serviceType: "EVENT",
      rideType: "CITY_RIDE",
      serviceSubtype: "EVENT_RIDE",
      stops: [
        "Central Gate",
        "Market Circle",
        "City Hall",
        "Stadium Road",
        "Lake View",
        "Expo Grounds",
      ].map((name, index): EventStop => ({
        id: `preview-stop-${index + 1}`,
        name,
        address: `Event route stop ${index + 1}`,
        latitude: 25.58 + index * 0.007,
        longitude: 85.14 + index * 0.009,
        sequence: index + 1,
      })),
      sessions: [
        {
          id: "preview-session-1",
          startAt: "2026-09-20T08:00:00+05:30",
          endAt: "2026-09-20T22:00:00+05:30",
          status: "OPEN",
          fare: 30,
          capacity: 4,
        },
      ],
    },
  ];
}
