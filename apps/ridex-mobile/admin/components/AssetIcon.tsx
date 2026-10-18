import React from "react";
import { Text } from "react-native";
import type { AdminIconName } from "../shared/theme";

const FALLBACKS: Record<AdminIconName, string> = {
  dashboard: "▥",
  live: "⌖",
  customers: "♙",
  drivers: "D",
  vehicle: "▣",
  kyc: "✓",
  bookings: "▤",
  finance: "₹",
  payments: "₹",
  matching: "⇄",
  events: "▦",
  promotions: "%",
  pricing: "₹",
  zones: "⌖",
  route: "➜",
  reports: "▥",
  safety: "🛡",
  sos: "🆘",
  notifications: "◉",
  support: "?",
  admins: "A",
  roles: "R",
  audit: "✓",
  settings: "⚙",
  platform: "⇄",
  "test-data": "T",
  back: "‹",
  refresh: "↻",
  search: "⌕",
  check: "✓",
  chevron_right: "›",
};

type AssetIconProps = {
  name: string;
  size?: number;
  tintColor?: string;
  fallbackColor?: string;
};

export default function AssetIcon({
  name,
  size = 22,
  tintColor,
  fallbackColor,
}: AssetIconProps) {
  const normalizedName = ({
    vehicles: "vehicle",
    "matching-config": "matching",
    location: "live",
    clock: "refresh",
  } as Record<string, string>)[name] ?? name;

  return (
    <Text
      accessibilityRole="image"
      accessibilityLabel={`${name} icon`}
      style={{
        width: size,
        height: size,
        textAlign: "center",
        textAlignVertical: "center",
        fontSize: size * 0.78,
        fontWeight: "900",
        color: tintColor ?? fallbackColor,
      }}
    >
      {FALLBACKS[normalizedName as AdminIconName] ?? "•"}
    </Text>
  );
}
