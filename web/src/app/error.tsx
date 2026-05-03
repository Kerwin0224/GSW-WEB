'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/workbench/state-surfaces';

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    void fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'error',
        area: 'client',
        event: 'app_error_boundary',
        route: window.location.pathname,
        message: error.message,
        digest: error.digest,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center px-6 py-12">
      <ErrorState
        title="当前页面没有稳定渲染"
        description="系统已记录异常。你可以重试当前页面；如果再次出现，请到管理端日志页查看 requestId 与错误时间。"
        action={(
          <Button type="button" onClick={() => unstable_retry()}>
            <RotateCcw className="mr-2 size-4" />
            重新加载
          </Button>
        )}
      />
    </main>
  );
}
