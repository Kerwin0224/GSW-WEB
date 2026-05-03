export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEvent = {
  timestamp?: string;
  level: LogLevel;
  area: 'auth' | 'api' | 'render' | 'proxy' | 'client' | 'data' | 'runtime';
  event: string;
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  message?: string;
  digest?: string;
  context?: Record<string, unknown>;
};

const SECRET_KEY_PATTERN = /password|secret|token|cookie|authorization|apikey|api_key|key/i;

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redactValue(item),
    ]),
  );
}

export function sanitizeLogEvent(event: LogEvent): Required<Pick<LogEvent, 'timestamp'>> & LogEvent {
  return {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
    context: event.context ? (redactValue(event.context) as Record<string, unknown>) : undefined,
    message: event.message?.slice(0, 800),
  };
}

export function emitLogEvent(event: LogEvent) {
  const entry = sanitizeLogEvent(event);
  const line = JSON.stringify(entry);
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else console.log(line);
  return entry;
}

export function createRequestId(prefix = 'req') {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
}
