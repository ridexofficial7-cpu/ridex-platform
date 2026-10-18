import { storage } from "./storage";
import { RIDEX_API } from "./apiContract";
import { APP_VERSION_HEADER } from "./runtimeConfig";
import { getApiBaseUrl } from "./environmentSelection";
import { getAcceptLanguageHeader } from "./languagePreference";

export type RealtimeStatus = "connecting" | "connected" | "offline";
export type RealtimeEvent = { type: string; data: unknown; id?: string };
export type RealtimeHandler = (event: RealtimeEvent) => void;

const INITIAL_RECONNECT_MS = 2000;
const MAX_RECONNECT_MS = 30000;

export class RealtimeClient {
  private controller: AbortController | null = null;
  private lastEventId = "";
  private stopped = true;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private connecting = false;
  private readonly seenEventIds = new Set<string>();
  private readonly handleOnline = () => {
    if (!this.stopped) {
      this.clearReconnectTimer();
      void this.connect();
    }
  };
  private readonly handleVisibility = () => {
    if (!this.stopped && document.visibilityState === "visible") void this.connect();
  };

  constructor(
    private actorType: "ADMIN" | "CUSTOMER" | "DRIVER",
    private actorId: string,
    private onStatus: (status: RealtimeStatus) => void,
    private onEvent: RealtimeHandler,
  ) {}

  start() {
    this.stopped = false;
    this.reconnectAttempt = 0;
    window.addEventListener("online", this.handleOnline);
    document.addEventListener("visibilitychange", this.handleVisibility);
    void this.connect();
  }

  stop() {
    this.stopped = true;
    this.connecting = false;
    this.controller?.abort();
    this.controller = null;
    this.clearReconnectTimer();
    window.removeEventListener("online", this.handleOnline);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.onStatus("offline");
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer !== null) return;
    const exponential = Math.min(MAX_RECONNECT_MS, INITIAL_RECONNECT_MS * 2 ** Math.min(this.reconnectAttempt, 4));
    const jitter = Math.floor(exponential * 0.15 * ((this.reconnectAttempt % 3) / 2));
    const delay = Math.min(MAX_RECONNECT_MS, exponential + jitter);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async connect() {
    if (this.stopped || this.connecting || !storage.token) return;
    this.connecting = true;
    this.clearReconnectTimer();
    this.onStatus("connecting");
    this.controller = new AbortController();
    try {
      const headers = new Headers({
        Accept: "text/event-stream",
        "Accept-Language": getAcceptLanguageHeader(),
        Authorization: `Bearer ${storage.token}`,
        "X-Device-Id": storage.deviceId,
        "X-App-Version": APP_VERSION_HEADER,
        "X-Request-Id": (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : `ridex-realtime-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });
      if (this.lastEventId) headers.set("Last-Event-ID", this.lastEventId);
      const query = new URLSearchParams({ actorType: this.actorType, actorId: this.actorId });
      const response = await fetch(`${getApiBaseUrl()}${RIDEX_API.realtime}?${query.toString()}`, {
        headers,
        signal: this.controller.signal,
        cache: "no-store",
      });
      if (response.status === 401) {
        storage.token = "";
        window.dispatchEvent(new CustomEvent("ridex-admin-auth-expired"));
        return;
      }
      if (response.status === 403) {
        this.onStatus("offline");
        return;
      }
      if (!response.ok || !response.body) throw new Error(`Realtime stream unavailable (${response.status})`);
      this.reconnectAttempt = 0;
      this.onStatus("connected");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!this.stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) this.parseFrame(frame);
      }
      if (!this.stopped) {
        this.onStatus("offline");
        this.scheduleReconnect();
      }
    } catch {
      if (!this.stopped) {
        this.onStatus("offline");
        this.scheduleReconnect();
      }
    } finally {
      this.connecting = false;
      this.controller = null;
    }
  }

  private parseFrame(frame: string) {
    let eventType = "message";
    let eventId: string | undefined;
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("id:")) eventId = line.slice(3).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    const raw = dataLines.join("\n");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Server stream frames are JSON-only; don't forward malformed/raw data.
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    if (eventId && this.seenEventIds.has(eventId)) return;
    if (eventId) {
      this.lastEventId = eventId;
      this.seenEventIds.add(eventId);
      if (this.seenEventIds.size > 1500) {
        const first = this.seenEventIds.values().next().value;
        if (first) this.seenEventIds.delete(first);
      }
    }
    this.onEvent({ type: eventType, data: parsed, id: eventId });
  }
}
