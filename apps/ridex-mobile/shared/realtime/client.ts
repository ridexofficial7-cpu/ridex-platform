import AsyncStorage from '@react-native-async-storage/async-storage';

export type RideXStreamEvent = {
  id?: string;
  type?: string;
  actorType?: string;
  actorId?: string;
  bookingId?: string | null;
  driverId?: string | null;
  customerId?: string | null;
  payload?: Record<string, unknown>;
  createdAt?: string;
};

type Options = {
  url: string;
  headers?: Record<string, string>;
  onEvent: (event: RideXStreamEvent) => void;
  onError?: (error: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onReplayGap?: (event: RideXStreamEvent) => void;
  heartbeatTimeoutMs?: number;
  reconnect?: boolean;
  maxReconnectDelayMs?: number;
  initialReconnectDelayMs?: number;
  lastEventIdStorageKey?: string;
};

export function openRideXEventStream(options: Options) {
  let xhr: XMLHttpRequest | null = null;
  let buffer = '';
  let cursor = 0;
  let closed = false;
  let opened = false;
  let initialized = false;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = Math.max(250, options.initialReconnectDelayMs ?? 1000);
  let lastEventId = String(options.headers?.['Last-Event-ID'] ?? options.headers?.['last-event-id'] ?? '').trim();
  const seenEventIds = new Set<string>();
  const heartbeatTimeoutMs = Math.max(10_000, options.heartbeatTimeoutMs ?? 60_000);
  const maxReconnectDelayMs = Math.max(reconnectDelay, options.maxReconnectDelayMs ?? 30_000);

  const rememberEventId = (id: string): boolean => {
    if (!id) return true;
    if (seenEventIds.has(id)) return false;
    seenEventIds.add(id);
    if (seenEventIds.size > 1500) {
      const first = seenEventIds.values().next().value;
      if (first) seenEventIds.delete(first);
    }
    return true;
  };

  const persistCursor = (id: string) => {
    if (!id || !options.lastEventIdStorageKey) return;
    void AsyncStorage.setItem(options.lastEventIdStorageKey, id).catch(() => undefined);
  };

  const clearHeartbeat = () => {
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const touchHeartbeat = () => {
    clearHeartbeat();
    if (closed) return;
    heartbeatTimer = setTimeout(() => {
      if (closed) return;
      try {
        xhr?.abort();
      } catch {
        // Ignore abort failures during reconnect.
      }
      options.onError?.(new Error('Realtime heartbeat timed out'));
      scheduleReconnect();
    }, heartbeatTimeoutMs);
  };

  const notifyOpen = () => {
    if (opened || closed) return;
    opened = true;
    reconnectDelay = Math.max(250, options.initialReconnectDelayMs ?? 1000);
    touchHeartbeat();
    options.onOpen?.();
  };

  const notifyClose = () => {
    clearHeartbeat();
    if (!opened) return;
    opened = false;
    options.onClose?.();
  };

  const flushBuffer = (chunk: string) => {
    buffer += chunk;
    touchHeartbeat();
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';

    for (const block of parts) {
      const dataLines: string[] = [];
      let eventType = 'message';
      let eventId = '';

      for (const line of block.split(/\r?\n/)) {
        if (!line || line.startsWith(':')) continue;
        const separator = line.indexOf(':');
        const field = separator >= 0 ? line.slice(0, separator) : line;
        const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, '') : '';
        if (field === 'event') eventType = value || 'message';
        if (field === 'id') eventId = value;
        if (field === 'data') dataLines.push(value);
      }

      const data = dataLines.join('\n');
      if (!data) continue;

      let parsed: RideXStreamEvent;
      try {
        const decoded: unknown = JSON.parse(data);
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
          throw new Error('Realtime event must be a JSON object');
        }
        parsed = decoded as RideXStreamEvent;
      } catch {
        // Never forward malformed/raw server frames to application state.
        options.onError?.(new Error('Malformed realtime event payload'));
        continue;
      }

      // Only advance/persist the replay cursor after a valid event object is
      // accepted; duplicate IDs must not rewind the cursor.
      if (eventId && seenEventIds.has(eventId)) continue;
      if (eventId) {
        rememberEventId(eventId);
        lastEventId = eventId;
        persistCursor(eventId);
      }
      parsed.type = parsed.type || eventType;
      if (eventId) parsed.id = eventId;
      else if (lastEventId) parsed.id = parsed.id || lastEventId;

      if (String(parsed.type || '').toUpperCase() === 'REPLAY_GAP') {
        options.onReplayGap?.(parsed);
      }
      options.onEvent(parsed);
    }
  };

  const connect = () => {
    if (closed || !initialized) return;
    clearReconnect();
    cursor = 0;
    buffer = '';
    xhr = new XMLHttpRequest();

    xhr.onreadystatechange = () => {
      if (closed || !xhr) return;
      if (xhr.readyState === 2) notifyOpen();
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 400) notifyOpen();
        const text = xhr.responseText || '';
        const next = text.slice(cursor);
        cursor = text.length;
        if (next) flushBuffer(next);

        if (xhr.readyState === 4) {
          if (xhr.status >= 400) {
            options.onError?.(new Error(`Realtime stream failed (${xhr.status})`));
          }
          notifyClose();
          scheduleReconnect();
        }
      }
    };

    xhr.onerror = () => {
      if (closed) return;
      options.onError?.(new Error('Realtime connection failed'));
      notifyClose();
      scheduleReconnect();
    };

    xhr.ontimeout = () => {
      if (closed) return;
      options.onError?.(new Error('Realtime connection timed out'));
      notifyClose();
      scheduleReconnect();
    };

    xhr.open('GET', options.url, true);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      xhr.setRequestHeader(key, value);
    }
    if (lastEventId) xhr.setRequestHeader('Last-Event-ID', lastEventId);
    xhr.send();
  };

  const scheduleReconnect = () => {
    if (closed || options.reconnect === false || reconnectTimer) return;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(maxReconnectDelayMs, reconnectDelay * 2);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const initialize = async () => {
    if (options.lastEventIdStorageKey && !lastEventId) {
      try {
        const stored = await AsyncStorage.getItem(options.lastEventIdStorageKey);
        if (!closed && stored) lastEventId = stored.trim();
      } catch {
        // A missing cursor must not block the live stream.
      }
    }
    if (closed) return;
    initialized = true;
    connect();
  };

  void initialize();

  return () => {
    if (closed) return;
    closed = true;
    clearHeartbeat();
    clearReconnect();
    try {
      xhr?.abort();
    } catch {
      // Ignore abort failures during explicit cleanup.
    }
    if (opened) options.onClose?.();
  };
}
