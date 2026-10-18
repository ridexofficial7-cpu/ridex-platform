import React, { useCallback, useState } from "react";

import CustomerApp from "./customer/App";
import DriverApp from "./driver/App";
import AdminApp from "./admin/App";
import "./driver/backgroundLocation";

import { DEFAULT_ROLE, type AppRole } from "./navigation/routes";
import { RideXAppShell } from "./shared/ui/RideXPolishKit";

/**
 * RideX Unified App Entry
 *
 * TEST MODE:
 * - CUSTOMER
 * - DRIVER
 * - ADMIN
 *
 * All three roles remain inside the same Android APK.
 * Each role keeps its own authentication/session ownership.
 */
export default function App() {
  const [role, setRole] = useState<AppRole>(DEFAULT_ROLE);

  const openCustomer = useCallback(() => {
    setRole("CUSTOMER");
  }, []);

  const openDriver = useCallback(() => {
    setRole("DRIVER");
  }, []);

  const openAdmin = useCallback(() => {
    setRole("ADMIN");
  }, []);

  return (
    <RideXAppShell>
      {role === "CUSTOMER" ? (
        <CustomerApp onBeDriver={openDriver} onAdminLogin={openAdmin} />
      ) : role === "DRIVER" ? (
        <DriverApp startAt="welcome" onBackToCustomer={openCustomer} />
      ) : role === "ADMIN" ? (
        <AdminApp onBackToCustomer={openCustomer} />
      ) : (
        <CustomerApp onBeDriver={openDriver} onAdminLogin={openAdmin} />
      )}
    </RideXAppShell>
  );
}