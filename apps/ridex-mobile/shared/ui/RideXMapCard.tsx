import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, Polyline, type Region } from 'react-native-maps';

type Point = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
};

type Props = {
  title?: string;
  points: Point[];
  routeCoordinates?: Array<{ latitude: number; longitude: number }>;
  height?: number;
  onPointPress?: (point: Point) => void;
  focusId?: string;
};

const FALLBACK_REGION: Region = {
  latitude: 25.5941,
  longitude: 85.1376,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

function validPoint(point: Point): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

export default function RideXMapCard({
  title = 'Map',
  points,
  routeCoordinates = [],
  height = 230,
  onPointPress,
  focusId,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const usable = useMemo(() => points.filter(validPoint), [points]);
  const line = useMemo(() => routeCoordinates.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)), [routeCoordinates]);

  useEffect(() => {
    const target = usable.find((p) => p.id === focusId) ?? usable[0];
    if (!target || !mapRef.current) return;
    const region = {
      latitude: target.latitude,
      longitude: target.longitude,
      latitudeDelta: usable.length > 1 ? 0.03 : 0.012,
      longitudeDelta: usable.length > 1 ? 0.03 : 0.012,
    };
    mapRef.current.animateToRegion(region, 350);
  }, [focusId, usable]);

  const initialRegion = usable[0]
    ? { latitude: usable[0].latitude, longitude: usable[0].longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 }
    : FALLBACK_REGION;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={() => mapRef.current?.animateToRegion(initialRegion, 300)} accessibilityRole="button">
          <Text style={styles.reset}>Recenter</Text>
        </Pressable>
      </View>
      <MapView
        ref={(node) => { mapRef.current = node; }}
        style={{ height }}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsCompass
        toolbarEnabled={false}
        loadingEnabled
      >
        {line.length >= 2 ? <Polyline coordinates={line} strokeWidth={4} /> : null}
        {usable.map((point) => (
          <Marker
            key={point.id}
            coordinate={{ latitude: point.latitude, longitude: point.longitude }}
            title={point.title}
            description={point.subtitle}
            onPress={() => { setSelectedId(point.id); onPointPress?.(point); }}
          >
            <Callout onPress={() => onPointPress?.(point)}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{point.title}</Text>
                {point.subtitle ? <Text style={styles.calloutSub}>{point.subtitle}</Text> : null}
                <Text style={styles.calloutAction}>Tap to open details</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
      {selectedId ? (
        <View style={styles.selection}>
          <Text style={styles.selectionText}>Selected: {usable.find((p) => p.id === selectedId)?.title ?? 'Location'}</Text>
          <Pressable onPress={() => setSelectedId(null)}><Text style={styles.dismiss}>Close</Text></Pressable>
        </View>
      ) : null}
      {!usable.length ? <View style={styles.overlay}><Text style={styles.overlayTitle}>Location unavailable</Text><Text style={styles.overlaySub}>The map is ready; a backend coordinate is required to place a marker.</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#E4E7EC', backgroundColor: '#FFF' },
  header: { minHeight: 46, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '900', color: '#101828' },
  reset: { fontSize: 12, fontWeight: '900', color: '#B3121A' },
  callout: { minWidth: 170, maxWidth: 250, padding: 7 },
  calloutTitle: { fontSize: 14, fontWeight: '900', color: '#101828' },
  calloutSub: { marginTop: 3, fontSize: 12, color: '#667085' },
  calloutAction: { marginTop: 6, fontSize: 11, fontWeight: '900', color: '#B3121A' },
  selection: { position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.96)', borderWidth: 1, borderColor: '#E4E7EC', padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectionText: { flex: 1, fontSize: 12, fontWeight: '800', color: '#101828' },
  dismiss: { fontSize: 11, fontWeight: '900', color: '#B3121A' },
  overlay: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: 10 },
  overlayTitle: { fontSize: 13, fontWeight: '900', color: '#101828' },
  overlaySub: { marginTop: 3, fontSize: 11, color: '#667085' },
});
