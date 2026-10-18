import type { Screen } from "../types";
import type { WorkspacePageProps } from "./WorkspacePage";
import { WorkspacePage } from "./WorkspacePage";
import { LiveOperationsPage } from "./LiveOperationsPage";
import { BookingDetailPage } from "./BookingDetailPage";
import { DriverManagementPage } from "./DriverManagementPage";
import { KycReviewPage } from "./KycReviewPage";
import { CustomerManagementPage } from "./CustomerManagementPage";
import { ServiceConfigurationPage } from "./ServiceConfigurationPage";
import { PricingRulesPage } from "./PricingRulesPage";
import { AdminScopeAssignmentPage } from "./AdminScopeAssignmentPage";
import { OtpConfigurationPage } from "./OtpConfigurationPage";
import { AuditHistoryPage } from "./AuditHistoryPage";
import { DeliveryHealthPage } from "./DeliveryHealthPage";
import { ReportsPage } from "./ReportsPage";
import { SystemHealthRecoveryPage } from "./SystemHealthRecoveryPage";
import { SupportCasesPage } from "./SupportCasesPage";
import { PublicLinksSettingsPage } from "./PublicLinksSettingsPage";
import { AdminAccessManagementPage } from "./AdminAccessManagementPage";
import { BotMonitorPage } from "./BotMonitorPage";

export type AdminModulePageProps = WorkspacePageProps;

/** Routes to explicit Admin module entry points; backend contracts and write guards remain centralized. */
export function AdminModulePage({ screen, ...props }: AdminModulePageProps) {
  switch (screen) {
    case "live": return <LiveOperationsPage {...props} />;
    case "rides": return <BookingDetailPage {...props} />;
    case "drivers": return <DriverManagementPage {...props} />;
    case "kyc": return <KycReviewPage {...props} />;
    case "customers": return <CustomerManagementPage {...props} />;
    case "services": return <ServiceConfigurationPage {...props} />;
    case "pricing": return <PricingRulesPage {...props} />;
    case "scopeAssignments": return <AdminScopeAssignmentPage {...props} />;
    case "otp": return <OtpConfigurationPage {...props} />;
    case "audit": return <AuditHistoryPage {...props} />;
    case "deliveryHealth": return <DeliveryHealthPage {...props} />;
    case "reports": return <ReportsPage {...props} />;
    case "backup": return <SystemHealthRecoveryPage {...props} />;
    case "botMonitor": return <BotMonitorPage {...props} />;
    case "support": return <SupportCasesPage {...props} />;
    case "publicLinks": return <PublicLinksSettingsPage {...props} />;
    case "admins": case "roles": case "sessions": return <AdminAccessManagementPage {...props} screen={screen as Extract<Screen, "admins" | "roles" | "sessions">} />;
    default: return <WorkspacePage {...props} screen={screen} />;
  }
}

