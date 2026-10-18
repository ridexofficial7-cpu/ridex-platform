import test from "node:test";
import assert from "node:assert/strict";
import { ProjectMonitorBot } from "../src/bots/project-monitor.js";

test("project monitor reports a passing health endpoint", async () => {
  const bot = new ProjectMonitorBot({
    targets: [{ name: "backend", url: "http://example.invalid/health" }],
    fetchImpl: async () => ({ ok: true, status: 200 }),
    now: () => new Date("2026-01-01T00:00:00.000Z")
  });
  const result = await bot.runCheck();
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.results[0].status, "PASS");
});

test("project monitor records failed endpoint evidence", async () => {
  const bot = new ProjectMonitorBot({
    targets: [{ name: "provider", url: "http://example.invalid/health" }],
    fetchImpl: async () => { throw new Error("connection refused"); }
  });
  const result = await bot.runCheck();
  assert.equal(result.status, "DEGRADED");
  assert.equal(bot.status().recentEvents.some((e) => e.code === "HEALTH_UNREACHABLE"), true);
});
