import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the deliveryHealth Admin module; domain behavior stays centralized in WorkspacePage. */
export function DeliveryHealthPage(props: Props) {
  return <WorkspacePage {...props} screen="deliveryHealth" />;
}
