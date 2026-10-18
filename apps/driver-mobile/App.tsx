import React from "react";
import "./driver/backgroundLocation";
import DriverApp from "./driver/App";
import { RideXAppShell } from "./shared/ui/RideXPolishKit";
import { RideXMobileLocaleProvider } from "./shared/localization";

/** Independent Driver TEST build target; background-location task registration is scoped here. */
export default function App() {
  return (
    <RideXMobileLocaleProvider>
      <RideXAppShell>
        <DriverApp startAt="welcome" />
      </RideXAppShell>
    </RideXMobileLocaleProvider>
  );
}
