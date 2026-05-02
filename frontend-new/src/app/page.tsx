import { BookOpen, GraduationCap, ShieldCheck, Users } from 'lucide-react';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getUser } from '@/lib/auth';

const roleHome = { student: '/student', teacher: '/teacher', admin: '/admin' } as const;

export default async function Home() {
  const user = await getUser();
  if (user?.role && user.role in roleHome) redirect(roleHome[user.role as keyof typeof roleHome]);

  return (
    <main className="min-h-svh bg-background px-4 py-10">
      <section className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-5xl flex-col justify-center">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground">
              <BookOpen className="size-4 text-primary" aria-hidden="true" />
              古诗文 AI 教学助手
            </div>
            <div className="space-y-4">
              <h1 className="font-heading text-5xl leading-tight tracking-wide md:text-6xl">文韵智途</h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                面向学校的古典中文 AI 工作台：学生沿布鲁姆认知路径学习，教师使用治理后的教学预设与审计标注，管理员统一配置模型、班级、MCP 与数据集导出。
              </p>
            </div>
            <Button render={<a href="/login">进入登录</a>} size="lg" className="rounded-xl" />
          </div>

          <Card className="border-border/70 bg-card/90 shadow-lg">
            <CardContent className="space-y-4 p-6">
              {[
                { icon: GraduationCap, title: '学生', text: '提问、篇目项目、层级挑战与学习画像。' },
                { icon: Users, title: '教师', text: '教学对话、Prompt 预设、审计标注与学情线索。' },
                { icon: ShieldCheck, title: '管理员', text: '系统配置、Provider 能力、MCP、用户班级与数据导出。' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border bg-background/70 p-4">
                  <div className="mb-2 flex items-center gap-2 font-heading text-lg">
                    <item.icon className="size-5 text-primary" aria-hidden="true" />
                    {item.title}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
