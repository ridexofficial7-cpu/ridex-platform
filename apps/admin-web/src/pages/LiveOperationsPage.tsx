import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the live Admin module; domain behavior stays centralized in WorkspacePage. */
export function LiveOperationsPage(props: Props) {
  return <WorkspacePage {...props} screen="live" />;
}
