'use client';

import { useState } from 'react';
import { Lightbulb } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { BloomBadge } from '@/components/workbench/bloom-badge';
import { BlockedState, ErrorState, LoadingSurface, PermissionState, SuccessState } from '@/components/workbench/state-surfaces';

export default function ChallengePage() {
  const [answer, setAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);
  const providerReady = false;
  const loading = false;
  const permissionDenied = false;
  const evaluationError: string | null = null;
  const evaluationCommitted = false;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-heading text-3xl">层级挑战</h1>
        <p className="mt-1 text-sm text-muted-foreground">选择真实篇目与目标布鲁姆层级后生成练习；缺少模型能力时不会生成模拟题。</p>
      </div>
      <div className="flex items-center gap-2" aria-label="布鲁姆层级进度">{[1, 2, 3, 4, 5, 6].map((level) => <BloomBadge key={level} level={level} className="opacity-70" />)}</div>
      {loading ? <LoadingSurface label="正在加载挑战入口" /> : null}
      {permissionDenied ? <PermissionState title="无法进入层级挑战" description="当前账号缺少学生项目访问范围。" /> : null}
      {!providerReady ? <BlockedState title="练习生成与评估被阻塞" description="缺少 practice_generation / practice_evaluation 真实模型能力配置。请管理员配置 Provider 后再生成挑战。" /> : null}
      {evaluationError ? <ErrorState title="评估失败" description={evaluationError} /> : null}
      {evaluationCommitted ? <SuccessState title="评估已保存" description="真实模型评估完成后，系统会保留作答并给出下一步建议。" /> : null}
      <Card>
        <CardHeader><CardTitle className="font-heading">目标层级挑战</CardTitle><CardDescription>题目会由真实项目与 Provider 生成。</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="生成真实题目后，在此保留你的作答。评估失败也不会清空。" className="min-h-32" />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowHint((value) => !value)}><Lightbulb className="mr-2 size-4" />{showHint ? '隐藏提示' : '需要提示'}</Button>
            <Button disabled={!providerReady || !answer.trim()}>提交答案</Button>
          </div>
          {showHint ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">提示会随真实题目生成；当前仅显示作答区，不伪造练习内容。</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
