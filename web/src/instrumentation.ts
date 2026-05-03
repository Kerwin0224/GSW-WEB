import type { Instrumentation } from 'next';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      area: 'runtime',
      event: 'next_server_started',
    }));
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const message = error instanceof Error ? error.message : 'unknown request error';
  const digest = typeof error === 'object' && error && 'digest' in error && typeof error.digest === 'string' ? error.digest : undefined;

  const event = {
    level: 'error' as const,
    area: context.routeType === 'proxy' ? ('proxy' as const) : context.routeType === 'route' ? ('api' as const) : ('render' as const),
    event: 'next_request_error',
    route: context.routePath,
    method: request.method,
    message,
    digest,
    context: {
      path: request.path,
      routerKind: context.routerKind,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
  };

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { writeLogEvent } = await import('@/lib/observability/server-log-store');
    await writeLogEvent(event);
    return;
  }

  console.error(JSON.stringify({ ...event, timestamp: new Date().toISOString() }));
};
