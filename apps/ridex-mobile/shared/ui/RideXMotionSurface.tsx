import React, { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useReducedMotion } from "./RideXPolishKit";
import { RideXNativeAuroraCanvas } from "../native/RideXNativeAuroraCanvas";

type Coordinate = { latitude: number; longitude: number };

type Props = {
  height?: number;
  intensity?: number;
  showNativeCanvas?: boolean;
  driftScore?: number;
  label?: string;
  badgeLabel?: string;
  compact?: boolean;
  muted?: boolean;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** Deterministic, non-AI route-drift metric for visual guidance. */
export function computeRouteDriftScore(input: {
  plannedDistanceKm?: number;
  actualDistanceKm?: number;
  plannedEtaMinutes?: number;
  actualEtaMinutes?: number;
  lateralOffsetMeters?: number;
}) {
  const plannedDistance = Math.max(0.1, Math.abs(Number(input.plannedDistanceKm ?? 0.1)));
  const actualDistance = Math.max(0, Math.abs(Number(input.actualDistanceKm ?? plannedDistance)));
  const plannedEta = Math.max(1, Math.abs(Number(input.plannedEtaMinutes ?? 1)));
  const actualEta = Math.max(1, Math.abs(Number(input.actualEtaMinutes ?? plannedEta)));

  const distanceDrift = Math.min(1, Math.abs(actualDistance - plannedDistance) / plannedDistance);
  const etaDrift = Math.min(1, Math.abs(actualEta - plannedEta) / plannedEta);
  const lateralDrift = Math.min(1, Math.max(0, Number(input.lateralOffsetMeters ?? 0)) / 250);

  return clamp01(distanceDrift * 0.35 + etaDrift * 0.35 + lateralDrift * 0.30);
}

/** Haversine distance in kilometres. Deterministic and device-local. */
export function haversineDistanceKm(a?: Coordinate | null, b?: Coordinate | null) {
  if (!a || !b) return 0;
  if (![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)) return 0;

  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const root = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const arc = 2 * Math.atan2(Math.sqrt(root), Math.sqrt(Math.max(0, 1 - root)));
  return 6371 * arc;
}

/**
 * Derives a deterministic route-alignment score from current position to target.
 * It is a visual/diagnostic metric, not a replacement for backend routing.
 */
export function computeCoordinateDriftScore(input: {
  current?: Coordinate | null;
  target?: Coordinate | null;
  plannedDistanceKm?: number;
  plannedEtaMinutes?: number;
}) {
  if (!input.current || !input.target) return 0;
  const actualDistanceKm = haversineDistanceKm(input.current, input.target);
  if (!actualDistanceKm) return 0;

  const plannedDistanceKm = Math.max(0.1, Number(input.plannedDistanceKm ?? actualDistanceKm));
  const plannedEtaMinutes = Math.max(1, Number(input.plannedEtaMinutes ?? 1));
  const baselineKmh = Math.max(10, (plannedDistanceKm / plannedEtaMinutes) * 60);
  const derivedEtaMinutes = Math.max(1, (actualDistanceKm / baselineKmh) * 60);

  return computeRouteDriftScore({
    plannedDistanceKm,
    actualDistanceKm,
    plannedEtaMinutes,
    actualEtaMinutes: derivedEtaMinutes,
  });
}

/** Deterministic operational freshness drift used by Admin live monitoring. */
export function computeOperationalDriftScore(lastEventAt?: string | null, expectedSeconds = 45) {
  if (!lastEventAt) return 0.5;
  const timestamp = new Date(lastEventAt).getTime();
  if (!Number.isFinite(timestamp)) return 0.5;
  const elapsedSeconds = Math.max(0, (Date.now() - timestamp) / 1000);
  return clamp01(elapsedSeconds / Math.max(5, expectedSeconds));
}

export const RideXDriftBadge = memo(function RideXDriftBadge({ score = 0, label = "ROUTE ALIGN" }: { score?: number; label?: string }) {
  const alignment = Math.round((1 - clamp01(score)) * 100);
  const state = alignment >= 85 ? "OPTIMAL" : alignment >= 65 ? "WATCH" : "DRIFT";
  return (
    <View style={styles.badge}>
      <View style={styles.badgeMain}>
        <Text style={styles.badgeValue}>{alignment}%</Text>
        <Text style={styles.badgeLabel}>{label}</Text>
      </View>
      <View style={styles.badgeStateWrap}>
        <View style={[styles.badgeDot, state === "DRIFT" && styles.badgeDotDrift]} />
        <Text style={styles.badgeState}>{state}</Text>
      </View>
    </View>
  );
});

function RideXMotionSurface({
  height = 180,
  intensity = 1,
  showNativeCanvas = true,
  driftScore = 0,
  label,
  badgeLabel,
  compact = false,
  muted = false,
}: Props) {
  const phase = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      phase.stopAnimation();
      phase.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: compact ? 12000 : 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [compact, phase, reducedMotion]);

  const drift = clamp01(driftScore);
  const effectiveIntensity = muted ? intensity * 0.55 : intensity;
  const glowScale = useMemo(() => 1 + drift * 0.08, [drift]);

  const translateX = phase.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] });
  const translateY = phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [4, -7, 4] });
  const rotate = phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["-2deg", "2deg", "-2deg"] });

  const nativeCanvasAvailable = Platform.OS === "android" && showNativeCanvas;

  return (
    <View style={[styles.root, { height, borderRadius: compact ? 18 : 24 }]} pointerEvents="none">
      {nativeCanvasAvailable && !reducedMotion ? (
        <RideXNativeAuroraCanvas
          style={StyleSheet.absoluteFill}
          intensity={effectiveIntensity}
          drift={drift}
        />
      ) : null}

      <Animated.View
        style={[
          styles.layer,
          {
            transform: [{ translateX }, { translateY }, { rotate }, { scale: glowScale }],
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 420 180" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="ridexAurora" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#59C4FF" stopOpacity={muted ? 0.10 : 0.18} />
              <Stop offset="52%" stopColor="#5EF0C1" stopOpacity={muted ? 0.08 : 0.16} />
              <Stop offset="100%" stopColor="#B06FFF" stopOpacity={muted ? 0.06 : 0.13} />
            </LinearGradient>
          </Defs>
          <Path d="M-10 110 C70 30 135 160 220 75 C290 8 345 90 430 38 L430 190 L-10 190 Z" fill="url(#ridexAurora)" />
          <Path d="M-10 132 C55 60 135 175 215 96 C285 27 350 125 430 68 L430 190 L-10 190 Z" fill="rgba(94,240,193,0.10)" />
          <Path d="M-10 152 C75 86 125 176 226 117 C295 77 355 140 430 96 L430 190 L-10 190 Z" fill="rgba(176,111,255,0.09)" />
          <Circle cx="328" cy="44" r="34" fill="rgba(255,255,255,0.06)" />
          <Circle cx="92" cy="54" r="22" fill="rgba(255,255,255,0.05)" />
        </Svg>
      </Animated.View>

      <View style={[styles.vignette, { opacity: 0.10 + drift * 0.10 }]} />
      {label ? (
        <View style={styles.labelWrap}>
          <Text style={styles.surfaceLabel}>{label}</Text>
          <RideXDriftBadge score={drift} label={badgeLabel || (compact ? "ALIGN" : "ROUTE ALIGN")} />
        </View>
      ) : null}
    </View>
  );
}

export default memo(RideXMotionSurface);

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    backgroundColor: "#0D1728",
    marginVertical: 8,
  },
  layer: { ...StyleSheet.absoluteFill },
  vignette: { ...StyleSheet.absoluteFill, backgroundColor: "#050A12" },
  labelWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  surfaceLabel: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "rgba(5,12,24,0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  badgeMain: { alignItems: "flex-end", marginRight: 8 },
  badgeValue: { color: "#fff", fontSize: 13, fontWeight: "900" },
  badgeLabel: { color: "#A7B9D0", fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  badgeStateWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
  badgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#5BE6BD" },
  badgeDotDrift: { backgroundColor: "#FF8A74" },
  badgeState: { color: "#D9E5F5", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
});
