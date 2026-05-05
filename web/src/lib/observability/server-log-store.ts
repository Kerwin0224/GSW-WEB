import 'server-only';

import { appendFile, mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';

import { emitLogEvent, sanitizeLogEvent, type LogEvent } from '@/lib/observability/log-event';

const LOG_DIR = path.join(process.cwd(), '.logs');
const APP_LOG_FILE = path.join(LOG_DIR, 'app-events.jsonl');
const DEV_LOG_FILE = path.join(LOG_DIR, 'next-dev.log');

export async function writeLogEvent(event: LogEvent) {
  const entry = emitLogEvent(event);
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(APP_LOG_FILE, `${JSON.stringify(sanitizeLogEvent(entry))}\n`, 'utf8');
  } catch (error) {
    emitLogEvent({
      level: 'warn',
      area: 'runtime',
      event: 'log_file_write_failed',
      message: error instanceof Error ? error.message : 'failed to write log file',
    });
  }
}

export type StoredLogEvent = ReturnType<typeof sanitizeLogEvent>;

const APP_EVENT_TAIL_BYTES = 512 * 1024;
const DEV_LOG_TAIL_BYTES = 256 * 1024;

async function readTailUtf8Lines(filePath: string, byteLimit: number) {
  const file = await open(filePath, 'r');
  try {
    const { size } = await file.stat();
    if (size === 0) return [];

    const length = Math.min(size, byteLimit);
    const position = size - length;
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, position);
    const raw = buffer.subarray(0, bytesRead).toString('utf8');
    const firstCompleteLine = position === 0 || raw.startsWith('\n') ? 0 : raw.indexOf('\n') + 1;
    if (firstCompleteLine === 0 && position > 0) return [];

    return raw.slice(firstCompleteLine).trim().split('\n').filter(Boolean);
  } finally {
    await file.close();
  }
}

export type AppEventFilters = {
  level?: StoredLogEvent['level'];
  traceId?: string;
  userId?: string;
  search?: string;
  sinceMs?: number;
};

function eventMatchesFilters(event: StoredLogEvent, filters: AppEventFilters) {
  if (filters.level && event.level !== filters.level) return false;

  const traceId = filters.traceId?.trim().toLowerCase();
  if (traceId) {
    const eventTrace = String(event.requestId ?? event.context?.trace_id ?? event.context?.traceId ?? '').toLowerCase();
    if (!eventTrace.includes(traceId)) return false;
  }

  const userId = filters.userId?.trim().toLowerCase();
  if (userId) {
    const eventUser = String(event.context?.user_id ?? event.context?.userId ?? event.context?.profile_id ?? '').toLowerCase();
    if (!eventUser.includes(userId)) return false;
  }

  if (filters.sinceMs !== undefined) {
    const timestamp = Date.parse(event.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < filters.sinceMs) return false;
  }

  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = [
      event.event,
      event.message,
      event.route,
      event.area,
      event.requestId,
      event.status,
      event.context ? JSON.stringify(event.context) : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  return true;
}

export async function readRecentAppEvents(limit = 80): Promise<StoredLogEvent[]> {
  try {
    return (await readTailUtf8Lines(APP_LOG_FILE, APP_EVENT_TAIL_BYTES))
      .slice(-limit)
      .map((line) => JSON.parse(line) as StoredLogEvent)
      .reverse();
  } catch {
    return [];
  }
}

export async function readFilteredAppEvents(filters: AppEventFilters = {}, limit = 80): Promise<StoredLogEvent[]> {
  const events = await readRecentAppEvents(Math.max(limit * 4, 200));
  return events.filter((event) => eventMatchesFilters(event, filters)).slice(0, limit);
}

export async function countRecentAppErrors(hours = 24) {
  const sinceMs = Date.now() - hours * 60 * 60 * 1000;
  const events = await readFilteredAppEvents({ level: 'error', sinceMs }, 500);
  return events.length;
}

export async function readRecentDevLogLines(limit = 120) {
  try {
    return (await readTailUtf8Lines(DEV_LOG_FILE, DEV_LOG_TAIL_BYTES)).slice(-limit).reverse();
  } catch {
    return [];
  }
}

export async function getLogFileStatus() {
  const [app, dev] = await Promise.all([
    stat(APP_LOG_FILE).catch(() => null),
    stat(DEV_LOG_FILE).catch(() => null),
  ]);
  return {
    appLogPath: '.logs/app-events.jsonl',
    devLogPath: '.logs/next-dev.log',
    appLogBytes: app?.size ?? 0,
    devLogBytes: dev?.size ?? 0,
    appLogUpdatedAt: app?.mtime.toISOString() ?? null,
    devLogUpdatedAt: dev?.mtime.toISOString() ?? null,
  };
}
