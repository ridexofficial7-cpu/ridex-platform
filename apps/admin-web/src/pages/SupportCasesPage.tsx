import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the support Admin module; domain behavior stays centralized in WorkspacePage. */
export function SupportCasesPage(props: Props) {
  return <WorkspacePage {...props} screen="support" />;
}
