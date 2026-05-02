'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BookOpen, Loader2 } from 'lucide-react';

const roleHome: Record<string, string> = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
};

export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '登录失败');
        setLoading(false);
        return;
      }

      if (typeof data.role !== 'string' || !(data.role in roleHome)) {
        setError('账号缺少已验证角色，请联系管理员完成角色配置');
        setLoading(false);
        return;
      }

      window.location.href = roleHome[data.role];
    } catch {
      setError('登录时发生错误');
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-background px-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 size-80 rounded-full opacity-10"
          style={{ background: `radial-gradient(circle, hsl(var(--primary)), transparent 70%)` }}
        />
        <div
          className="absolute -bottom-40 -left-40 size-96 rounded-full opacity-10"
          style={{ background: `radial-gradient(circle, hsl(var(--bloom-6)), transparent 70%)` }}
        />
      </div>

      {/* Logo & title */}
      <div className="relative mb-8 text-center">
        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-primary/10 mb-4">
          <BookOpen className="size-8 text-primary" />
        </div>
        <h1 className="font-heading text-3xl tracking-wide">文韵智途</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          古诗文 AI 教学助手
        </p>
      </div>

      {/* Login card */}
      <Card className="relative w-full max-w-sm shadow-lg border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="font-heading text-lg text-center">登录</CardTitle>
          <CardDescription className="text-center">
            使用学号或教职工号登录
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="text-sm" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="loginId" className="text-sm">学号 / 工号</Label>
              <Input
                id="loginId"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="输入学号或教职工号"
                className="h-10"
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                className="h-10"
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="relative mt-8 text-xs text-muted-foreground">
        学校统一配发账号 · 请联系管理员获取
      </p>
    </div>
  );
}
