import 'server-only';

import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
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

export async function readRecentAppEvents(limit = 80): Promise<StoredLogEvent[]> {
  try {
    const raw = await readFile(APP_LOG_FILE, 'utf8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as StoredLogEvent)
      .reverse();
  } catch {
    return [];
  }
}

export async function readRecentDevLogLines(limit = 120) {
  try {
    const raw = await readFile(DEV_LOG_FILE, 'utf8');
    return raw.trim().split('\n').filter(Boolean).slice(-limit).reverse();
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
