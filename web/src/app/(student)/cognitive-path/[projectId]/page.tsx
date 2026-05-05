import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp } from 'lucide-react';

import { getAppSession } from '@/lib/session';
import { getCognitivePath, type BloomLevel } from '@/lib/bloom-engine';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const BLOOM_LABELS: Record<BloomLevel, string> = {
  1: '记忆',
  2: '理解',
  3: '应用',
  4: '分析',
  5: '评价',
  6: '创造',
};

const BLOOM_HINTS: Record<BloomLevel, string> = {
  1: '背诵、识记、找出处',
  2: '解释、翻译、概括',
  3: '套用、迁移、举例',
  4: '比较、拆解、找关系',
  5: '判断、论证、评价',
  6: '仿写、创作、重组',
};

const BLOOM_COLORS: Record<BloomLevel, string> = {
  1: 'hsl(210, 100%, 56%)',
  2: 'hsl(195, 100%, 50%)',
  3: 'hsl(165, 100%, 38%)',
  4: 'hsl(45, 100%, 51%)',
  5: 'hsl(30, 100%, 50%)',
  6: 'hsl(0, 84%, 60%)',
};

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function CognitivePathPage({ params }: PageProps) {
  const session = await getAppSession();
  if (!session) {
    redirect('/login');
  }

  const { projectId } = await params;
  const cognitivePath = await getCognitivePath(projectId, session.sub);

  if (!cognitivePath) {
    notFound();
  }

  const { projectTitle, levels, maxLevel, unlockedCount, totalQuestions } = cognitivePath;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/student/projects" />}
          className="gap-2"
        >
          <ArrowLeft className="size-4" />
          返回项目列表
        </Button>

        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">{projectTitle}</h1>
          <p className="text-muted-foreground">
            布鲁姆认知路径 · 追踪你在六个认知层级的学习进展
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card size="sm">
            <CardContent className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{totalQuestions}</div>
                <div className="text-xs text-muted-foreground">总问题数</div>
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{unlockedCount}/6</div>
                <div className="text-xs text-muted-foreground">已触及层级</div>
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">
                  {maxLevel ? `L${maxLevel}` : '--'}
                </div>
                <div className="text-xs text-muted-foreground">当前最高层级</div>
              </div>
              {maxLevel && (
                <TrendingUp className="size-5 text-muted-foreground" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cognitive Ladder */}
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">认知阶梯</h2>
        <div className="space-y-3">
          {([6, 5, 4, 3, 2, 1] as BloomLevel[]).map((level) => {
            const levelData = levels.find((l) => l.level === level);
            const count = levelData?.count || 0;
            const isUnlocked = count > 0;
            const isCurrent = level === maxLevel;

            return (
              <Card
                key={level}
                className={cn(
                  'transition-all',
                  !isUnlocked && 'border-dashed opacity-60',
                  isCurrent && 'ring-2 ring-primary ring-offset-2'
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          className="font-heading tracking-wider border-2 border-current/20 shadow-sm"
                          style={{
                            backgroundColor: BLOOM_COLORS[level],
                            color: 'white',
                          }}
                        >
                          L{level} {BLOOM_LABELS[level]}
                        </Badge>
                        {isCurrent && (
                          <Badge variant="outline" className="text-xs">
                            当前最高
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm">
                        {BLOOM_HINTS[level]}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{count}</div>
                      <div className="text-xs text-muted-foreground">问题</div>
                    </div>
                  </div>
                </CardHeader>
                {isUnlocked && levelData && levelData.questions.length > 0 && (
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        最近问题
                      </div>
                      <div className="space-y-1.5">
                        {levelData.questions.slice(0, 3).map((question) => (
                          <div
                            key={question.id}
                            className="rounded-md bg-muted/50 px-3 py-2 text-sm"
                          >
                            {question.content}
                          </div>
                        ))}
                        {levelData.questions.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            还有 {levelData.questions.length - 3} 个问题...
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <Card>
        <CardHeader>
          <CardTitle>关于布鲁姆认知分类</CardTitle>
          <CardDescription>
            布鲁姆认知分类法将学习目标分为六个层级，从低到高依次为：记忆、理解、应用、分析、评价、创造。
            每个层级代表不同的认知深度，帮助你了解自己的学习进展。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
