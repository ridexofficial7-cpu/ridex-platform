import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the otp Admin module; domain behavior stays centralized in WorkspacePage. */
export function OtpConfigurationPage(props: Props) {
  return <WorkspacePage {...props} screen="otp" />;
}
