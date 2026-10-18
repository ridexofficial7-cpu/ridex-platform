import type { Environment } from "../types";
export function EnvironmentBadge({ environment }: { environment: Environment }) {
  const label = environment === "LIVE" ? "LIVE" : "TEST";
  return <span className={`rx-env-pill ${label.toLowerCase()}`} aria-label={`Current configured environment: ${label}`}>{label}</span>;
}
