import { PixelLoader } from "./ui";
export function LoadingState({ label = "Loading RideX Admin…", variant = "center" }: { label?: string; variant?: "inline" | "center" | "progress" }) {
  return <PixelLoader label={label} variant={variant}/>;
}
