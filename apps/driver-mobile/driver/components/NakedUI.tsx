import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS, SPACING } from '../theme';

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function PageScroll({ children }: { children: React.ReactNode }) {
  return <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{children}</ScrollView>;
}

export function BrandHeader({ title = 'RideX Driver', onBack, right }: { title?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Text style={styles.backText}>‹</Text></Pressable> : null}
        <Text style={styles.brand}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Logo() {
  return <View style={styles.logo}><Text style={styles.logoText}>Ride<Text style={styles.logoX}>X</Text></Text></View>;
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.titleWrap}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}

export function Card({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'softRed' | 'softGreen' | 'softAmber' | 'softBlue' }) {
  return <View style={[styles.card, tone === 'softRed' && styles.softRed, tone === 'softGreen' && styles.softGreen, tone === 'softAmber' && styles.softAmber, tone === 'softBlue' && styles.softBlue]}>{children}</View>;
}

export function Metric({ label, value = '—' }: { label: string; value?: string | number }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

export function PrimaryButton({ title, onPress, disabled }: { title: string; onPress?: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primary, pressed && !disabled && styles.pressed, disabled && styles.disabled]}><Text style={styles.primaryText}>{title}</Text></Pressable>;
}

export function OutlineButton({ title, onPress, disabled }: { title: string; onPress?: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.outline, pressed && !disabled && styles.pressed, disabled && styles.disabledOutline]}><Text style={styles.outlineText}>{title}</Text></Pressable>;
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, autoCorrect, maxLength }: { label: string; value?: string; onChangeText?: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; keyboardType?: any; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; autoCorrect?: boolean; maxLength?: number }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#98A2B3" secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} maxLength={maxLength} style={styles.input} /></View>;
}

export function StatusPill({ label, kind = 'neutral' }: { label: string; kind?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const color = kind === 'success' ? COLORS.green : kind === 'warning' ? COLORS.amber : kind === 'danger' ? COLORS.red : COLORS.muted;
  const bg = kind === 'success' ? COLORS.softGreen : kind === 'warning' ? COLORS.softAmber : kind === 'danger' ? COLORS.softRed : '#F2F4F7';
  return <View accessible accessibilityRole="text" accessibilityLabel={label} style={[styles.pill, { backgroundColor: bg }]}><View style={[styles.pillDot, { backgroundColor: color }]} /><Text style={[styles.pillText, { color }]}>{label}</Text></View>;
}

export function Section({ title, action }: { title: string; action?: React.ReactNode }) {
  return <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text>{action}</View>;
}

export function EmptyState({ title, body, icon = '—' }: { title: string; body: string; icon?: string }) {
  return <Card><View style={styles.empty}><Text style={styles.emptyIcon}>{icon}</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View></Card>;
}

export function Hero({ title, subtitle, image }: { title: string; subtitle: string; image?: any }) {
  return <Card><View style={styles.hero}><Logo/><Text style={styles.heroTitle}>{title}</Text><Text style={styles.heroSubtitle}>{subtitle}</Text>{image ? <Image source={image} resizeMode="contain" style={styles.heroImage} /> : <View style={styles.heroPlaceholder}><Text style={styles.heroPlaceholderText}>Driver workspace</Text></View>}</View></Card>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.lg, paddingBottom: 36, gap: SPACING.md },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { fontSize: 18, fontWeight: '900', color: COLORS.black },
  back: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, lineHeight: 28, color: COLORS.black },
  logo: { alignSelf: 'center' },
  logoText: { fontSize: 28, fontWeight: '900', color: COLORS.black, letterSpacing: -1 },
  logoX: { color: COLORS.red },
  titleWrap: { gap: 5 },
  title: { fontSize: 28, fontWeight: '900', color: COLORS.black, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.muted, lineHeight: 20 },
  card: { backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg },
  softRed: { backgroundColor: COLORS.softRed, borderColor: '#FFD6DA' },
  softGreen: { backgroundColor: COLORS.softGreen, borderColor: '#D8F0E0' },
  softAmber: { backgroundColor: COLORS.softAmber, borderColor: '#F4DFB1' },
  softBlue: { backgroundColor: COLORS.softBlue, borderColor: '#D8E7FF' },
  metric: { flex: 1, minWidth: 92, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12 },
  metricLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '700' },
  metricValue: { marginTop: 5, fontSize: 16, color: COLORS.black, fontWeight: '900' },
  primary: { minHeight: 48, borderRadius: 14, backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 8 },
  primaryText: { color: COLORS.white, fontSize: 15, fontWeight: '900' },
  outline: { minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.red, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 8 },
  outlineText: { color: COLORS.red, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  disabledOutline: { opacity: 0.45 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.995 }] },
  field: { gap: 7, marginTop: 8 },
  fieldLabel: { fontSize: 12, color: COLORS.text, fontWeight: '800' },
  input: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, backgroundColor: COLORS.white, paddingHorizontal: 14, fontSize: 15, color: COLORS.black },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, gap: 6 },
  pillDot: { width: 7, height: 7, borderRadius: 99 },
  pillText: { fontSize: 11, fontWeight: '900' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: COLORS.black },
  empty: { alignItems: 'center', paddingVertical: 18, gap: 7 },
  emptyIcon: { fontSize: 28, fontWeight: '900', color: COLORS.red },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: COLORS.black },
  emptyBody: { fontSize: 13, color: COLORS.muted, lineHeight: 19, textAlign: 'center', maxWidth: 320 },
  hero: { alignItems: 'center', gap: 10 },
  heroTitle: { marginTop: 5, fontSize: 28, fontWeight: '900', color: COLORS.black, textAlign: 'center' },
  heroSubtitle: { fontSize: 14, lineHeight: 21, color: COLORS.muted, textAlign: 'center' },
  heroImage: { width: '100%', height: 180, marginTop: 8 },
  heroPlaceholder: { width: '100%', height: 130, borderRadius: 16, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  heroPlaceholderText: { color: COLORS.muted, fontWeight: '700' },
});
