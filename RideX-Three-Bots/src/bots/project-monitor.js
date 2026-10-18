/**
 * Bot 3 — Project Monitor.
 * Performs bounded HTTP health probes and keeps a small in-memory event history.
 */
export class ProjectMonitorBot {
  constructor({ targets = [], timeoutMs = 2500, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
    this.targets = targets.filter((t) => t && t.name && t.url);
    this.timeoutMs = Math.max(250, Number(timeoutMs) || 2500);
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.events = [];
    this.lastResults = [];
  }

  record(event) {
    this.events.unshift({ at: this.now().toISOString(), ...event });
    this.events = this.events.slice(0, 200);
  }

  async checkTarget(target) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(target.url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
        redirect: "error"
      });
      const result = {
        name: target.name,
        url: target.url,
        status: response.ok ? "PASS" : "FAIL",
        httpStatus: response.status
      };
      if (!response.ok) this.record({ level: "error", component: target.name, code: "HEALTH_HTTP_FAILURE", httpStatus: response.status });
      return result;
    } catch (error) {
      const result = {
        name: target.name,
        url: target.url,
        status: "FAIL",
        error: error?.name === "AbortError" ? "HEALTH_TIMEOUT" : "HEALTH_UNREACHABLE"
      };
      this.record({ level: "error", component: target.name, code: result.error, message: String(error?.message || error).slice(0, 240) });
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async runCheck() {
    this.lastResults = await Promise.all(this.targets.map((target) => this.checkTarget(target)));
    this.record({
      level: this.lastResults.some((r) => r.status === "FAIL") ? "warning" : "info",
      component: "project-monitor",
      code: "HEALTH_CHECK_COMPLETE",
      failedTargets: this.lastResults.filter((r) => r.status === "FAIL").length,
      checkedTargets: this.lastResults.length
    });
    return { status: this.lastResults.some((r) => r.status === "FAIL") ? "DEGRADED" : "HEALTHY", results: this.lastResults };
  }

  status() {
    return {
      name: "project-monitor",
      targetsConfigured: this.targets.length,
      lastResults: this.lastResults,
      recentEvents: this.events.slice(0, 30)
    };
  }
}
