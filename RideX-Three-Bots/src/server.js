import http from "node:http";
import { URL } from "node:url";
import { RequestControlBot } from "./bots/request-control.js";
import { RideOperationsBot } from "./bots/ride-operations.js";
import { ProjectMonitorBot } from "./bots/project-monitor.js";

const port = parseInt(process.env.PORT || "4600", 10);
const requestBot = new RequestControlBot({
  windowMs: Number(process.env.REQUEST_WINDOW_MS || 60_000),
  maxRequests: Number(process.env.REQUEST_MAX_PER_WINDOW || 120)
});
const targets = [
  { name: "backend", url: process.env.BACKEND_HEALTH_URL || "http://127.0.0.1:4000/health" },
  { name: "broadcaster-provider", url: process.env.PROVIDER_HEALTH_URL || "http://127.0.0.1:4100/health" }
];
const monitorBot = new ProjectMonitorBot({
  targets,
  timeoutMs: Number(process.env.HEALTH_TIMEOUT_MS || 2500)
});
const rideBot = new RideOperationsBot({ mode: process.env.BOT_MODE || "dry-run" });

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url || "/", "http://127.0.0.1");
  const limit = requestBot.checkLimit(req.socket.remoteAddress || "unknown");
  if (!limit.allowed) {
    res.setHeader("retry-after", String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))));
    return send(res, 429, { ok: false, error: "BOT_REQUEST_LIMIT_EXCEEDED" });
  }

  if (req.method === "GET" && parsed.pathname === "/health") {
    return send(res, 200, { ok: true, service: "ridex-three-bots", mode: process.env.BOT_MODE || "dry-run" });
  }
  if (req.method === "GET" && parsed.pathname === "/bots/status") {
    return send(res, 200, {
      ok: true,
      bots: [requestBot.status(), rideBot.status(), monitorBot.status()]
    });
  }
  if (req.method === "POST" && parsed.pathname === "/monitor/check") {
    const result = await monitorBot.runCheck();
    return send(res, result.status === "HEALTHY" ? 200 : 503, { ok: result.status === "HEALTHY", ...result });
  }
  if (req.method === "GET" && parsed.pathname === "/monitor/events") {
    return send(res, 200, { ok: true, events: monitorBot.status().recentEvents });
  }
  if (req.method === "POST" && parsed.pathname === "/ride/plan-assignment") {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 64 * 1024) return send(res, 413, { ok: false, error: "BODY_TOO_LARGE" });
    }
    try {
      const input = JSON.parse(raw || "{}");
      return send(res, 200, rideBot.planAssignment(input));
    } catch {
      return send(res, 400, { ok: false, error: "INVALID_JSON" });
    }
  }
  return send(res, 404, { ok: false, error: "NOT_FOUND" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`RideX three-bot service listening on 127.0.0.1:${port}`);
  console.log("Safe mode: no backend mutations; driver assignment is recommendation-only.");
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
