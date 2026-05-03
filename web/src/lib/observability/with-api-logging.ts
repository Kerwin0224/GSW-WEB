import { createRequestId, type LogEvent } from '@/lib/observability/log-event';
import { writeLogEvent } from '@/lib/observability/server-log-store';

export async function withApiLogging<T>(
  request: Request,
  event: Pick<LogEvent, 'area' | 'event' | 'route'> & { context?: Record<string, unknown> },
  handler: (requestId: string) => Promise<T>,
) {
  const requestId = createRequestId(event.area);
  const startedAt = Date.now();
  await writeLogEvent({
    level: 'info',
    area: event.area,
    event: `${event.event}_started`,
    requestId,
    route: event.route,
    method: request.method,
    context: event.context,
  });

  try {
    const result = await handler(requestId);
    const status = typeof result === 'object' && result && 'status' in result && typeof result.status === 'number' ? result.status : 200;
    await writeLogEvent({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      area: event.area,
      event: `${event.event}_completed`,
      requestId,
      route: event.route,
      method: request.method,
      status,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    await writeLogEvent({
      level: 'error',
      area: event.area,
      event: `${event.event}_failed`,
      requestId,
      route: event.route,
      method: request.method,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    throw error;
  }
}
