'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
        event: 'global_error_boundary',
        route: window.location.pathname,
        message: error.message,
        digest: error.digest,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#faf8f1', color: '#2d2d2d' }}>
          <section style={{ maxWidth: 560, border: '1px solid #d9d0c1', borderRadius: 20, background: 'white', padding: 28 }}>
            <p style={{ margin: 0, color: '#c04851', fontSize: 14 }}>运行异常已记录</p>
            <h1 style={{ margin: '8px 0 12px', fontSize: 28 }}>文韵智途暂时没有稳定打开</h1>
            <p style={{ margin: 0, lineHeight: 1.7 }}>请重试当前页面；系统会把错误摘要写入本地日志，便于管理员定位。</p>
            <button type="button" onClick={() => unstable_retry()} style={{ marginTop: 20, borderRadius: 12, border: 0, background: '#4a6fa5', color: 'white', padding: '10px 16px' }}>
              重新加载
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
