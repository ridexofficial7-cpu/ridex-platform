import type { ReactNode } from "react";
import type { AdminContext } from "../types";
import { Notice } from "./ui";

function norm(value: unknown) { return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"); }
/** UI-only fail-closed affordance. The backend must independently enforce every permission. */
export function PermissionGate({ context, module, action, children, fallback }: { context: AdminContext; module: string; action: string; children: ReactNode; fallback?: ReactNode }) {
  const role = String(context.role ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  const explicitSuperAdmin = context.isSuperAdmin === true && ["SUPERADMIN", "SUPER_ADMIN"].includes(role);
  const permissions = Array.isArray(context.permissions) ? context.permissions : [];
  const allowed = explicitSuperAdmin || permissions.some((permission) => norm(permission?.module) === norm(module) && norm(permission?.action) === norm(action));
  if (allowed) return <>{children}</>;
  return <>{fallback ?? <Notice tone="warning">This control is hidden because the current Admin context does not include the required permission. Server-side authorization remains mandatory.</Notice>}</>;
}
