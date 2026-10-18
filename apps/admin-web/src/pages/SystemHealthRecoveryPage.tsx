import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the backup Admin module; domain behavior stays centralized in WorkspacePage. */
export function SystemHealthRecoveryPage(props: Props) {
  return <WorkspacePage {...props} screen="backup" />;
}
