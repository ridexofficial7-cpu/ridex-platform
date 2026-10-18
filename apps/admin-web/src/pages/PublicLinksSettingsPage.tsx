import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the publicLinks Admin module; domain behavior stays centralized in WorkspacePage. */
export function PublicLinksSettingsPage(props: Props) {
  return <WorkspacePage {...props} screen="publicLinks" />;
}
