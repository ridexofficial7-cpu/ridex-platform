import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the audit Admin module; domain behavior stays centralized in WorkspacePage. */
export function AuditHistoryPage(props: Props) {
  return <WorkspacePage {...props} screen="audit" />;
}
