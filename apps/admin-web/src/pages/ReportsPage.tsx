import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the reports Admin module; domain behavior stays centralized in WorkspacePage. */
export function ReportsPage(props: Props) {
  return <WorkspacePage {...props} screen="reports" />;
}
