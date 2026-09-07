import type { LogEvent } from './log-event';

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
export type LogExecutionResult = 'started' | 'succeeded' | 'not_completed' | 'failed' | 'attention' | 'recorded';
export type LogResultFilter = 'all' | LogExecutionResult;

export const LOG_RESULT_OPTIONS = [
  { value: 'all', label: '全部结果' },
  { value: 'failed', label: '失败' },
  { value: 'not_completed', label: '未完成' },
  { value: 'attention', label: '需关注' },
  { value: 'started', label: '开始记录' },
  { value: 'succeeded', label: '已完成' },
  { value: 'recorded', label: '仅记录' },
] as const satisfies readonly { readonly value: LogResultFilter; readonly label: string }[];

type PresentableLogEvent = Required<Pick<LogEvent, 'timestamp'>> & LogEvent;

export type PresentedLogEvent = {
  readonly timestamp: string;
  readonly functionKey: LogFunctionKey;
  readonly functionLabel: string;
  readonly result: LogExecutionResult;
  readonly resultLabel: string;
  readonly healthClaim: 'not_available';
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
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
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
    healthClaim: 'not_available',
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

export function filterPresentedLogEvents(
  events: readonly PresentedLogEvent[],
  functionalArea: LogFunctionFilter,
  result: LogResultFilter = 'all',
): readonly PresentedLogEvent[] {
  return events.filter((event) => (
    (functionalArea === 'all' || event.functionKey === functionalArea)
    && (result === 'all' || event.result === result)
  ));
}

export function buildDeveloperReport(event: PresentedLogEvent): string {
  const lines = [
    '运行日志技术交接报告',
    `时间: ${event.timestamp}`,
    `功能: ${event.functionLabel}`,
    `执行结果: ${event.resultLabel}`,
    `影响对象: ${event.affectedUsers}`,
    `事件代码: ${event.eventCode}`,
    event.route ? `请求: ${event.method ?? 'UNKNOWN'} ${redactReportText(event.route)}${event.status === undefined ? '' : ` -> ${event.status}`}` : undefined,
    event.requestId ? `请求 ID: ${event.requestId}` : undefined,
    event.traceId ? `Trace ID: ${event.traceId}` : undefined,
    event.durationMs === undefined ? undefined : `耗时: ${event.durationMs} ms`,
    event.message ? `错误摘要: ${redactReportText(event.message)}` : undefined,
    event.digest ? `错误摘要标识: ${event.digest}` : undefined,
    event.context ? `上下文（已脱敏）:\n${JSON.stringify(redactReportValue(event.context), null, 2)}` : undefined,
  ];
  return lines.filter((line): line is string => line !== undefined).join('\n');
}
