import React from "react";
import CustomerApp from "./customer/App";
import { RideXAppShell } from "./shared/ui/RideXPolishKit";
import { RideXMobileLocaleProvider } from "./shared/localization";

/** Independent Customer TEST build target. No Driver/Admin role switch. */
export default function App() {
  return (
    <RideXMobileLocaleProvider>
      <RideXAppShell>
        <CustomerApp />
      </RideXAppShell>
    </RideXMobileLocaleProvider>
  );
}
