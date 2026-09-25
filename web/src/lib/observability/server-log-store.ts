import 'server-only';

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';

import { createDatabaseSessionSignature } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { emitLogEvent, sanitizeLogEvent, type LogEvent } from '@/lib/observability/log-event';

const LOG_DIR = path.join(process.cwd(), '.logs');
const APP_LOG_FILE = path.join(LOG_DIR, 'app-events.jsonl');

/**
 * 日志双通道：本地 .logs 落盘（开发用）+ app_log_events 表（生产唯一持久层）。
 * Vercel serverless 文件系统只读，本地文件在生产必然写入失败，
 * 数据库落库才是可在管理后台"运行日志"里回查的通道。
 */
export async function writeLogEvent(event: LogEvent) {
  const entry = emitLogEvent(event);
  const sanitized = sanitizeLogEvent(entry);
  await Promise.allSettled([appendLogEventToFile(sanitized), insertLogEventRow(sanitized)]);
}

async function appendLogEventToFile(entry: StoredLogEvent) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(APP_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    emitLogEvent({
      level: 'warn',
      area: 'runtime',
      event: 'log_file_write_failed',
      message: error instanceof Error ? error.message : 'failed to write log file',
    });
  }
}

async function insertLogEventRow(entry: StoredLogEvent) {
  try {
    const eventId = randomUUID();
    const supabase = await createClient();
    const { error } = await supabase.rpc('write_app_log_event', {
      p_event_id: eventId,
      p_level: entry.level,
      p_area: entry.area,
      p_event: entry.event,
      p_route: entry.route ?? null,
      p_method: entry.method ?? null,
      p_status: entry.status ?? null,
      p_request_id: entry.requestId ?? null,
      p_message: entry.message ?? null,
      p_digest: entry.digest ?? null,
      p_context: entry.context ?? null,
      p_server_signature: createDatabaseSessionSignature(`log:${eventId}`),
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    // 只降级到 console，绝不再走 writeLogEvent，避免递归。
    emitLogEvent({
      level: 'warn',
      area: 'runtime',
      event: 'log_db_insert_failed',
      message: error instanceof Error ? error.message : 'failed to insert log event row',
    });
  }
}

export type StoredLogEvent = ReturnType<typeof sanitizeLogEvent>;

export class AppLogReadError extends Error {
  constructor(databaseCause: unknown, fileCause: unknown) {
    super('运行日志的数据库和本地文件通道均不可用。', {
      cause: new AggregateError([databaseCause, fileCause], 'Application log sources unavailable'),
    });
    this.name = 'AppLogReadError';
  }
}

const APP_EVENT_TAIL_BYTES = 512 * 1024;

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

type AppLogEventRow = {
  created_at: string;
  level: string;
  area: string;
  event: string;
  route: string | null;
  method: string | null;
  status: number | null;
  request_id: string | null;
  message: string | null;
  digest: string | null;
  context: Record<string, unknown> | null;
};

function rowToStoredEvent(row: AppLogEventRow): StoredLogEvent {
  return {
    timestamp: row.created_at,
    level: row.level as StoredLogEvent['level'],
    area: row.area,
    event: row.event,
    route: row.route ?? undefined,
    method: row.method ?? undefined,
    status: row.status ?? undefined,
    requestId: row.request_id ?? undefined,
    message: row.message ?? undefined,
    digest: row.digest ?? undefined,
    context: row.context ?? undefined,
  } as StoredLogEvent;
}

/** LIKE 元字符转义成字面量：管理员输入的字符就是被检索的字符，不当作通配符。 */
function literalLikeTerm(value: string) {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * or=() 里的 ilike 条件。PostgREST 用 `,` `.` `(` `)` 拆分 or 表达式，
 * 值里出现这些字符必须整体加双引号，否则过滤语法被拆坏（400）或被截成错误的条件。
 */
function orIlikeContains(column: string, term: string) {
  const escaped = literalLikeTerm(term).replace(/"/g, '\\"');
  return `${column}.ilike."%${escaped}%"`;
}

/**
 * 优先读数据库（生产唯一持久通道，管理员经 RLS 读取），
 * 数据库不可用或非管理员会话（本地开发）时回落本地 .logs 文件。
 *
 * 过滤条件交给数据库判定：先前是在内存里过滤一个固定取样窗口，窗口之外的匹配事件
 * 永远搜不到，管理员会把「窗口里没有」误读成「没发生过」。
 */
export async function readRecentAppEvents(limit = 80, filters: AppEventFilters = {}): Promise<StoredLogEvent[]> {
  // try 正常完成时在下方赋值、抛异常时由 catch 赋值，进入文件回落前必然已有值
  let databaseCause: unknown;
  try {
    const supabase = await createClient();
    let query = supabase
      .from('app_log_events')
      .select('created_at,level,area,event,route,method,status,request_id,message,digest,context')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters.level) query = query.eq('level', filters.level);

    const traceId = filters.traceId?.trim();
    if (traceId) query = query.ilike('request_id', `%${literalLikeTerm(traceId)}%`);

    // context 是 jsonb，PostgREST 不能整篇全文匹配；其中真正要检索的 trace/user 标识
    // 各有专用过滤框，所以搜索只覆盖日志行自身的文本列。
    const search = filters.search?.trim();
    if (search) {
      query = query.or(
        ['event', 'message', 'route', 'area', 'method'].map((column) => orIlikeContains(column, search)).join(','),
      );
    }

    const userId = filters.userId?.trim();
    if (userId) {
      query = query.or(
        ['context->>user_id', 'context->>profile_id'].map((column) => orIlikeContains(column, userId)).join(','),
      );
    }

    const { data, error } = await query;
    if (!error && data) {
      return (data as AppLogEventRow[]).map(rowToStoredEvent);
    }
    databaseCause = error;
  } catch (error) {
    databaseCause = error;
  }
  try {
    return (await readTailUtf8Lines(APP_LOG_FILE, APP_EVENT_TAIL_BYTES))
      .map((line) => JSON.parse(line) as StoredLogEvent)
      .filter((event) => eventMatchesFilters(event, filters))
      .slice(-limit)
      .reverse();
  } catch (fileCause) {
    throw new AppLogReadError(databaseCause, fileCause);
  }
}


export async function getLogFileStatus() {
  const app = await stat(APP_LOG_FILE).catch(() => null);
  return {
    appLogPath: '.logs/app-events.jsonl',
    appLogBytes: app?.size ?? 0,
    appLogUpdatedAt: app?.mtime.toISOString() ?? null,
  };
}
