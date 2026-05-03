'use client';

import { useState } from 'react';
import { ArrowRight, BookOpenText, GraduationCap, Loader2, PenTool, Sparkles } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const roleHome: Record<string, string> = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
};

const promises = [
  {
    icon: GraduationCap,
    label: '给学生',
    title: '把古诗文真正读懂',
    text: '从一句话、一首诗、一篇文开始提问；平台陪你梳理字词、意象、情感和表达，最后形成自己的理解。',
  },
  {
    icon: PenTool,
    label: '给老师',
    title: '把古诗文真正教好',
    text: '从课堂目标出发组织讲解、练习和反馈；AI 只做可审阅的教学助手，最终服务于一节更清楚的课。',
  },
] as const;

export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });

      const data = (await response.json()) as { error?: string; role?: string };

      if (!response.ok) {
        setError(data.error || '登录失败，请检查账号或联系管理员。');
        setLoading(false);
        return;
      }

      if (typeof data.role !== 'string' || !(data.role in roleHome)) {
        setError('账号暂未开通，请联系学校管理员。');
        setLoading(false);
        return;
      }

      window.location.href = roleHome[data.role];
    } catch {
      setError('当前服务暂不可用，请稍后再试。');
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_30%),linear-gradient(135deg,color-mix(in_oklch,var(--background)_88%,white),var(--background))]" />
        <div className="absolute left-1/2 top-0 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/10" />
        <div className="absolute bottom-10 right-10 hidden h-64 w-64 rounded-full border border-accent/20 lg:block" />
      </div>

      <div className="relative mx-auto grid min-h-svh w-full max-w-6xl items-center gap-10 px-5 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="space-y-10">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/70 px-3 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <BookOpenText className="size-4" aria-hidden="true" />
              </span>
              文韵智途 · 古诗文学习与教学平台
            </div>

            <div className="space-y-5">
              <p className="font-heading text-sm tracking-[0.35em] text-primary">LEARN WELL · TEACH WELL</p>
              <h1 className="font-heading text-5xl leading-[1.06] tracking-tight md:text-6xl xl:text-7xl">
                学好古诗文，
                <span className="block text-primary">教好古诗文。</span>
              </h1>
              <p className="max-w-2xl text-xl leading-9 text-muted-foreground">
                这不是一个信息面板。它只服务两条主线：学生把文本读进去、说出来；老师把课堂讲清楚、练扎实。
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {promises.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label} className="border-border/70 bg-card/78 shadow-[0_22px_70px_rgba(45,38,24,0.09)] backdrop-blur">
                  <CardContent className="space-y-5 p-6">
                    <div className="flex items-center justify-between gap-4">
                      <span className="rounded-full border bg-background/75 px-3 py-1 text-sm text-muted-foreground">{item.label}</span>
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="space-y-2">
                      <h2 className="font-heading text-2xl">{item.title}</h2>
                      <p className="text-sm leading-7 text-muted-foreground">{item.text}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <Card className="mx-auto w-full max-w-[29rem] overflow-hidden border-border/70 bg-card/92 shadow-[0_34px_110px_rgba(26,26,46,0.14)] backdrop-blur-xl">
            <div className="border-b bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_10%,transparent),color-mix(in_oklch,var(--accent)_10%,transparent))] p-7">
              <div className="mb-5 flex size-14 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Sparkles className="size-7" aria-hidden="true" />
              </div>
              <h2 className="font-heading text-3xl">进入平台</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                使用学校配发的 8 位学号或工号登录，进入你的学习台或教学台。
              </p>
            </div>

            <CardContent className="space-y-6 p-7">
              <form onSubmit={handleLogin} className="space-y-5" aria-busy={loading}>
                {error ? (
                  <Alert variant="destructive" className="rounded-2xl border-destructive/30 bg-destructive/10" role="alert">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="space-y-2.5">
                  <Label htmlFor="loginId" className="text-sm font-medium">学号 / 工号</Label>
                  <Input
                    id="loginId"
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    placeholder="例如：20260101 或 20240001"
                    className="h-12 rounded-2xl border-border/80 bg-background/75 px-4 text-base shadow-inner"
                    required
                    autoFocus
                    autoComplete="username"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="password" className="text-sm font-medium">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="输入密码"
                    className="h-12 rounded-2xl border-border/80 bg-background/75 px-4 text-base shadow-inner"
                    required
                    autoComplete="current-password"
                    disabled={loading}
                  />
                </div>

                <Button type="submit" className="h-12 w-full rounded-2xl text-base shadow-lg shadow-primary/20" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />
                      正在验证…
                    </>
                  ) : (
                    <>
                      开始学习或教学
                      <ArrowRight className="ml-2 size-5" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-center text-xs leading-5 text-muted-foreground">
                初始密码与学号/工号相同；首次登录后按学校要求修改。
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
