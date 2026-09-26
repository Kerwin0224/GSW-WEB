import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildAdminLogHref,
  buildDeveloperReport,
  filterPresentedLogEvents,
  filterPresentedLogExecutions,
  logRangeStartIso,
  mergePresentedLogExecutions,
  parseAdminLogQuery,
  presentLogEvent,
  summarizeLogExecutions,
} from '../observability/admin-log-presentation.ts';

test('marks a completed provider check as one finished execution without claiming ongoing health', () => {
  // Given
  const event = {
    timestamp: '2026-09-07T08:15:00.000Z',
    level: 'info' as const,
    area: 'api' as const,
    event: 'provider_health_check_completed',
    requestId: 'api_request-123',
    route: '/api/admin/providers/health-check',
    method: 'POST',
    status: 200,
    durationMs: 340,
  };

  // When
  const presented = presentLogEvent(event);

  // Then
  assert.equal(presented.functionKey, 'ai_service');
  assert.equal(presented.result, 'succeeded');
});

test('uses the recorded HTTP result when a completed request was rejected', () => {
  // Given
  const event = {
    timestamp: '2026-09-07T08:16:00.000Z',
    level: 'warn' as const,
    area: 'auth' as const,
    event: 'school_login_completed',
    route: '/api/auth/login',
    method: 'POST',
    status: 401,
  };

  // When
  const presented = presentLogEvent(event);

  // Then
  assert.equal(presented.result, 'not_completed');
});

test('redacts user and secret context while retaining request tracing in the developer report', () => {
  // Given
  const event = {
    timestamp: '2026-09-07T08:17:00.000Z',
    level: 'error' as const,
    area: 'render' as const,
    event: 'next_request_error',
    requestId: 'render_request-456',
    route: '/student/chat',
    method: 'GET',
    message: 'render failed; Authorization: Bearer private-message-token',
    digest: 'digest-789',
    context: {
      trace_id: 'trace-abc',
      user_id: 'student-private-id',
      authorization: 'Bearer private-token',
      path: '/student/chat',
    },
  };

  // When
  const report = buildDeveloperReport(presentLogEvent(event));

  // Then
  assert.match(report, /render_request-456/);
  assert.match(report, /trace-abc/);
  assert.match(report, /render failed/);
  assert.doesNotMatch(report, /student-private-id/);
  assert.doesNotMatch(report, /private-token/);
  assert.doesNotMatch(report, /private-message-token/);
});

test('redacts common credential forms embedded in free-text log messages', () => {
  const event = presentLogEvent({
    timestamp: '2026-09-07T08:17:30.000Z',
    level: 'error',
    area: 'render',
    event: 'next_request_error',
    message: 'password: correct-horse; Cookie: cwb_session=session-private; Authorization: Basic dXNlcjpwYXNz',
  });

  const report = buildDeveloperReport(event);

  assert.doesNotMatch(report, /correct-horse/);
  assert.doesNotMatch(report, /session-private/);
  assert.doesNotMatch(report, /dXNlcjpwYXNz/);
});

test('filters only the returned sample by functional area', () => {
  // Given
  const sample = [
    presentLogEvent({
      timestamp: '2026-09-07T08:18:00.000Z',
      level: 'info',
      area: 'api',
      event: 'student_chat_completed',
    }),
    presentLogEvent({
      timestamp: '2026-09-07T08:19:00.000Z',
      level: 'info',
      area: 'api',
      event: 'teacher_chat_completed',
    }),
  ];

  // When
  const filtered = filterPresentedLogEvents(sample, 'student_learning');

  // Then
  assert.deepEqual(filtered.map((event) => event.functionKey), ['student_learning']);
});

test('filters only the returned sample by execution result', () => {
  // Given
  const sample = [
    presentLogEvent({
      timestamp: '2026-09-07T08:20:00.000Z',
      level: 'error',
      area: 'api',
      event: 'student_chat_failed',
    }),
    presentLogEvent({
      timestamp: '2026-09-07T08:21:00.000Z',
      level: 'info',
      area: 'api',
      event: 'student_chat_completed',
      status: 200,
    }),
  ];

  // When
  const filtered = filterPresentedLogEvents(sample, 'all', 'failed');

  // Then
  assert.deepEqual(filtered.map((event) => event.result), ['failed']);
});

test('merges one request lifecycle into a single execution with the most severe result', () => {
  // Given
  const lifecycle = [
    presentLogEvent({
      timestamp: '2026-09-26T08:00:00.000Z',
      level: 'info',
      area: 'api',
      event: 'student_chat_started',
      requestId: 'req-1',
    }),
    presentLogEvent({
      timestamp: '2026-09-26T08:00:04.000Z',
      level: 'error',
      area: 'api',
      event: 'student_chat_failed',
      requestId: 'req-1',
      message: 'upstream timeout',
    }),
    presentLogEvent({
      timestamp: '2026-09-26T08:05:00.000Z',
      level: 'info',
      area: 'api',
      event: 'teacher_chat_completed',
      requestId: 'req-2',
      status: 200,
    }),
  ];

  // When
  const executions = mergePresentedLogExecutions(lifecycle);

  // Then
  assert.equal(executions.length, 2);
  assert.equal(executions[0].primary.result, 'succeeded');
  assert.equal(executions[0].mergedCount, 1);
  assert.equal(executions[1].primary.result, 'failed');
  assert.equal(executions[1].mergedCount, 2);
  assert.equal(executions[1].level, 'error');
  assert.equal(executions[1].timeline.length, 2);
});

test('keeps events without a request id as separate executions', () => {
  // Given
  const events = [
    presentLogEvent({ timestamp: '2026-09-26T08:00:00.000Z', level: 'warn', area: 'runtime', event: 'log_file_write_failed' }),
    presentLogEvent({ timestamp: '2026-09-26T08:00:01.000Z', level: 'warn', area: 'runtime', event: 'log_file_write_failed' }),
  ];

  // When
  const executions = mergePresentedLogExecutions(events);

  // Then
  assert.deepEqual(executions.map((execution) => execution.mergedCount), [1, 1]);
  assert.deepEqual(summarizeLogExecutions(executions).warning, 2);
});

test('counts pending executions so a failed lifecycle is not double counted', () => {
  // Given
  const executions = mergePresentedLogExecutions([
    presentLogEvent({ timestamp: '2026-09-26T08:00:00.000Z', level: 'info', area: 'api', event: 'student_chat_started', requestId: 'req-1' }),
    presentLogEvent({ timestamp: '2026-09-26T08:00:02.000Z', level: 'error', area: 'api', event: 'student_chat_failed', requestId: 'req-1' }),
    presentLogEvent({ timestamp: '2026-09-26T08:01:00.000Z', level: 'warn', area: 'api', event: 'provider_health_check', requestId: 'req-3' }),
  ]);

  // When
  const summary = summarizeLogExecutions(executions);
  const pending = filterPresentedLogExecutions(executions, 'all', 'pending');

  // Then
  assert.equal(summary.executions, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.pending, 2);
  assert.equal(pending.length, 2);
  assert.equal(filterPresentedLogExecutions(executions, 'all', 'failed').length, 1);
  assert.equal(filterPresentedLogExecutions(executions, 'ai_service', 'all').length, 1);
});

test('reads every filter from the URL and falls back on unknown values', () => {
  // Given
  const params = {
    range: '7d',
    level: 'error',
    function: 'ai_service',
    result: 'pending',
    q: ' teacher_chat ',
    trace_id: ['req-9', 'req-8'],
    user_id: 'user-1',
  };

  // When
  const query = parseAdminLogQuery(params);

  // Then
  assert.deepEqual(query, {
    range: '7d',
    level: 'error',
    functionKey: 'ai_service',
    result: 'pending',
    search: 'teacher_chat',
    traceId: 'req-9',
    userId: 'user-1',
  });
  assert.deepEqual(parseAdminLogQuery({ range: 'yesterday', level: 'loud', function: 'nope', result: 'nope' }), {
    range: '24h',
    level: 'all',
    functionKey: 'all',
    result: 'all',
    search: '',
    traceId: '',
    userId: '',
  });
});

test('turns the time range into a server side lower bound', () => {
  // Given
  const now = new Date('2026-09-26T12:00:00.000Z');

  // When / Then
  assert.equal(logRangeStartIso('1h', now), '2026-09-26T11:00:00.000Z');
  assert.equal(logRangeStartIso('24h', now), '2026-09-25T12:00:00.000Z');
  assert.equal(logRangeStartIso('7d', now), '2026-09-19T12:00:00.000Z');
  assert.equal(logRangeStartIso('all', now), undefined);
});

test('keeps the remaining filters while switching quick views and pages', () => {
  // Given
  const query = parseAdminLogQuery({ range: '7d', level: 'warn', q: 'login', trace_id: 'req-3' });

  // When
  const pending = buildAdminLogHref(query, { result: 'pending', level: 'all' }, 2);
  const cleared = buildAdminLogHref(query, { result: 'all', level: 'all', range: '24h', search: '', traceId: '' });

  // Then
  assert.equal(pending, '/admin/logs?range=7d&result=pending&q=login&trace_id=req-3&page=2');
  assert.equal(cleared, '/admin/logs');
  // 全部时间在时间范围里是真实取值，不能被当成"不过滤"丢掉后回落成 24h。
  assert.equal(buildAdminLogHref(query, { range: 'all', result: 'all' }), '/admin/logs?range=all&level=warn&q=login&trace_id=req-3');
});

test('lists the merged lifecycle in the handoff report with the request id as the primary key', () => {
  // Given
  const executions = mergePresentedLogExecutions([
    presentLogEvent({ timestamp: '2026-09-26T08:00:00.000Z', level: 'info', area: 'api', event: 'student_chat_started', requestId: 'req-7', context: { trace_id: 'trace-7' } }),
    presentLogEvent({ timestamp: '2026-09-26T08:00:03.000Z', level: 'error', area: 'api', event: 'student_chat_failed', requestId: 'req-7', message: 'model timeout', context: { trace_id: 'trace-7' } }),
  ]);

  // When
  const report = buildDeveloperReport(executions[0].primary, executions[0].timeline);

  // Then
  assert.match(report, /请求 ID（主键）: req-7/);
  assert.match(report, /Trace ID（补充）: trace-7/);
  assert.match(report, /生命周期（2 条）/);
  assert.ok(report.indexOf('请求 ID（主键）') < report.indexOf('Trace ID（补充）'));
});
