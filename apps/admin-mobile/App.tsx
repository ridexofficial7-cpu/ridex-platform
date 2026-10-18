import React from "react";
import AdminApp from "./admin/App";
import { RideXAppShell } from "./shared/ui/RideXPolishKit";
import { RideXMobileLocaleProvider } from "./shared/localization";

/** Independent Admin TEST build target; backend remains the authorization authority. */
export default function App() {
  return (
    <RideXMobileLocaleProvider>
      <RideXAppShell>
        <AdminApp />
      </RideXAppShell>
    </RideXMobileLocaleProvider>
  );
}
