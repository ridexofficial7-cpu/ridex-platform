import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";
import type { Screen } from "../types";

type AdminAccessScreen = Extract<Screen, "admins" | "roles" | "sessions">;
type Props = Omit<WorkspacePageProps, "screen"> & { screen?: AdminAccessScreen };

/** Dedicated Admin access entry point for accounts, roles/permissions and sessions. */
export function AdminAccessManagementPage({ screen = "admins", ...props }: Props) {
  return <WorkspacePage {...props} screen={screen} />;
}
