import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildDeveloperReport,
  filterPresentedLogEvents,
  presentLogEvent,
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
  assert.equal(presented.healthClaim, 'not_available');
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
