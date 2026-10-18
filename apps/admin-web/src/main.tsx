import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AdminErrorBoundary, BackendRequestStatus, OfflineBanner } from "./components/SystemStatus";
import { LanguageProvider } from "./lib/i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <AdminErrorBoundary>
        <OfflineBanner />
        <BackendRequestStatus />
        <App />
      </AdminErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
);
