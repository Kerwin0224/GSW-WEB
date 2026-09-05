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
    text: '从一个字、一首诗、一篇文开始提问。AI 帮你梳理字词、意象和情感，一层一层读进深处。',
  },
  {
    icon: PenTool,
    label: '给老师',
    title: '把古诗文真正教好',
    text: '围绕课堂目标组织讲解、挑战和反馈。AI 的每个回答都可以审阅和修订，最终服务于课堂。',
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
    <main className="relative min-h-svh overflow-hidden text-foreground">
      {/* 登录品牌区是古典元素的主阵地，留足宣纸底色；体感靠 body 背景承载，这里只补一处柔光。 */}
      <div className="pointer-events-none absolute -top-40 right-[-10%] size-[36rem] rounded-full bg-primary/8 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-48 -left-20 size-[32rem] rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto grid min-h-svh w-full max-w-6xl items-center gap-10 px-5 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="space-y-10">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-lg border border-primary/15 bg-card/70 px-3 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BookOpenText className="size-4" aria-hidden="true" />
              </span>
              文韵智途 · 古诗文学习与教学平台
            </div>

            <div className="space-y-5">
              <p className="font-heading text-sm tracking-[0.35em] text-primary">博学 · 审问 · 慎思 · 明辨</p>
              <h1 className="font-heading text-5xl leading-[1.06] tracking-tight md:text-6xl xl:text-7xl">
                学好古诗文，
                <span className="block text-primary">教好古诗文。</span>
              </h1>
              <p className="max-w-2xl text-xl leading-9 text-muted-foreground">
                学生把文章读进去、说出来，老师把课堂讲清楚、练扎实。AI 负责陪伴和梳理，老师负责核实与把关。
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
                      <span className="rounded-md border bg-background/75 px-3 py-1 text-sm text-muted-foreground">{item.label}</span>
                      <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
          <Card flushHeader className="mx-auto w-full max-w-[29rem] overflow-hidden border-border/70 bg-card/92 shadow-[0_34px_110px_rgba(26,26,46,0.14)] backdrop-blur-xl">
            <div className="border-b bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_10%,transparent),color-mix(in_oklch,var(--accent)_10%,transparent))] p-7">
              <div className="mb-5 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Sparkles className="size-7" aria-hidden="true" />
              </div>
              <h2 className="font-heading text-3xl">登录</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                使用学校发放的学号或工号进入你的学习台。
              </p>
            </div>

            <CardContent className="space-y-6 p-7">
              <form onSubmit={handleLogin} className="space-y-5" aria-busy={loading}>
                {error ? (
                  <Alert variant="destructive" className="rounded-lg border-destructive/30 bg-destructive/10" role="alert">
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
                    className="h-12 rounded-lg border-border/80 bg-background/75 px-4 text-base shadow-inner"
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
                    className="h-12 rounded-lg border-border/80 bg-background/75 px-4 text-base shadow-inner"
                    required
                    autoComplete="current-password"
                    disabled={loading}
                  />
                </div>

                <Button type="submit" className="h-12 w-full rounded-lg text-base shadow-lg shadow-primary/20" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />
                      正在验证…
                    </>
                  ) : (
                    <>
                      登录
                      <ArrowRight className="ml-2 size-5" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-center text-xs leading-5 text-muted-foreground">
                初始密码与学号相同，首次登录后请及时修改。
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
