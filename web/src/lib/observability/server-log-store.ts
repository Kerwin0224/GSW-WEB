import 'server-only';

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';

import { createDatabaseSessionSignature } from '@/lib/session';
import { getProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/lib/supabase/database.types';

import type { LogSource } from '@/lib/observability/admin-log-presentation';
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

type LogTenant = { schoolId: string | null; organizationId: string | null };

const NO_TENANT: LogTenant = { schoolId: null, organizationId: null };

/**
 * 日志的租户归属按 profileId 短暂记忆。理由：一次 API 请求会写 started 与 completed
 * 两条日志，各自再查一次 profiles 纯属重复；10 秒窗口内学校归属不会变，
 * 而账号停用之类的鉴权判定走的是 requireRole，不经过这里。
 */
const TENANT_TTL_MS = 10_000;
const tenantCache = new Map<string, { at: number; tenant: LogTenant }>();

async function resolveLogTenant(): Promise<LogTenant> {
  try {
    const profile = await getProfile();
    if (!profile) return NO_TENANT;
    const cached = tenantCache.get(profile.id);
    if (cached && Date.now() - cached.at < TENANT_TTL_MS) return cached.tenant;
    const tenant: LogTenant = { schoolId: profile.school_id, organizationId: profile.organization_id };
    // 记忆表按活跃用户增长，不设上限的话长驻实例会一直攒着过期条目。
    if (tenantCache.size > 500) tenantCache.clear();
    tenantCache.set(profile.id, { at: Date.now(), tenant });
    return tenant;
  } catch {
    // 读不到档案不是日志的失败原因：平台级事件本来就没有租户。
    return NO_TENANT;
  }
}

/**
 * 迁移把 school_id / organization_id / duration_ms 追加在原 12 个参数**末尾**并给了默认值。
 * 前 12 个位置参数顺序不可动——那里全是按位置传参的调用点，改顺序会让 school_id
 * 收到 p_event_id，表现是「日志全丢」而不是报错。
 * database.types.ts 的 Args 还没带上这三个新参数，签名在这里就地补齐。
 */
type WriteAppLogEventArgs = Database['public']['Functions']['write_app_log_event']['Args'] & {
  p_school_id?: string | null;
  p_organization_id?: string | null;
  p_duration_ms?: number | null;
};

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
    const tenant = await resolveLogTenant();
    const supabase = await createClient();
    const args: WriteAppLogEventArgs = {
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
      p_context: (entry.context ?? null) as Json,
      p_server_signature: createDatabaseSessionSignature(`log:${eventId}`),
      p_school_id: tenant.schoolId,
      p_organization_id: tenant.organizationId,
      p_duration_ms: entry.durationMs ?? null,
    };
    const { error } = await supabase.rpc('write_app_log_event', args);
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
  /** 时间范围下界（ISO），下推到 created_at，避免"窗口外搜不到"。 */
  since?: string;
  /** 学校 id：多租户下所有学校的日志混在同一张表，不筛就看不到边界。 */
  schoolId?: string;
};

function matchesTrace(event: StoredLogEvent, needle: string): boolean {
  const candidates = [
    event.requestId,
    event.context?.['trace_id'],
    event.context?.['traceId'],
  ].filter((value): value is string => typeof value === 'string');
  return candidates.some((candidate) => candidate.toLowerCase().includes(needle));
}

function eventMatchesFilters(event: StoredLogEvent, filters: AppEventFilters) {
  if (filters.level && event.level !== filters.level) return false;

  const traceId = filters.traceId?.trim().toLowerCase();
  if (traceId && !matchesTrace(event, traceId)) return false;

  const userId = filters.userId?.trim().toLowerCase();
  if (userId) {
    const eventUser = String(event.context?.user_id ?? event.context?.userId ?? event.context?.profile_id ?? '').toLowerCase();
    if (!eventUser.includes(userId)) return false;
  }

  // 文件回落通道拿不到 school_id：本地日志是写入时序列化的事件对象，没有租户列。
  // 选了租户又只能读文件时返回空集，比假装「这个学校没有日志」更诚实。
  if (filters.schoolId) return false;

  const since = filters.since ? Date.parse(filters.since) : Number.NaN;
  if (Number.isFinite(since) && Date.parse(event.timestamp) < since) return false;

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
  school_id: string | null;
  organization_id: string | null;
  duration_ms: number | null;
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
    durationMs: row.duration_ms ?? undefined,
    schoolId: row.school_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
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


export type AppEventReadResult = {
  readonly source: LogSource;
  readonly events: readonly StoredLogEvent[];
};

/**
 * 优先读数据库（生产唯一持久通道，管理员经 RLS 读取），
 * 数据库不可用或非管理员会话（本地开发）时回落本地 .logs 文件。
 *
 * 过滤条件交给数据库判定：先前是在内存里过滤一个固定取样窗口，窗口之外的匹配事件
 * 永远搜不到，管理员会把「窗口里没有」误读成「没发生过」。
 */
export async function readRecentAppEvents(limit = 80, filters: AppEventFilters = {}): Promise<AppEventReadResult> {
  // try 正常完成时在下方赋值、抛异常时由 catch 赋值，进入文件回落前必然已有值
  let databaseCause: unknown;
  try {
    const result = await queryAppLogEvents(filters, { limit });
    return { source: 'database', events: result.rows.map(rowToStoredEvent) };
  } catch (error) {
    databaseCause = error;
  }
  try {
    const events = (await readTailUtf8Lines(APP_LOG_FILE, APP_EVENT_TAIL_BYTES))
      .map((line) => JSON.parse(line) as StoredLogEvent)
      .filter((event) => eventMatchesFilters(event, filters))
      .slice(-limit)
      .reverse();
    return { source: 'file', events };
  } catch (fileCause) {
    throw new AppLogReadError(databaseCause, fileCause);
  }
}

export type AppEventCount = { readonly count: number; readonly source: LogSource };

/**
 * 时间范围内的条数。概览页原先统计"最近 6 条里有几条 error"并叫它"技术错误"，
 * 那是取样窗口不是系统状态；概览要的是选定时间范围内的真实计数。
 */
export async function countLogEvents(filters: AppEventFilters = {}): Promise<AppEventCount> {
  try {
    const result = await queryAppLogEvents(filters, { count: true });
    return { count: result.count ?? 0, source: 'database' };
  } catch {
    // 数据库读不到时退回文件通道；两条通道都读不到时返回 0，由页面显示"不可用"。
  }
  try {
    const events = (await readTailUtf8Lines(APP_LOG_FILE, APP_EVENT_TAIL_BYTES))
      .map((line) => JSON.parse(line) as StoredLogEvent)
      .filter((event) => eventMatchesFilters(event, filters));
    return { count: events.length, source: 'file' };
  } catch {
    return { count: 0, source: 'file' };
  }
}

type AppLogEventQueryResult = {
  readonly rows: AppLogEventRow[];
  readonly count: number | null;
};

/**
 * 过滤条件全部下推到 PostgREST：先前是在内存里过滤一个固定取样窗口，
 * 窗口之外的匹配事件永远搜不到，管理员会把「窗口里没有」误读成「没发生过」。
 * 读取与计数共用这一个查询构造器，两处口径不会漂移。
 */
async function queryAppLogEvents(
  filters: AppEventFilters,
  options: { readonly limit?: number; readonly count?: boolean },
): Promise<AppLogEventQueryResult> {
  const supabase = await createClient();
  const query = supabase
    .from('app_log_events')
    .select('created_at,level,area,event,route,method,status,request_id,message,digest,context,school_id,organization_id,duration_ms', {
      count: options.count ? 'exact' : undefined,
      head: options.count === true,
    })
    .order('created_at', { ascending: false });

  if (options.limit) query.limit(options.limit);
  if (filters.level) query.eq('level', filters.level);
  if (filters.since) query.gte('created_at', filters.since);
  if (filters.schoolId) query.eq('school_id', filters.schoolId);

  // trace 检索必须同时命中 request_id 与 context 里的 trace 标识：请求级日志写 request_id，
  // 业务侧日志只写 context.trace_id，只查其中一列会让「按 Trace ID 检索」永远查不到东西。
  const traceId = filters.traceId?.trim();
  if (traceId) {
    query.or(
      ['request_id', 'context->>trace_id', 'context->>traceId']
        .map((column) => orIlikeContains(column, traceId))
        .join(','),
    );
  }

  // context 是 jsonb，PostgREST 不能整篇全文匹配；其中真正要检索的 trace/user 标识
  // 各有专用过滤框，所以关键字搜索只覆盖日志行自身的文本列。
  const search = filters.search?.trim();
  if (search) {
    query.or(
      ['event', 'message', 'route', 'area', 'method'].map((column) => orIlikeContains(column, search)).join(','),
    );
  }

  const userId = filters.userId?.trim();
  if (userId) {
    query.or(
      ['context->>user_id', 'context->>profile_id'].map((column) => orIlikeContains(column, userId)).join(','),
    );
  }

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as AppLogEventRow[], count: count ?? null };
}

/** 延迟分位与慢调用榜的单次取数上限：超出后页面必须说明口径，不能把上限说成「全部」。 */
const LATENCY_SCAN_LIMIT = 2000;

export type LogLatencySummary = {
  readonly source: LogSource;
  readonly samples: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
  readonly max: number | null;
  readonly slowestByEvent: readonly { event: string; calls: number; p95: number | null; max: number }[];
};

function percentile(sorted: readonly number[], ratio: number): number | null {
  if (sorted.length === 0) return null;
  // 最近秩法：索引向上取整，保证「p95 至少有这么快」这个方向不会失真。
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return sorted[index];
}

function summarizeDurations(source: LogSource, rows: readonly { event: string; durationMs: number }[]): LogLatencySummary {
  const durations = rows.map((row) => row.durationMs).sort((left, right) => left - right);
  const byEvent = new Map<string, number[]>();
  for (const row of rows) {
    const bucket = byEvent.get(row.event);
    if (bucket) bucket.push(row.durationMs);
    else byEvent.set(row.event, [row.durationMs]);
  }
  const slowestByEvent = [...byEvent.entries()]
    .map(([event, values]) => {
      values.sort((left, right) => left - right);
      return { event, calls: values.length, p95: percentile(values, 0.95), max: values[values.length - 1] };
    })
    .sort((left, right) => (right.p95 ?? 0) - (left.p95 ?? 0))
    .slice(0, 8);

  return {
    source,
    samples: durations.length,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    max: durations.length > 0 ? durations[durations.length - 1] : null,
    slowestByEvent,
  };
}

/**
 * 真实延迟。withApiLogging 一直算得出 durationMs，但旧写入路径把它丢了，
 * serverless 下文件通道又必然失败——生产环境的延迟恒为 undefined，p95 无从计算。
 * 迁移补上 duration_ms 列并把它接到写入口之后，这里才有东西可算。
 */
export async function summarizeAppEventLatency(filters: AppEventFilters = {}): Promise<LogLatencySummary> {
  try {
    const result = await queryAppLogEvents(filters, { limit: LATENCY_SCAN_LIMIT });
    const rows = result.rows.flatMap((row) =>
      row.duration_ms === null ? [] : [{ event: row.event, durationMs: row.duration_ms }],
    );
    return summarizeDurations('database', rows);
  } catch {
    // 数据库读不到时退回文件通道：本地开发的 .logs 里同样有 durationMs。
  }
  try {
    const events = (await readTailUtf8Lines(APP_LOG_FILE, APP_EVENT_TAIL_BYTES))
      .map((line) => JSON.parse(line) as StoredLogEvent)
      .filter((event) => eventMatchesFilters(event, filters));
    return summarizeDurations('file', events.flatMap((event) =>
      typeof event.durationMs === 'number' ? [{ event: event.event, durationMs: event.durationMs }] : [],
    ));
  } catch {
    return summarizeDurations('file', []);
  }
}

export type LogTenantOption = { schoolId: string; schoolName: string };

/**
 * 管理员可见的学校清单，作为租户筛选的选项。RLS（schools_admin_read）已经把
 * 「本公司全部学校」和「本校」两种视角区分开了，这里不再重复过滤。
 */
export async function listLogTenants(): Promise<LogTenantOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('schools').select('id,name').order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; name: string }[]).map((row) => ({ schoolId: row.id, schoolName: row.name }));
}


export async function getLogFileStatus() {
  const app = await stat(APP_LOG_FILE).catch(() => null);
  return {
    appLogPath: '.logs/app-events.jsonl',
    appLogBytes: app?.size ?? 0,
    appLogUpdatedAt: app?.mtime.toISOString() ?? null,
  };
}
