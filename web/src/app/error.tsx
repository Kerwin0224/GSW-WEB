'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, RotateCcw } from 'lucide-react';

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
      <div className="w-full space-y-4">
        <ErrorState
          title="当前页面没有稳定渲染"
          description="系统已记录异常。你可以重试当前页面；如果再次出现，请到管理端日志页查看 requestId 与错误时间。"
          action={(
            <span className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => unstable_retry()}>
                <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                重新加载
              </Button>
              {/* 明确的返回路径：错误页常常是死路，这里必须给一条能走人的路。
                  / 按角色重定向（已登录回工作台，未登录回登录页），用 next/link 走客户端跳转。 */}
              <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
                <Home className="mr-2 size-4" aria-hidden="true" />
                返回工作台
              </Button>
            </span>
          )}
        />
        {/* digest 是服务端错误边界的唯一编号，用户报障时只要这一串就能定位。 */}
        {error.digest ? (
          <p className="px-1 text-xs text-muted-foreground">
            错误编号：<code className="font-mono text-foreground">{error.digest}</code>
          </p>
        ) : null}
      </div>
    </main>
  );
}
