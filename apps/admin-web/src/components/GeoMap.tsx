import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LocateFixed, MapPinned, Minus, Navigation, Plus, RotateCcw } from "lucide-react";

type GeoPoint = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  kind?: string;
  raw?: Record<string, unknown>;
};

type MapSize = { width: number; height: number };

const DEFAULT_CENTER = { lat: 25.0961, lng: 85.3131 };
const MIN_ZOOM = 9;
const MAX_ZOOM = 16;
const DEFAULT_ZOOM = 12;
const SINGLE_POINT_ZOOM = 14;
const TILE_SIZE = 256;
const FIT_PADDING_RATIO = 0.72;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function latToY(lat: number, zoom: number) {
  const sin = clamp(Math.sin((lat * Math.PI) / 180), -0.9999, 0.9999);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * 2 ** zoom;
}

function lonToX(lng: number, zoom: number) {
  return ((lng + 180) / 360) * 2 ** zoom;
}

function yToLat(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function xToLng(x: number, zoom: number) {
  return (x / 2 ** zoom) * 360 - 180;
}

function pointFromObject(obj: Record<string, unknown>, path: string): GeoPoint | null {
  const nested = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  const pickup = nested(obj.pickup);
  const destination = nested(obj.destination);
  const center = nested(obj.center);
  const start = nested(obj.start);
  const end = nested(obj.end);

  const lat = Number(
    obj.latitude ??
      obj.lat ??
      obj.centerLat ??
      obj.pickupLat ??
      obj.destinationLat ??
      obj.startLat ??
      obj.endLat ??
      pickup?.latitude ??
      pickup?.lat ??
      destination?.latitude ??
      destination?.lat ??
      center?.latitude ??
      center?.lat ??
      start?.latitude ??
      start?.lat ??
      end?.latitude ??
      end?.lat,
  );

  const lng = Number(
    obj.longitude ??
      obj.lng ??
      obj.centerLng ??
      obj.pickupLng ??
      obj.destinationLng ??
      obj.startLng ??
      obj.endLng ??
      pickup?.longitude ??
      pickup?.lng ??
      destination?.longitude ??
      destination?.lng ??
      center?.longitude ??
      center?.lng ??
      start?.longitude ??
      start?.lng ??
      end?.longitude ??
      end?.lng,
  );

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }

  return {
    id: String(obj.id ?? path),
    lat,
    lng,
    label: String(
      obj.name ??
        obj.fullName ??
        obj.title ??
        obj.label ??
        obj.address ??
        obj.driverName ??
        obj.customerName ??
        "",
    ),
    kind: String(
      obj.type ?? obj.category ?? obj.serviceType ?? obj.status ?? "Point",
    ),
    raw: obj,
  };
}

export function extractGeoPoints(value: unknown): GeoPoint[] {
  const found: GeoPoint[] = [];
  const visited = new WeakSet<object>();

  function walk(node: unknown, path: string, depth: number) {
    if (depth > 6 || node == null) return;

    if (Array.isArray(node)) {
      node
        .slice(0, 300)
        .forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }

    if (typeof node !== "object") return;

    const obj = node as Record<string, unknown>;
    if (visited.has(obj)) return;
    visited.add(obj);

    const point = pointFromObject(obj, path);
    if (point) found.push(point);

    Object.entries(obj).forEach(([key, child]) =>
      walk(child, path ? `${path}.${key}` : key, depth + 1),
    );
  }

  walk(value, "root", 0);

  const unique = new Map<string, GeoPoint>();
  found.forEach((point) =>
    unique.set(
      `${point.lat.toFixed(6)}:${point.lng.toFixed(6)}:${point.label}:${point.kind}`,
      point,
    ),
  );

  return Array.from(unique.values()).slice(0, 120);
}

function getBounds(points: GeoPoint[]) {
  if (!points.length) {
    return {
      minLat: DEFAULT_CENTER.lat,
      maxLat: DEFAULT_CENTER.lat,
      minLng: DEFAULT_CENTER.lng,
      maxLng: DEFAULT_CENTER.lng,
    };
  }

  return points.reduce(
    (bounds, point) => ({
      minLat: Math.min(bounds.minLat, point.lat),
      maxLat: Math.max(bounds.maxLat, point.lat),
      minLng: Math.min(bounds.minLng, point.lng),
      maxLng: Math.max(bounds.maxLng, point.lng),
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLng: points[0].lng,
      maxLng: points[0].lng,
    },
  );
}

function getFitView(points: GeoPoint[], size: MapSize) {
  if (!points.length) {
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  }

  const bounds = getBounds(points);
  const center = {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };

  if (points.length === 1 || (bounds.minLat === bounds.maxLat && bounds.minLng === bounds.maxLng)) {
    return { center, zoom: SINGLE_POINT_ZOOM };
  }

  const targetWidth = Math.max(220, size.width * FIT_PADDING_RATIO);
  const targetHeight = Math.max(180, size.height * FIT_PADDING_RATIO);

  let bestZoom = MIN_ZOOM;
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const worldWidth = (lonToX(bounds.maxLng, zoom) - lonToX(bounds.minLng, zoom)) * TILE_SIZE;
    const worldHeight = Math.abs(latToY(bounds.maxLat, zoom) - latToY(bounds.minLat, zoom)) * TILE_SIZE;
    if (worldWidth <= targetWidth && worldHeight <= targetHeight) {
      bestZoom = zoom;
      break;
    }
  }

  return { center, zoom: bestZoom };
}

export function GeoMap({
  data,
  title = "Operational Map",
  height = 360,
}: {
  data: unknown;
  title?: string;
  height?: number;
}) {
  const points = useMemo(() => extractGeoPoints(data), [data]);
  const [mapSize, setMapSize] = useState<MapSize>({ width: 960, height });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [selected, setSelected] = useState<GeoPoint | null>(null);
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    cx: number;
    cy: number;
  } | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  const fitView = useMemo(() => getFitView(points, mapSize), [points, mapSize]);
  const pointSignature = useMemo(
    () =>
      points
        .map((point) => `${point.lat.toFixed(6)}:${point.lng.toFixed(6)}:${point.label}`)
        .join("|"),
    [points],
  );
  const lastPointSignature = useRef("");

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;

    const updateSize = () => {
      const width = Math.max(280, Math.round(node.clientWidth));
      setMapSize({ width, height });
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateSize);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [height]);

  useEffect(() => {
    if (pointSignature === lastPointSignature.current) return;
    lastPointSignature.current = pointSignature;
    setCenter(fitView.center);
    setZoom(fitView.zoom);
    setSelected(null);
  }, [fitView.center, fitView.zoom, pointSignature]);

  const centerX = lonToX(center.lng, zoom);
  const centerY = latToY(center.lat, zoom);

  const project = (point: GeoPoint) => ({
    left: mapSize.width / 2 + (lonToX(point.lng, zoom) - centerX) * TILE_SIZE,
    top: height / 2 + (latToY(point.lat, zoom) - centerY) * TILE_SIZE,
  });

  const reset = () => {
    setZoom(fitView.zoom);
    setCenter(fitView.center);
    setSelected(null);
  };

  const recenter = () => {
    setCenter(selected ? { lat: selected.lat, lng: selected.lng } : fitView.center);
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!mapRef.current) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ x: event.clientX, y: event.clientY, cx: centerX, cy: centerY });
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag) return;
    const dx = (event.clientX - drag.x) / TILE_SIZE;
    const dy = (event.clientY - drag.y) / TILE_SIZE;
    const newX = drag.cx - dx;
    const newY = drag.cy - dy;
    setCenter({ lat: yToLat(newY, zoom), lng: xToLng(newX, zoom) });
  };

  const onPointerUp = () => setDrag(null);

  return (
    <section className="rx-card rx-map-card">
      <div className="rx-card-head">
        <div>
          <div className="rx-eyebrow">MAP • TOUCH / CLICK</div>
          <h3>{title}</h3>
        </div>
        <span className="rx-map-count">
          <MapPinned size={14} />
          {points.length ? `${points.length} plotted` : "Awaiting coordinates"}
        </span>
      </div>

      <div
        ref={mapRef}
        className={`rx-map-canvas ${drag ? "dragging" : ""}`}
        style={{ height, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="rx-map-inner rx-coordinate-grid"
          style={{ width: mapSize.width, height, left: 0, top: 0 }}
        >

          {points.map((point, index) => {
            const position = project(point);
            return (
              <button
                type="button"
                key={`${point.id}-${index}`}
                className={`rx-map-marker ${selected?.id === point.id ? "selected" : ""}`}
                style={{ left: position.left, top: position.top }}
                title={point.label || `Point ${index + 1}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelected(point);
                  setCenter({ lat: point.lat, lng: point.lng });
                }}
              >
                <Navigation size={15} />
                <span>{point.label || `Point ${index + 1}`}</span>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="rx-map-popover" onPointerDown={(event) => event.stopPropagation()}>
            <div className="rx-map-popover-head">
              <div>
                <strong>{selected.label || "Selected location"}</strong>
                <small>{selected.kind}</small>
              </div>
              <button
                type="button"
                className="rx-map-popover-close"
                aria-label="Close selected location"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <div className="rx-map-popover-grid">
              <span>
                Latitude
                <strong>{selected.lat.toFixed(6)}</strong>
              </span>
              <span>
                Longitude
                <strong>{selected.lng.toFixed(6)}</strong>
              </span>
            </div>
            <button
              type="button"
              className="rx-btn rx-btn-secondary rx-map-popover-action"
              onClick={recenter}
            >
              Center on selected
            </button>
          </div>
        ) : null}

        <div className="rx-map-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => setZoom((value) => clamp(value + 1, MIN_ZOOM, MAX_ZOOM))}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => setZoom((value) => clamp(value - 1, MIN_ZOOM, MAX_ZOOM))}
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            title="Center"
            aria-label="Center map"
            onClick={recenter}
          >
            <LocateFixed size={15} />
          </button>
          <button
            type="button"
            title="Fit all points"
            aria-label="Fit all points"
            onClick={reset}
          >
            <RotateCcw size={15} />
          </button>
        </div>

        <div className="rx-map-overlay">
          <span>Coordinate schematic • Drag to pan • Click a marker</span>
          <span>
            {center.lat.toFixed(5)}, {center.lng.toFixed(5)} • z{zoom}
          </span>
        </div>

        {!points.length ? (
          <div className="rx-map-empty">
            <MapPinned size={24} />
            <strong>Map is ready</strong>
            <span>Backend coordinates will appear here when available.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
