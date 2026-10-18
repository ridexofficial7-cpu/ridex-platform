import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the drivers Admin module; domain behavior stays centralized in WorkspacePage. */
export function DriverManagementPage(props: Props) {
  return <WorkspacePage {...props} screen="drivers" />;
}
