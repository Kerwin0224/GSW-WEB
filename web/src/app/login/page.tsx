'use client';

import { useState } from 'react';
import { ArrowRight, BookOpenText, Loader2 } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const roleHome: Record<string, string> = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
  org_admin: '/org',
};

type LoginCandidate = {
  schoolId: string | null;
  schoolName: string | null;
  organizationName: string | null;
  role: string;
  displayName: string;
};

export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<LoginCandidate[] | null>(null);

  const handleLogin = async (schoolId?: string) => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password, ...(schoolId ? { schoolId } : {}) }),
      });

      const data = (await response.json()) as {
        error?: string;
        role?: string;
        redirectTo?: string;
        ambiguous?: boolean;
        candidates?: LoginCandidate[];
      };

      // 学号在多校重名：内部消歧，由用户点选所在学校（无需输入学校码）。
      if (data.ambiguous && data.candidates?.length) {
        setCandidates(data.candidates);
        setLoading(false);
        return;
      }

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

      // 初始密码=学号/工号的账号首登会被引导到 /settings?required=1 强制改密。
      window.location.assign(data.redirectTo ?? roleHome[data.role]);
    } catch {
      setError('当前服务暂不可用，请稍后再试。');
      setLoading(false);
    }
  };

  const submitForm = (event: React.FormEvent) => {
    event.preventDefault();
    void handleLogin();
  };

  return (
    <main className="relative min-h-svh overflow-hidden text-foreground">
      {/* 登录品牌区是古典元素的主阵地，留足宣纸底色；体感靠 body 背景承载，这里只补一处柔光。 */}
      <div className="pointer-events-none absolute -top-40 right-[-10%] size-[36rem] rounded-full bg-primary/8 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-48 -left-20 size-[32rem] rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto grid min-h-svh w-full max-w-6xl content-center gap-6 px-5 py-8 lg:grid-cols-2 lg:items-center lg:gap-x-16 lg:px-10">
        <section className="lg:self-end">
          <div className="space-y-5 lg:space-y-8">
            <div className="inline-flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BookOpenText className="size-4" aria-hidden="true" />
              </span>
              <span className="font-heading text-xl text-foreground">文韵智途</span>
            </div>

            <div className="space-y-5">
              <h1 className="text-balance font-heading text-3xl leading-tight tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl">
                读懂一篇，
                <span className="text-primary lg:block">学深一步。</span>
              </h1>
              <p className="max-w-md text-base leading-7 text-muted-foreground">
                古诗文学习与教学平台，让提问、练习和备课更有依据。
              </p>
            </div>
          </div>

        </section>

        <section className="lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-labelledby="login-heading">
          <Card flushHeader className="mx-auto w-full max-w-[29rem] overflow-hidden border-border/70 bg-card/92 shadow-[0_34px_110px_rgba(26,26,46,0.14)] backdrop-blur-xl">
            <div className="border-b border-border/70 p-6 sm:p-8">
              <h2 id="login-heading" className="text-2xl font-semibold">账号登录</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                使用学校发放的学号或工号。
              </p>
            </div>

            <CardContent className="space-y-6 p-6 sm:p-8">
              <form onSubmit={submitForm} className="space-y-5" aria-busy={loading}>
                {error ? (
                  <Alert variant="destructive" className="rounded-lg border-destructive/30 bg-destructive/10" role="alert">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                {candidates ? (
                  <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3" role="radiogroup" aria-label="选择你所在的学校">
                    <p className="text-sm font-medium text-foreground">该学号在多个学校存在，请选择你所在的学校：</p>
                    {candidates.map((candidate) => (
                      <button
                        key={candidate.schoolId ?? 'none'}
                        type="button"
                        disabled={loading}
                        onClick={() => { if (candidate.schoolId) void handleLogin(candidate.schoolId); }}
                        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/85 px-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{candidate.schoolName ?? '未归属学校'}</span>
                          <span className="text-xs text-muted-foreground">{candidate.organizationName ?? ''} · {candidate.displayName}</span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-2.5">
                  <Label htmlFor="loginId" className="text-sm font-medium">学号 / 工号</Label>
                  <Input
                    id="loginId"
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    placeholder="输入学号或工号"
                    className="h-12 rounded-lg border-border/80 bg-background/75 px-4 text-base shadow-inner"
                    required
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
                      登录中…
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
                账号或密码有问题？请联系学校管理员。
              </p>
            </CardContent>
          </Card>
        </section>
        <section className="space-y-4 border-t border-border/70 pt-5 lg:col-start-1 lg:row-start-2 lg:self-start" aria-label="使用场景">
          <dl className="space-y-3 text-sm leading-6">
            <div className="flex gap-4"><dt className="shrink-0 font-medium">学生</dt><dd className="text-muted-foreground">问字词、读篇章，用挑战练习检验理解。</dd></div>
            <div className="flex gap-4"><dt className="shrink-0 font-medium">教师</dt><dd className="text-muted-foreground">辅助备课、查看学情、审核 AI 回答。</dd></div>
          </dl>
          <p className="text-xs leading-5 text-muted-foreground">AI 回答仅供参考，请结合原文与教师指导核实。</p>
        </section>
      </div>
    </main>
  );
}
