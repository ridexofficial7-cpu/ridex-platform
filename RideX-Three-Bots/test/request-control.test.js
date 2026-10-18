import test from "node:test";
import assert from "node:assert/strict";
import { RequestControlBot } from "../src/bots/request-control.js";

test("request control enforces a bounded per-client window", () => {
  let now = 1000;
  const bot = new RequestControlBot({ windowMs: 5000, maxRequests: 2, now: () => now });
  assert.equal(bot.checkLimit("client").allowed, true);
  assert.equal(bot.checkLimit("client").allowed, true);
  assert.equal(bot.checkLimit("client").allowed, false);
  now += 5001;
  assert.equal(bot.checkLimit("client").allowed, true);
});

test("identical safe GET work is coalesced only while in flight", async () => {
  const bot = new RequestControlBot();
  let calls = 0;
  let release;
  const work = () => { calls++; return new Promise((resolve) => { release = resolve; }); };
  const a = bot.coalesceSafeGet("identity:/health", work);
  const b = bot.coalesceSafeGet("identity:/health", work);
  await Promise.resolve();
  assert.equal(calls, 1);
  release({ ok: true });
  assert.deepEqual(await a, { ok: true });
  assert.deepEqual(await b, { ok: true });
  assert.equal(bot.status().activeCoalescedGets, 0);
});
