import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the scopeAssignments Admin module; domain behavior stays centralized in WorkspacePage. */
export function AdminScopeAssignmentPage(props: Props) {
  return <WorkspacePage {...props} screen="scopeAssignments" />;
}
