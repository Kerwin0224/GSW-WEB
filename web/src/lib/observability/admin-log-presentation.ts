import type { LogEvent } from './log-event';

export const LOG_LEVEL_OPTIONS = [
  { value: 'all', label: '全部级别' },
  { value: 'debug', label: '调试记录' },
  { value: 'info', label: '普通记录' },
  { value: 'warn', label: '需关注' },
  { value: 'error', label: '错误' },
] as const;

export type LogLevelFilter = LogEvent['level'] | 'all';

export const LOG_FUNCTION_OPTIONS = [
  { value: 'all', label: '全部功能' },
  { value: 'account_access', label: '账号与登录' },
  { value: 'student_learning', label: '学生学习' },
  { value: 'teacher_work', label: '教师工作' },
  { value: 'school_management', label: '学校管理' },
  { value: 'ai_service', label: 'AI 服务' },
  { value: 'data_export', label: '数据导出' },
  { value: 'attachment', label: '附件上传' },
  { value: 'system_runtime', label: '系统运行' },
] as const;

export type LogFunctionFilter = (typeof LOG_FUNCTION_OPTIONS)[number]['value'];
export type LogFunctionKey = Exclude<LogFunctionFilter, 'all'>;

/** 日志读取通道。文件回落不是生产通道，UI 必须把它标出来。 */
export type LogSource = 'database' | 'file';

export type LogExecutionResult = 'started' | 'succeeded' | 'not_completed' | 'failed' | 'attention' | 'recorded';
export type LogResultFilter = 'all' | LogExecutionResult | 'pending';

export const LOG_RESULT_OPTIONS = [
  { value: 'all', label: '全部结果' },
  { value: 'pending', label: '待处理（失败/未完成/需关注）' },
  { value: 'failed', label: '失败' },
  { value: 'not_completed', label: '未完成' },
  { value: 'attention', label: '需关注' },
  { value: 'started', label: '开始记录' },
  { value: 'succeeded', label: '已完成' },
  { value: 'recorded', label: '仅记录' },
] as const satisfies readonly { readonly value: LogResultFilter; readonly label: string }[];

/** 时间范围是服务端过滤条件，不是"取最近 N 条"：窗口之外的事件也要能被检索到。 */
export const LOG_TIME_RANGE_OPTIONS = [
  { value: '1h', label: '最近 1 小时', windowMs: 60 * 60 * 1000 },
  { value: '24h', label: '最近 24 小时', windowMs: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '最近 7 天', windowMs: 7 * 24 * 60 * 60 * 1000 },
  { value: 'all', label: '全部时间', windowMs: null },
] as const satisfies readonly { readonly value: string; readonly label: string; readonly windowMs: number | null }[];

export type LogTimeRange = (typeof LOG_TIME_RANGE_OPTIONS)[number]['value'];

const RANGE_WINDOWS: Readonly<Record<LogTimeRange, number | null>> = Object.fromEntries(
  LOG_TIME_RANGE_OPTIONS.map((option) => [option.value, option.windowMs]),
) as Readonly<Record<LogTimeRange, number | null>>;

export type AdminLogQuery = {
  readonly range: LogTimeRange;
  readonly level: LogLevelFilter;
  readonly functionKey: LogFunctionFilter;
  readonly result: LogResultFilter;
  readonly search: string;
  readonly traceId: string;
  readonly userId: string;
};

export const DEFAULT_LOG_QUERY: AdminLogQuery = {
  range: '24h',
  level: 'all',
  functionKey: 'all',
  result: 'all',
  search: '',
  traceId: '',
  userId: '',
};

const LOG_QUERY_PARAM_NAMES: Readonly<Record<keyof AdminLogQuery, string>> = {
  range: 'range',
  level: 'level',
  functionKey: 'function',
  result: 'result',
  search: 'q',
  traceId: 'trace_id',
  userId: 'user_id',
};

const LOG_QUERY_ALLOWED_VALUES: Readonly<Record<'range' | 'level' | 'functionKey' | 'result', readonly string[]>> = {
  range: LOG_TIME_RANGE_OPTIONS.map((option) => option.value),
  level: LOG_LEVEL_OPTIONS.map((option) => option.value),
  functionKey: LOG_FUNCTION_OPTIONS.map((option) => option.value),
  result: LOG_RESULT_OPTIONS.map((option) => option.value),
};

/** 数组取首个、空白归零：URL 里的重复参数不该让筛选行为取决于谁先到。 */
function firstParamValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

function pickAllowedParam<T extends string>(value: string, allowed: readonly string[], fallback: T): T {
  return (allowed.includes(value) ? value : fallback) as T;
}

/**
 * URL → 筛选。全部筛选条件都走 URL，服务端只认这份解析结果：
 * 刷新、前进后退、把链接发给同事，看到的都是同一个口径。
 */
export function parseAdminLogQuery(params: Record<string, string | string[] | undefined>): AdminLogQuery {
  return {
    range: pickAllowedParam(
      firstParamValue(params.range),
      LOG_QUERY_ALLOWED_VALUES.range,
      DEFAULT_LOG_QUERY.range,
    ),
    level: pickAllowedParam(
      firstParamValue(params.level),
      LOG_QUERY_ALLOWED_VALUES.level,
      DEFAULT_LOG_QUERY.level,
    ),
    functionKey: pickAllowedParam(
      firstParamValue(params.function),
      LOG_QUERY_ALLOWED_VALUES.functionKey,
      DEFAULT_LOG_QUERY.functionKey,
    ),
    result: pickAllowedParam(
      firstParamValue(params.result),
      LOG_QUERY_ALLOWED_VALUES.result,
      DEFAULT_LOG_QUERY.result,
    ),
    search: firstParamValue(params.q),
    traceId: firstParamValue(params.trace_id),
    userId: firstParamValue(params.user_id),
  };
}

/** 时间范围 → 服务端 created_at 下界；全部时间不设下界。 */
export function logRangeStartIso(range: LogTimeRange, now: Date = new Date()): string | undefined {
  const windowMs = RANGE_WINDOWS[range];
  return windowMs === null ? undefined : new Date(now.getTime() - windowMs).toISOString();
}

export function buildAdminLogHref(query: AdminLogQuery, overrides: Partial<AdminLogQuery> = {}, page?: number): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();
  for (const [key, paramName] of Object.entries(LOG_QUERY_PARAM_NAMES) as [keyof AdminLogQuery, string][]) {
    const value = merged[key];
    // 哨兵是 DEFAULT_LOG_QUERY 而不是 'all'：'all' 在时间范围里是"全部时间"这个真实取值。
    if (value && value !== DEFAULT_LOG_QUERY[key]) params.set(paramName, value);
  }
  if (page && page > 1) params.set('page', String(page));
  return `/admin/logs${params.size ? `?${params.toString()}` : ''}`;
}

/** 顶部四个快捷视图：每个视图就是一个 URL，切视图不丢其它筛选。 */
export type LogQuickView = {
  readonly id: string;
  readonly label: string;
  readonly overrides: Partial<AdminLogQuery>;
};

export const LOG_QUICK_VIEWS: readonly LogQuickView[] = [
  { id: 'pending', label: '待处理', overrides: { result: 'pending', level: 'all' } },
  { id: 'failed', label: '失败', overrides: { result: 'failed', level: 'all' } },
  { id: 'warning', label: '警告', overrides: { result: 'all', level: 'warn' } },
  { id: 'recent', label: '最近事件', overrides: { result: 'all', level: 'all' } },
];

type PresentableLogEvent = Required<Pick<LogEvent, 'timestamp'>> & LogEvent;

export type PresentedLogEvent = {
  readonly timestamp: string;
  readonly functionKey: LogFunctionKey;
  readonly functionLabel: string;
  readonly result: LogExecutionResult;
  readonly resultLabel: string;
  readonly outcome: string;
  readonly affectedUsers: string;
  readonly remediation: string;
  readonly eventCode: string;
  readonly level: LogEvent['level'];
  readonly requestId?: string;
  readonly traceId?: string;
  readonly route?: string;
  readonly method?: string;
  readonly status?: number;
  readonly durationMs?: number;
  readonly message?: string;
  readonly digest?: string;
  readonly context?: Readonly<Record<string, unknown>>;
};

/**
 * 一次执行 = 同一 requestId 的 started/completed/failed 合并后的单位。
 * 管理员看的是"发生了什么操作、结果如何"，不是同一操作的 N 条生命周期流水。
 */
export type PresentedLogExecution = {
  /** 最严重的一条事件：列表行、筛选、计数都以它为准。 */
  readonly primary: PresentedLogEvent;
  /** 同一请求的全部记录，时间正序。 */
  readonly events: readonly PresentedLogEvent[];
  readonly mergedCount: number;
  readonly level: LogEvent['level'];
  readonly startedAt: string;
  readonly lastAt: string;
  /** 交接用的生命周期轨迹，格式 `HH:mm:ss 开始 · 结果`。 */
  readonly timeline: readonly string[];
};

type FunctionDefinition = {
  readonly key: LogFunctionKey;
  readonly label: string;
};

const KNOWN_FUNCTIONS: Readonly<Record<string, FunctionDefinition>> = {
  account_password_change: { key: 'account_access', label: '修改个人密码' },
  account_avatar_update: { key: 'account_access', label: '更新个人头像' },
  school_login: { key: 'account_access', label: '学校账号登录' },
  student_chat: { key: 'student_learning', label: '学生学习提问' },
  student_conversation_delete: { key: 'student_learning', label: '删除学生学习对话' },
  challenge_generate: { key: 'student_learning', label: '生成学生挑战' },
  challenge_evaluate: { key: 'student_learning', label: '评阅学生挑战' },
  teacher_chat: { key: 'teacher_work', label: '教师备课问答' },
  teacher_conversation_delete: { key: 'teacher_work', label: '删除教师备课对话' },
  teacher_audit_sft: { key: 'teacher_work', label: '审核 SFT 记录' },
  teacher_audit_dpo: { key: 'teacher_work', label: '审核 DPO 记录' },
  teacher_dataset_preview: { key: 'teacher_work', label: '预览教师数据集' },
  admin_user_import: { key: 'school_management', label: '导入学校用户' },
  provider_list_models: { key: 'ai_service', label: '读取供应商模型列表' },
  provider_health_check: { key: 'ai_service', label: '检查模型供应商连接' },
  dataset_export: { key: 'data_export', label: '生成数据集导出' },
  dataset_download: { key: 'data_export', label: '下载数据集' },
  conversation_attachment_upload: { key: 'attachment', label: '上传对话附件' },
  client_log_invalid_json: { key: 'system_runtime', label: '接收浏览器错误报告' },
  client_log_invalid_payload: { key: 'system_runtime', label: '接收浏览器错误报告' },
  next_request_error: { key: 'system_runtime', label: '处理页面或接口请求' },
  log_file_write_failed: { key: 'system_runtime', label: '写入本地诊断记录' },
  log_db_insert_failed: { key: 'system_runtime', label: '保存运行日志' },
  next_server_started: { key: 'system_runtime', label: '启动应用服务' },
};

const RESULT_LABELS: Readonly<Record<LogExecutionResult, string>> = {
  started: '开始记录',
  succeeded: '已完成',
  not_completed: '未完成',
  failed: '失败',
  attention: '需关注',
  recorded: '已记录',
};

/** 结果严重度：合并同一请求的多条记录时取最高的一条作为结论。 */
const RESULT_SEVERITY: Readonly<Record<LogExecutionResult, number>> = {
  failed: 5,
  not_completed: 4,
  attention: 3,
  succeeded: 2,
  recorded: 1,
  started: 0,
};

const LEVEL_SEVERITY: Readonly<Record<LogEvent['level'], number>> = {
  error: 3,
  warn: 2,
  info: 1,
  debug: 0,
};

export const PENDING_RESULTS: readonly LogExecutionResult[] = ['failed', 'not_completed', 'attention'];

const EVENT_SUFFIXES = ['_started', '_completed', '_failed'] as const;
const REPORT_REDACTION_PATTERN = /password|secret|token|cookie|authorization|apikey|api_key|user_?id|profile_?id|login_?id/i;

function baseEventName(eventCode: string): string {
  if (eventCode.startsWith('school_login_')) return 'school_login';
  const suffix = EVENT_SUFFIXES.find((candidate) => eventCode.endsWith(candidate));
  return suffix ? eventCode.slice(0, -suffix.length) : eventCode;
}

function fallbackFunction(event: PresentableLogEvent): FunctionDefinition {
  const route = event.route ?? '';
  if (route.includes('/student/') || event.event.startsWith('student_') || event.event.startsWith('challenge_')) {
    return { key: 'student_learning', label: '学生学习功能' };
  }
  if (route.includes('/teacher/') || event.event.startsWith('teacher_')) {
    return { key: 'teacher_work', label: '教师工作功能' };
  }
  if (route.includes('/admin/')) return { key: 'school_management', label: '学校管理功能' };
  if (event.area === 'auth') return { key: 'account_access', label: '账号访问' };
  if (event.area === 'data') return { key: 'data_export', label: '数据处理' };
  return { key: 'system_runtime', label: '系统运行' };
}

function executionResult(event: PresentableLogEvent): LogExecutionResult {
  if (event.event.endsWith('_started')) return 'started';
  if (event.event.endsWith('_failed') || event.level === 'error' || (event.status !== undefined && event.status >= 500)) return 'failed';
  if (event.status !== undefined && event.status >= 400) return 'not_completed';
  if (event.event.endsWith('_completed') || event.event === 'school_login_accepted') return 'succeeded';
  if (event.level === 'warn') return 'attention';
  return 'recorded';
}

function outcomeFor(event: PresentableLogEvent, result: LogExecutionResult): string {
  const httpResult = event.status === undefined ? '' : `（HTTP ${event.status}）`;
  if (result === 'started') return '这条日志记录操作开始，最终结果需查看同一请求的后续记录。';
  if (result === 'succeeded' && baseEventName(event.event) === 'provider_health_check') {
    return `连接检查流程已完成${httpResult}；提供方返回的健康结论未记录在这条日志中。`;
  }
  if (result === 'succeeded') return `该次操作已完成${httpResult}。`;
  if (result === 'not_completed') return `该次操作未完成${httpResult}。`;
  if (result === 'failed') return `该次操作失败${httpResult}，错误线索见技术排查信息。`;
  if (result === 'attention') return `系统记录到需要关注的情况${httpResult}，详情见技术排查信息。`;
  return '系统已记录该事件，但没有提供执行结果。';
}

function affectedUsersFor(event: PresentableLogEvent, definition: FunctionDefinition): string {
  const role = event.context?.['role'];
  const hasUserId = ['user_id', 'userId', 'profile_id'].some((key) => typeof event.context?.[key] === 'string');
  const roleLabel = role === 'student' ? '学生' : role === 'teacher' ? '教师' : role === 'admin' ? '管理员' : undefined;
  if (hasUserId) return `${roleLabel ?? '用户'}（单次请求，身份标识已隐藏）`;
  if (roleLabel) return `发起该操作的${roleLabel}（身份标识未记录）`;
  if (definition.key === 'account_access') return '发起该操作的用户（人数未记录）';
  if (definition.key === 'student_learning') return '使用该功能的学生（人数未记录）';
  if (definition.key === 'teacher_work') return '使用该功能的教师（人数未记录）';
  if (definition.key === 'school_management' || definition.key === 'data_export' || definition.key === 'ai_service') {
    return '执行该操作的管理员（人数未记录）';
  }
  return '日志未记录具体用户';
}

function remediationFor(event: PresentableLogEvent, result: LogExecutionResult): string {
  if (result === 'started') return '按请求 ID 查找后续记录；若长时间没有结果，将技术报告转交开发人员。';
  if (result === 'succeeded') return '无需处理；如用户仍反馈异常，复制技术报告并补充当时操作。';
  if (event.status === 401 || event.status === 403) return '核对账号状态与操作权限；持续出现时复制技术报告转交开发人员。';
  if (event.status === 429) return '稍后重试并减少重复操作；持续出现时复制技术报告转交开发人员。';
  if (result === 'not_completed') return '检查用户提交的内容后重试；持续出现时复制技术报告转交开发人员。';
  if (result === 'failed') return '复制技术报告转交开发人员，并补充用户当时执行的操作。';
  if (result === 'attention') return '确认用户是否受阻；若问题可复现，复制技术报告转交开发人员。';
  return '仅作记录；如用户反馈异常，可复制技术报告协助定位。';
}

function traceIdFrom(context: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const traceId = context?.['trace_id'] ?? context?.['traceId'];
  return typeof traceId === 'string' ? traceId : undefined;
}

function redactReportText(value: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]')
    .replace(/\b(Cookie|Set-Cookie)\s*:\s*[^,\r\n]+/gi, '$1: [redacted]')
    .replace(/\b(password|secret|token|authorization|api_?key)\s*[:=]\s*[^;\s,]+/gi, '$1: [redacted]')
    .replace(/([?&](?:password|secret|token|authorization|api_?key)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]');
}

function redactReportValue(value: unknown, key = ''): unknown {
  if (REPORT_REDACTION_PATTERN.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => redactReportValue(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, item]) => [entryKey, redactReportValue(item, entryKey)]));
  }
  if (typeof value === 'string') return redactReportText(value);
  return value;
}

export function presentLogEvent(event: PresentableLogEvent): PresentedLogEvent {
  const definition = KNOWN_FUNCTIONS[baseEventName(event.event)] ?? fallbackFunction(event);
  const result = executionResult(event);
  return {
    timestamp: event.timestamp,
    functionKey: definition.key,
    functionLabel: definition.label,
    result,
    resultLabel: RESULT_LABELS[result],
    outcome: outcomeFor(event, result),
    affectedUsers: affectedUsersFor(event, definition),
    remediation: remediationFor(event, result),
    eventCode: event.event,
    level: event.level,
    requestId: event.requestId,
    traceId: traceIdFrom(event.context),
    route: event.route,
    method: event.method,
    status: event.status,
    durationMs: event.durationMs,
    message: event.message,
    digest: event.digest,
    context: event.context,
  };
}

/** 单条日志事件的稳定标识：同一请求的不同生命周期记录要能被区分开。 */
export function logEventIdentity(event: PresentedLogEvent): string {
  return `${event.timestamp}-${event.eventCode}-${event.requestId ?? ''}-${event.digest ?? ''}`;
}

export function logEventClock(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * 把同一 requestId 的 started/completed/failed 合并成一次执行。
 * 没有 requestId 的事件（客户端上报、单点 warn）各自算一次执行，不做猜测性合并。
 * 输出按最近一次记录时间倒序，与输入的时间倒序一致。
 */
export function mergePresentedLogExecutions(
  events: readonly PresentedLogEvent[],
): readonly PresentedLogExecution[] {
  const groups = new Map<string, PresentedLogEvent[]>();
  for (const event of events) {
    const key = event.requestId ? `rid:${event.requestId}` : `evt:${logEventIdentity(event)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }

  const executions: PresentedLogExecution[] = [];
  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const primary = ordered.reduce((worst, candidate) => (
      RESULT_SEVERITY[candidate.result] > RESULT_SEVERITY[worst.result] ? candidate : worst
    ));
    const level = ordered.reduce(
      (worst, candidate) => (LEVEL_SEVERITY[candidate.level] > LEVEL_SEVERITY[worst] ? candidate.level : worst),
      ordered[0].level,
    );
    executions.push({
      primary,
      events: ordered,
      mergedCount: ordered.length,
      level,
      startedAt: ordered[0].timestamp,
      lastAt: ordered[ordered.length - 1].timestamp,
      timeline: ordered.map((event) => `${logEventClock(event.timestamp)} ${event.eventCode} · ${RESULT_LABELS[event.result]}`),
    });
  }

  return executions.sort((left, right) => right.lastAt.localeCompare(left.lastAt));
}

export function filterPresentedLogEvents(
  events: readonly PresentedLogEvent[],
  functionalArea: LogFunctionFilter,
  result: LogResultFilter = 'all',
): readonly PresentedLogEvent[] {
  return events.filter((event) => (
    (functionalArea === 'all' || event.functionKey === functionalArea)
    && matchesResultFilter(event.result, result)
  ));
}

export function filterPresentedLogExecutions(
  executions: readonly PresentedLogExecution[],
  functionalArea: LogFunctionFilter,
  result: LogResultFilter = 'all',
): readonly PresentedLogExecution[] {
  return executions.filter((execution) => (
    (functionalArea === 'all' || execution.primary.functionKey === functionalArea)
    && matchesResultFilter(execution.primary.result, result)
  ));
}

function matchesResultFilter(value: LogExecutionResult, result: LogResultFilter): boolean {
  if (result === 'all') return true;
  if (result === 'pending') return PENDING_RESULTS.includes(value);
  return value === result;
}

export type AdminLogSummary = {
  readonly executions: number;
  readonly pending: number;
  readonly failed: number;
  readonly warning: number;
  readonly lastAt?: string;
};

/** 摘要统计的输入是"除结果筛选外"的执行集合，这样切到失败视图时待处理数不塌成 0。 */
export function summarizeLogExecutions(executions: readonly PresentedLogExecution[]): AdminLogSummary {
  return {
    executions: executions.length,
    pending: executions.filter((execution) => PENDING_RESULTS.includes(execution.primary.result)).length,
    failed: executions.filter((execution) => execution.primary.result === 'failed').length,
    warning: executions.filter((execution) => execution.level === 'warn').length,
    lastAt: executions[0]?.lastAt,
  };
}

export function buildDeveloperReport(
  event: PresentedLogEvent,
  lifecycle?: readonly string[],
): string {
  const lines = [
    '运行日志技术交接报告',
    `时间: ${event.timestamp}`,
    `功能: ${event.functionLabel}`,
    `执行结果: ${event.resultLabel}`,
    `影响对象: ${event.affectedUsers}`,
    `事件代码: ${event.eventCode}`,
    event.route ? `请求: ${event.method ?? 'UNKNOWN'} ${redactReportText(event.route)}${event.status === undefined ? '' : ` -> ${event.status}`}` : undefined,
    // 交接时 request_id 是唯一可回查的主键，trace_id 只作补充。
    event.requestId ? `请求 ID（主键）: ${event.requestId}` : undefined,
    event.traceId ? `Trace ID（补充）: ${event.traceId}` : undefined,
    event.durationMs === undefined ? undefined : `耗时: ${event.durationMs} ms`,
    event.message ? `错误摘要: ${redactReportText(event.message)}` : undefined,
    event.digest ? `错误摘要标识: ${event.digest}` : undefined,
    lifecycle && lifecycle.length > 1 ? `生命周期（${lifecycle.length} 条）:\n${lifecycle.join('\n')}` : undefined,
    event.context ? `上下文（已脱敏）:\n${JSON.stringify(redactReportValue(event.context), null, 2)}` : undefined,
  ];
  return lines.filter((line): line is string => line !== undefined).join('\n');
}
