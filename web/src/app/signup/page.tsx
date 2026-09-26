'use client';

import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUpTenant } from '@/lib/data/tenant-signup';

/**
 * 机构自助开通。
 *
 * 此前开一个新租户需要平台运营手工插库（建 organization → 建校 → 建 admin →
 * provision 账号）。租户开通是通用 SaaS 的第一道门，门本身不存在就谈不上多租户。
 * 兑换凭一次��� token；token 由公司管理员签发，明文只签发时返回一次。
 *
 * 页面级守卫是刻意不做的：这是未认证入口，登录页同一层级。
 * 真正的准入在 redeem_tenant_invite 事务里——令牌一次性、过期失效。
 */
export default function SignupPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ loginId: string; password: string } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIssued(null);
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const result = await signUpTenant({
        token: String(form.get('token') ?? '').trim(),
        organizationName: String(form.get('organizationName') ?? '').trim(),
        unitName: String(form.get('unitName') ?? '').trim(),
        adminLoginId: String(form.get('adminLoginId') ?? '').trim(),
        adminDisplayName: String(form.get('adminDisplayName') ?? '').trim(),
        adminPassword: String(form.get('adminPassword') ?? '') || undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setIssued({ loginId: result.adminLoginId, password: result.initialPassword });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '开通失败，请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-lg border-border/70 shadow-soft">
        <CardHeader>
          <CardTitle className="font-heading text-xl">机构开通</CardTitle>
          <CardDescription>
            兑换邀请凭据即可创建公司、下级单位与首位公司管理员。凭据由公司管理员签发。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>开通失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {issued ? (
            <Alert>
              <AlertTitle>开通成功，请立刻保存这两项</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  登录账号：<code className="font-medium">{issued.loginId}</code>
                </p>
                <p>
                  初始口令：<code className="font-medium">{issued.password}</code>
                </p>
                <p className="text-muted-foreground">
                  初始口令只在此处显示一次，系统不保存明文。首次登录会强制改密，请当场记录后关闭本页。
                </p>
                <a href="/login" className="inline-block text-sm underline underline-offset-4">
                  前往登录
                </a>
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">邀请凭据</Label>
                <Input id="token" name="token" required autoComplete="one-time-code" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizationName">公司名称</Label>
                <Input id="organizationName" name="organizationName" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitName">下级单位名称</Label>
                <Input id="unitName" name="unitName" required />
                <p className="text-xs text-muted-foreground">
                  可以是学校、校区、教培机构、工作室或教研联盟。单位类型由公司管理员后续调整。
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="adminLoginId">管理员账号</Label>
                  <Input id="adminLoginId" name="adminLoginId" required autoComplete="username" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminDisplayName">管理员姓名</Label>
                  <Input id="adminDisplayName" name="adminDisplayName" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adminPassword">初始口令（可留空）</Label>
                <Input id="adminPassword" name="adminPassword" type="password" autoComplete="new-password" />
                <p className="text-xs text-muted-foreground">留空则由系统生成一次性随机口令，在开通成功后显示一次。</p>
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? '正在开通…' : '开通并创建管理员'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                已有账号？<a href="/login" className="underline underline-offset-4">前往登录</a>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
