import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type NoticeKind = 'offline' | 'stale' | 'failure' | 'success' | 'recovery' | 'denied' | 'timeout';

/** Small, accessible, non-blocking state notice for driver P0 journeys. */
export default function ScreenStateNotice({
  kind,
  message,
  actionLabel,
  onAction,
  busy = false,
}: {
  kind: NoticeKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}) {
  const label = kind === 'denied' ? 'Access restricted' : kind === 'timeout' ? 'Request timed out' : kind === 'failure' ? 'Action failed' : kind === 'success' ? 'Action completed' : kind === 'recovery' ? 'Recovery available' : kind === 'offline' ? 'Live connection unavailable' : 'Data may be out of date';
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.notice, kind === 'denied' || kind === 'failure' || kind === 'timeout' ? styles.danger : kind === 'success' ? styles.success : styles.warning]}>
      <Text style={styles.title}>{label}</Text>
      <Text style={styles.body}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} disabled={busy} onPress={onAction} style={[styles.action, busy && styles.disabled]}>
          <Text style={styles.actionText}>{busy ? 'Refreshing…' : actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { marginHorizontal: 12, marginTop: 8, marginBottom: 4, borderRadius: 12, borderWidth: 1, padding: 12, gap: 5 },
  warning: { backgroundColor: '#FFF8E8', borderColor: '#F2D28C' },
  danger: { backgroundColor: '#FFF1F1', borderColor: '#F2B8B8' },
  success: { backgroundColor: '#F1FAF4', borderColor: '#A6D8B8' },
  title: { color: '#273444', fontSize: 12, fontWeight: '900' },
  body: { color: '#465568', fontSize: 12, lineHeight: 17 },
  action: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', borderRadius: 9, paddingHorizontal: 12, backgroundColor: '#202B3C', marginTop: 3 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.5 },
});
