import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, ShieldCheck, AlertTriangle, CircleCheck, CircleX } from "lucide-react";
import type { WorkspacePageProps } from "./WorkspacePage";
import { request } from "../lib/api";
import { RIDEX_API } from "../lib/apiContract";

type BotStatusItem = {
  name?: string;
  status?: string;
  mode?: string;
  [key: string]: unknown;
};

type StatusResponse = {
  ok?: boolean;
  bots?: BotStatusItem[];
  [key: string]: unknown;
};

type EventsResponse = {
  ok?: boolean;
  events?: Array<{ at?: string; type?: string; target?: string; message?: string; [key: string]: unknown }>;
};

type CheckResponse = {
  ok?: boolean;
  status?: string;
  results?: Array<{ name?: string; status?: string; statusCode?: number; error?: string }>;
  message?: string;
};

type Props = Omit<WorkspacePageProps, "screen">;

function readable(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "Not reported";
}

export function BotMonitorPage({ context }: Props) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [events, setEvents] = useState<EventsResponse["events"]>([]);
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statusResult, eventsResult] = await Promise.all([
        request<StatusResponse>(RIDEX_API.admin.botStatus),
        request<EventsResponse>(RIDEX_API.admin.botEvents),
      ]);
      setStatus(statusResult);
      setEvents(Array.isArray(eventsResult.events) ? eventsResult.events : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Bot Monitor data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setError("");
    try {
      const result = await request<CheckResponse>(RIDEX_API.admin.botCheck, { method: "POST" });
      setCheck(result);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check could not be completed.");
    } finally {
      setChecking(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const superAdmin = context.isSuperAdmin === true ||
    ["SUPER_ADMIN", "SUPERADMIN"].includes(String(context.role || "").toUpperCase().replace(/[\s-]+/g, "_"));

  return (
    <section className="space-y-6 rx-platform-workspace">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Platform / Super Admin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Bot Monitor</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Inspect the three RideX helper bots and run bounded health checks. Bot actions remain recommendation-only unless an explicitly authorized backend control exists.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" onClick={() => void runCheck()} disabled={checking || !superAdmin} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            <Activity size={16} /> {checking ? "Checkingâ€¦" : "Run health check"}
          </button>
        </div>
      </header>

      {!superAdmin && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldCheck size={18} /> This screen is restricted to Super Admin. Backend authorization remains authoritative.
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle size={18} /> <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {(status?.bots || []).map((bot, index) => (
          <article key={`${readable(bot.name)}-${index}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900">{readable(bot.name)}</h2>
              <Activity size={18} className="text-slate-500" />
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Reported status</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{readable(bot.status || bot.mode)}</p>
            <dl className="mt-3 space-y-2 text-sm">
              {Object.entries(bot).filter(([key]) => !["name", "status", "mode"].includes(key)).slice(0, 5).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3 border-t border-slate-100 pt-2">
                  <dt className="text-slate-500">{key.replace(/([A-Z])/g, " $1")}</dt>
                  <dd className="max-w-[60%] break-words text-right text-slate-700">{typeof value === "object" ? JSON.stringify(value) : readable(value)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
        {!status?.bots?.length && (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600 md:col-span-3">
            {loading ? "Loading bot statusâ€¦" : "No bot status data is available yet. Use Refresh after the bot service and backend are running."}
          </div>
        )}
      </div>

      {check && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Latest health check</h2>
          <p className="mt-1 text-sm text-slate-600">Overall result: <strong>{readable(check.status || (check.ok ? "OK" : "DEGRADED"))}</strong></p>
          <div className="mt-3 space-y-2">
            {(check.results || []).map((item, index) => (
              <div key={`${item.name || "target"}-${index}`} className="flex items-start gap-2 text-sm">
                {String(item.status || "").toUpperCase() === "PASS" || String(item.status || "").toUpperCase() === "HEALTHY"
                  ? <CircleCheck size={17} className="mt-0.5 text-emerald-600" />
                  : <CircleX size={17} className="mt-0.5 text-rose-600" />}
                <span><strong>{readable(item.name)}</strong>: {readable(item.status)}{item.statusCode ? ` (HTTP ${item.statusCode})` : ""}{item.error ? ` â€” ${item.error}` : ""}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Recent monitor events</h2>
          <span className="text-xs text-slate-500">{events?.length || 0} shown</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Target</th><th className="py-2">Details</th></tr></thead>
            <tbody>
              {(events || []).map((event, index) => (
                <tr key={`${event.at || "event"}-${index}`} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-3 whitespace-nowrap text-slate-500">{readable(event.at)}</td>
                  <td className="py-3 pr-3 font-medium text-slate-800">{readable(event.type)}</td>
                  <td className="py-3 pr-3 text-slate-600">{readable(event.target)}</td>
                  <td className="py-3 text-slate-600">{readable(event.message)}</td>
                </tr>
              ))}
              {!events?.length && <tr><td colSpan={4} className="py-5 text-slate-500">{loading ? "Loading eventsâ€¦" : "No monitor events recorded yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Start/stop and add-bot controls are intentionally not shown yet: the current bot service does not expose authenticated lifecycle-management endpoints. They will remain unavailable until backend authorization, audit and lifecycle controls are implemented.
      </p>
    </section>
  );
}
