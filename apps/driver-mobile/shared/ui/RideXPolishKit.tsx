import React, { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getRideXApiUrl } from '../api/client';
import RideXPixelLoader from './RideXPixelLoader';
const COLORS = { red: '#E31B23', redDark: '#B3121A', black: '#111111', muted: '#667085', border: '#E4E7EC', background: '#F7F8FA', white: '#FFFFFF', softRed: '#FFF2F3', amber: '#B45309', softAmber: '#FFF8E8' };
const SPACING = { md: 14, xl: 24 };

export type ConnectivityState = 'checking' | 'online' | 'offline';

export function useReducedMotion(): boolean {
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

async function checkBackend(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${getRideXApiUrl()}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'X-RideX-Client': 'mobile-polish-health' },
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function RideXOfflineBanner({ enabled = true }: { enabled?: boolean }) {
  const [state, setState] = useState<ConnectivityState>('checking');
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => {
      if (!enabled) return;
      const ok = await checkBackend();
      if (active) setState(ok ? 'online' : 'offline');
    };
    void refresh();
    timer = setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [enabled]);

  if (!enabled || state !== 'offline') return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={styles.offlineBanner}
    >
      <View style={styles.offlineDot} />
      <Text style={styles.offlineText}>RideX is offline. Requests will retry when the backend is reachable.</Text>
      {!reducedMotion ? <ActivityIndicator size="small" color={COLORS.amber} /> : null}
    </View>
  );
}

export function RideXSkeleton({ width = '100%', height = 18, radius = 10 }: { width?: number | `${number}%` | 'auto'; height?: number; radius?: number }) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.55);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.92, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);
  return <Animated.View style={[styles.skeleton, { width, height, borderRadius: radius, opacity }]} />;
}

export function RideXLoadingState({ label = 'Loading RideX…' }: { label?: string }) {
  return <RideXPixelLoader label={label} subtitle="Please wait" variant="screen" />;
}

export function RideXErrorState({ title = 'RideX could not open this screen', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorState} accessibilityRole="alert">
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message || 'A temporary problem occurred. Your saved account and backend-authoritative data remain unchanged.'}</Text>
      {onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={onRetry} style={styles.errorButton}><Text style={styles.errorButtonText}>Retry</Text></Pressable> : null}
    </View>
  );
}

export function RideXEmptyState({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.emptyState} accessibilityRole="text">
      <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>–</Text></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={styles.emptyButton}><Text style={styles.emptyButtonText}>{actionLabel}</Text></Pressable> : null}
    </View>
  );
}

export function RideXConfirmDialog({ visible, title, message, confirmLabel = 'Confirm', destructive = false, onConfirm, onCancel }: { visible: boolean; title: string; message: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!visible) return null;
  return (
    <View style={styles.dialogOverlay} accessibilityViewIsModal>
      <View style={styles.dialogCard}>
        <Text style={styles.dialogTitle}>{title}</Text>
        <Text style={styles.dialogMessage}>{message}</Text>
        <View style={styles.dialogActions}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.dialogCancel}><Text style={styles.dialogCancelText}>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onConfirm} style={[styles.dialogConfirm, destructive && styles.dialogDanger]}><Text style={styles.dialogConfirmText}>{confirmLabel}</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

class RideXErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('RIDEX_MOBILE_UI_ERROR', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <RideXErrorState title="RideX needs to recover" message={this.state.error.message} onRetry={() => this.setState({ error: null })} />;
  }
}

export function RideXAppShell({ children }: { children: ReactNode }) {
  const top = Platform.OS === 'android' ? 6 : 0;
  return (
    <View style={styles.shell}>
      <View pointerEvents="box-none" style={[styles.bannerHost, { top }]}><RideXOfflineBanner /></View>
      <RideXErrorBoundary>{children}</RideXErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: COLORS.background },
  bannerHost: { position: 'absolute', left: 8, right: 8, zIndex: 2000 },
  offlineBanner: { minHeight: 42, borderRadius: 14, backgroundColor: COLORS.softAmber, borderWidth: 1, borderColor: '#F4DFB1', paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#111', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  offlineDot: { width: 8, height: 8, borderRadius: 8, backgroundColor: COLORS.amber },
  offlineText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#7A4D00', fontWeight: '800' },
  skeleton: { backgroundColor: '#E9EDF2' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, backgroundColor: COLORS.background, padding: SPACING.xl },
  loadingLogo: { flexDirection: 'row', alignItems: 'baseline' },
  loadingRide: { fontSize: 32, fontWeight: '900', color: COLORS.black, letterSpacing: -1.2 },
  loadingX: { fontSize: 32, fontWeight: '900', color: COLORS.red, letterSpacing: -1.2 },
  loadingText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, backgroundColor: COLORS.background },
  errorTitle: { fontSize: 21, lineHeight: 27, color: COLORS.black, fontWeight: '900', textAlign: 'center' },
  errorMessage: { marginTop: 8, maxWidth: 340, fontSize: 13, lineHeight: 19, color: COLORS.muted, textAlign: 'center' },
  errorButton: { minHeight: 46, minWidth: 120, marginTop: 16, borderRadius: 13, backgroundColor: COLORS.red, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  errorButtonText: { color: COLORS.white, fontWeight: '900', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 18, gap: 7 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.softRed, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFD6DA' },
  emptyIconText: { color: COLORS.red, fontSize: 27, fontWeight: '900' },
  emptyTitle: { marginTop: 3, color: COLORS.black, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyMessage: { maxWidth: 320, color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  emptyButton: { minHeight: 44, marginTop: 8, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.4, borderColor: COLORS.red, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  emptyButtonText: { color: COLORS.red, fontWeight: '900', fontSize: 13 },
  dialogOverlay: { ...StyleSheet.absoluteFill, zIndex: 3000, backgroundColor: 'rgba(15,23,42,.42)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  dialogCard: { width: '100%', maxWidth: 410, borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border, padding: 20, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  dialogTitle: { color: COLORS.black, fontSize: 18, fontWeight: '900' },
  dialogMessage: { marginTop: 7, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  dialogActions: { marginTop: 18, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  dialogCancel: { minHeight: 44, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },
  dialogCancelText: { color: COLORS.black, fontWeight: '800' },
  dialogConfirm: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: COLORS.red, justifyContent: 'center', alignItems: 'center' },
  dialogDanger: { backgroundColor: COLORS.redDark },
  dialogConfirmText: { color: COLORS.white, fontWeight: '900' },
});
