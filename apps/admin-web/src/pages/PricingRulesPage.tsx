import { WorkspacePage, type WorkspacePageProps } from "./WorkspacePage";

type Props = Omit<WorkspacePageProps, "screen">;

/** Dedicated entry point for the pricing Admin module; domain behavior stays centralized in WorkspacePage. */
export function PricingRulesPage(props: Props) {
  return <WorkspacePage {...props} screen="pricing" />;
}
