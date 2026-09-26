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

  // 这里替换的是根 layout，Tailwind 产物与路由运行时都可能已经不可用，
  // 所以保留内联样式、不引 next/link：恢复动作必须退回到原生 <a>。
  return (
    <html lang="zh-CN">
      <body>
        <main
          role="alert"
          style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--background, #FAF8F1)', color: 'var(--foreground, #2D2D2D)', fontFamily: 'system-ui, sans-serif' }}
        >
          <section style={{ maxWidth: 560, border: '1px solid var(--border, #D9D0C1)', borderRadius: 'var(--radius, 8px)', background: 'var(--card, #FFFFFF)', padding: 28 }}>
            <p style={{ margin: 0, color: 'var(--destructive, #C04851)', fontSize: 14 }}>运行异常已记录</p>
            <h1 style={{ margin: '8px 0 12px', fontSize: 28 }}>文韵智途暂时没有稳定打开</h1>
            <p style={{ margin: 0, lineHeight: 1.7 }}>请重试当前页面；系统会把错误摘要写入本地日志，便于管理员定位。</p>
            <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => unstable_retry()}
                style={{ borderRadius: 'var(--radius, 8px)', border: 0, background: 'var(--primary, #4A6FA5)', color: 'var(--primary-foreground, #FFFFFF)', padding: '10px 16px', cursor: 'pointer' }}
              >
                重新加载
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 根 layout 已被替换，next/link 运行时不可用 */}
              <a
                href="/"
                style={{ borderRadius: 'var(--radius, 8px)', border: '1px solid var(--border, #D9D0C1)', background: 'transparent', color: 'var(--foreground, #2D2D2D)', padding: '10px 16px', textDecoration: 'none' }}
              >
                返回工作台
              </a>
            </div>
            {error.digest ? (
              <p style={{ margin: '18px 0 0', fontSize: 12, opacity: 0.75 }}>
                错误编号：<code>{error.digest}</code>
              </p>
            ) : null}
          </section>
        </main>
      </body>
    </html>
  );
}
