import type { AdminContext } from "../types";
export function ScopeBadge({ context }: { context: Pick<AdminContext, "adminLevel" | "stateName" | "cityName"> }) {
  const level = String(context.adminLevel || "UNKNOWN").toUpperCase();
  const suffix = level === "CITY" ? context.cityName : level === "STATE" ? context.stateName : null;
  return <span className="rx-scope-badge" aria-label={`Admin geographic scope: ${level}${suffix ? `, ${suffix}` : ""}`}>{level}{suffix ? ` · ${suffix}` : ""}</span>;
}
