import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

export type RideXPixelLoaderVariant = 'screen' | 'card' | 'inline' | 'button';

export type RideXPixelLoaderProps = {
  label?: string;
  subtitle?: string;
  variant?: RideXPixelLoaderVariant;
  progress?: number;
  step?: number;
  totalSteps?: number;
  testID?: string;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((value) => {
      if (active) setReduced(Boolean(value));
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      setReduced(Boolean(value));
    });
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);
  return reduced;
}

function PixelTrail({ phase, compact }: { phase: Animated.Value; compact: boolean }) {
  const translateX = phase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: compact ? [-2, 2, -2] : [-5, 5, -5],
  });
  const opacity = phase.interpolate({
    inputRange: [0, 0.35, 0.7, 1],
    outputRange: [0.45, 1, 0.62, 0.45],
  });

  return (
    <Animated.View style={[styles.pixelTrail, { opacity, transform: [{ translateX }] }]}>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <View key={index} style={[styles.pixel, compact && styles.pixelCompact, { opacity: 0.42 + index * 0.09 }]} />
      ))}
    </Animated.View>
  );
}

export default function RideXPixelLoader({
  label = 'Loading RideX…',
  subtitle = 'Please wait',
  variant = 'card',
  progress,
  step,
  totalSteps,
  testID,
}: RideXPixelLoaderProps) {
  const phase = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      phase.stopAnimation();
      phase.setValue(0.5);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(phase, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(phase, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, reducedMotion]);

  const normalizedProgress = useMemo(() => {
    if (typeof progress !== 'number' || !Number.isFinite(progress)) return null;
    return clamp01(progress);
  }, [progress]);

  const compact = variant === 'inline' || variant === 'button';
  const screen = variant === 'screen';
  const button = variant === 'button';

  const starScale = phase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.88, 1.08, 0.88],
  });
  const starOpacity = phase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.72, 1, 0.72],
  });

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}${subtitle ? ` ${subtitle}` : ''}`}
      style={[styles.root, screen && styles.rootScreen, compact && styles.rootCompact, button && styles.rootButton]}
    >
      <View style={[styles.card, screen && styles.cardScreen, compact && styles.cardCompact, button && styles.cardButton]}>
        <View style={styles.visualRow}>
          <Animated.Text
            accessible={false}
            style={[styles.star, compact && styles.starCompact, { opacity: starOpacity, transform: [{ scale: starScale }] }]}
          >
            ✦
          </Animated.Text>
          <PixelTrail phase={phase} compact={compact} />
        </View>

        {!button ? <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text> : null}
        {!button && subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        {normalizedProgress !== null ? (
          <View style={styles.progressTrack} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 1, now: normalizedProgress }}>
            <View style={[styles.progressFill, { width: `${Math.round(normalizedProgress * 100)}%` }]} />
          </View>
        ) : null}

        {!button && typeof step === 'number' && typeof totalSteps === 'number' && totalSteps > 0 ? (
          <Text style={styles.stepText}>Step {Math.max(1, Math.min(totalSteps, Math.round(step)))} of {totalSteps}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function RideXInlinePixelLoader({ label = 'Loading…' }: { label?: string }) {
  return <RideXPixelLoader label={label} variant="inline" />;
}

export function RideXButtonPixelLoader() {
  return <RideXPixelLoader label="Loading" variant="button" />;
}

const styles = StyleSheet.create({
  root: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  rootScreen: { flex: 1, padding: 22 },
  rootCompact: { width: 'auto' },
  rootButton: { width: 34, minWidth: 34 },
  card: {
    width: '100%', maxWidth: 330, borderRadius: 22, borderWidth: 1, borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF', paddingHorizontal: 22, paddingVertical: 20, alignItems: 'center',
    shadowColor: '#111111', shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  cardScreen: { maxWidth: 350, paddingVertical: 28 },
  cardCompact: { borderWidth: 0, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 7, shadowOpacity: 0, elevation: 0 },
  cardButton: { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: 'transparent', borderWidth: 0 },
  visualRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  star: { fontSize: 40, lineHeight: 44, fontWeight: '900', color: '#E10600', marginRight: 8 },
  starCompact: { fontSize: 24, lineHeight: 28, marginRight: 5 },
  pixelTrail: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pixel: { width: 6, height: 6, backgroundColor: '#E10600' },
  pixelCompact: { width: 5, height: 5 },
  label: { marginTop: 10, color: '#111111', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  labelCompact: { marginTop: 4, fontSize: 12 },
  subtitle: { marginTop: 4, color: '#667085', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  progressTrack: { width: '100%', height: 5, marginTop: 13, borderRadius: 999, backgroundColor: '#F1F3F5', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#E10600', borderRadius: 999 },
  stepText: { marginTop: 6, color: '#667085', fontSize: 9, fontWeight: '800' },
});
