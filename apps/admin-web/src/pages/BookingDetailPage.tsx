import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the rides Admin module; domain behavior stays centralized in WorkspacePage. */
export function BookingDetailPage(props: Props) {
  return <WorkspacePage {...props} screen="rides" />;
}
