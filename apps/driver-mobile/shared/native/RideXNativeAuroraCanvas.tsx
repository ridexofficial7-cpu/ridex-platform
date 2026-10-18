import React, { memo } from "react";
import { Platform, StyleProp, UIManager, ViewStyle, requireNativeComponent } from "react-native";

type Props = {
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  drift?: number;
};

let NativeCanvas: React.ComponentType<Props> | null = null;
let nativeAvailable = false;

if (Platform.OS === "android") {
  try {
    nativeAvailable = Boolean(UIManager.getViewManagerConfig?.("RideXAuroraCanvas"));
    if (nativeAvailable) {
      NativeCanvas = requireNativeComponent<Props>("RideXAuroraCanvas");
    }
  } catch {
    nativeAvailable = false;
  }
}

export const RideXNativeAuroraCanvas = memo(function RideXNativeAuroraCanvas(props: Props) {
  if (!nativeAvailable || !NativeCanvas) return null;
  return <NativeCanvas {...props} />;
});
