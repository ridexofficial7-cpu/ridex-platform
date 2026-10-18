import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";

export function Button({
  children,
  variant = "primary",
  loading = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}) {
  return (
    <button
      type={props.type ?? "button"}
      className={`rx-btn rx-btn-${variant}`}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="spin" size={15} /> : null}
      {children}
    </button>
  );
}

export function Card({
  title,
  eyebrow,
  action,
  children,
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const showHeader = Boolean(title || eyebrow || action);

  return (
    <section className="rx-card">
      {showHeader ? (
        <div className="rx-card-head">
          <div>
            {eyebrow ? <div className="rx-eyebrow">{eyebrow}</div> : null}
            {title ? <h3>{title}</h3> : null}
          </div>
          {action}
        </div>
      ) : null}

      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rx-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const v = String(value ?? "UNKNOWN").trim().toLowerCase();
  const k =
    /error|reject|cancel|blocked|failed|denied|unavailable|security.?drift/.test(v)
      ? "danger"
      : /pending|review|warning|loading|degraded|stale|retry|maintenance/.test(v)
        ? "warning"
        : /offline|unknown|not.?known|not.?set|not.?available|not.?ready|^—$|^-$|^n\/a$/.test(v)
          ? "muted"
          : /healthy|online|connected|verified|approved|active|ready|available|completed|success|paid|delivered|normal|received/.test(v)
            ? "success"
            : "muted";

  return <span className={`rx-status ${k}`} aria-label={`Status: ${value || "Unknown"}`}>{value || "Unknown"}</span>;
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  children: ReactNode;
}) {
  return (
    <div className={`rx-notice ${tone}`}>
      <AlertTriangle size={15} />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rx-empty" role="status">
      <Inbox size={21} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function Skeleton({
  width = "100%",
  height = 18,
}: {
  width?: string | number;
  height?: number;
}) {
  return (
    <span
      className="rx-skeleton"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function PixelLoader({
  label = "Loading RideX…",
  variant = "center",
  progress,
  steps,
}: {
  label?: string;
  variant?: "inline" | "center" | "progress";
  progress?: number;
  steps?: { label: string; done?: boolean }[];
}) {
  const safeProgress =
    typeof progress === "number"
      ? Math.max(0, Math.min(100, progress))
      : undefined;

  return (
    <div
      className={`rx-pixel-loader rx-pixel-loader-${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <span className="rx-pixel-star" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>

      <div className="rx-pixel-loader-copy">
        <strong>{label}</strong>

        {safeProgress !== undefined ? (
          <div
            className="rx-pixel-progress"
            aria-label={`Progress ${Math.round(safeProgress)} percent`}
          >
            <span>
              <b style={{ width: `${safeProgress}%` }} />
            </span>
            <small>{Math.round(safeProgress)}%</small>
          </div>
        ) : null}

        {steps?.length ? (
          <div className="rx-pixel-steps">
            {steps.map((step) => (
              <span key={step.label} className={step.done ? "done" : ""}>
                {step.done ? "✓" : "•"} {step.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Toolbar({
  search,
  setSearch,
  onRefresh,
  extra,
}: {
  search: string;
  setSearch: (v: string) => void;
  onRefresh?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="rx-toolbar">
      <label className="rx-search">
        <Search size={15} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter backend response"
        />
      </label>

      <div className="rx-toolbar-actions">
        {extra}

        {onRefresh ? (
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw size={15} />
            Refresh
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function Breadcrumb({
  group,
  page,
}: {
  group: string;
  page: string;
}) {
  return (
    <div className="rx-breadcrumb">
      <span>RideX</span>
      <ChevronRight size={13} />
      <span>{group}</span>
      <ChevronRight size={13} />
      <strong>{page}</strong>
    </div>
  );
}