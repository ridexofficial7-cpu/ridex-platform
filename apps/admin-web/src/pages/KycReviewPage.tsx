import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the kyc Admin module; domain behavior stays centralized in WorkspacePage. */
export function KycReviewPage(props: Props) {
  return <WorkspacePage {...props} screen="kyc" />;
}
