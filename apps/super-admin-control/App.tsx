import React from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { RideXLanguageToggle, RideXMobileLocaleProvider, useRideXLocale } from './shared/localization';

/**
 * RideX Super Admin Control — structural TEST shell only.
 * No privileged action, private key or remote control command is exposed here.
 * Real unlock/device trust/revocation flows require the approved security contract.
 */
export default function App() {
  return <RideXMobileLocaleProvider><SuperAdminControlShell /></RideXMobileLocaleProvider>;
}

function SuperAdminControlShell() {
  const { t } = useRideXLocale();
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.contentScroll}>
        <View style={styles.content}>
          <RideXLanguageToggle style={{ alignSelf: 'flex-end', marginBottom: 16 }} />
          <Text style={styles.eyebrow}>RIDEX · SUPER ADMIN</Text>
          <Text accessibilityRole="header" style={styles.title}>Super Admin Control</Text>
          <Text style={styles.status}>Secure provisioning required</Text>
          <Text style={styles.body}>{t('common.chooseLanguage')}</Text>
          <Text style={styles.body}>
            Control actions are disabled in this structural TEST shell. Device trust,
            authentication, key lifecycle and privileged-action APIs must be approved
            and verified before operational controls are enabled.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F7FA" },
  contentScroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  content: { width: "100%", maxWidth: 520, alignSelf: "center", padding: 24, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE3EB" },
  eyebrow: { color: "#46617C", fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginBottom: 12 },
  title: { color: "#172B3A", fontSize: 28, fontWeight: "700", marginBottom: 16 },
  status: { color: "#895B00", fontSize: 15, fontWeight: "700", marginBottom: 12 },
  body: { color: "#405466", fontSize: 15, lineHeight: 23 },
});
