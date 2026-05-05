'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Lightbulb, Loader2, Lock, RefreshCw, Sparkles, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { BloomBadge, bloomLevelInfo, type BloomLevel } from '@/components/workbench/bloom-badge';
import { cn } from '@/lib/utils';

type ChallengeState = 'idle' | 'loading' | 'ready' | 'submitting' | 'evaluated';

type ChallengeStructuredQuestion = {
  label: string;
  prompt: string;
  requiredEvidence: string;
};

type ChallengeData = {
  id: string;
  projectId: string;
  projectTitle: string;
  targetLevel: number;
  prompt: string;
  structuredQuestions: ChallengeStructuredQuestion[];
};

type EvaluationResult = {
  achieved: boolean;
  feedback: string;
};

type ChallengeLevelState = 'achieved' | 'current' | 'locked';

type ChallengeLevelProgress = {
  level: number;
  state: ChallengeLevelState;
};

type ChallengeClimbProgress = {
  currentLevel: number;
  completedLevels: number;
  isComplete: boolean;
  levels: ChallengeLevelProgress[];
};

export function ChallengeClient({
  projectId,
  projectTitle,
  initialLevel,
  progress,
}: {
  projectId: string;
  projectTitle: string;
  initialLevel: BloomLevel;
  progress: ChallengeClimbProgress;
}) {
  const [targetLevel, setTargetLevel] = useState<BloomLevel>(initialLevel);
  const [state, setState] = useState<ChallengeState>('idle');
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  const generate = async (level: BloomLevel) => {
    if (progress.isComplete || level !== progress.currentLevel) {
      setError(progress.isComplete ? 'L1 到 L6 已全部达标，请回到项目详情查看挑战核查证据。' : `请先完成当前 L${progress.currentLevel} 挑战，达标后才能进入下一层。`);
      setTargetLevel(progress.currentLevel as BloomLevel);
      return;
    }

    setState('loading');
    setError(null);
    setChallenge(null);
    setAnswer('');
    setEvaluation(null);
    setShowHint(false);
    setTargetLevel(level);

    try {
      const response = await fetch('/api/challenge/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, targetLevel: level }),
      });
      const data = await response.json();
      if (!response.ok || 'error' in data) {
        setError(data.resolution ? `${data.error}：${data.resolution}` : data.error || '生成题目失败');
        setState('idle');
        return;
      }
      setChallenge(data);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络请求失败');
      setState('idle');
    }
  };

  const submit = async () => {
    if (!challenge || !answer.trim()) return;
    setState('submitting');
    setError(null);

    try {
      const response = await fetch('/api/challenge/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.id, answer: answer.trim() }),
      });
      const data = await response.json();
      if (!response.ok || 'error' in data) {
        setError(data.resolution ? `${data.error}：${data.resolution}` : data.error || '评判失败');
        setState('ready');
        return;
      }
      setEvaluation(data);
      setState('evaluated');
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络请求失败');
      setState('ready');
    }
  };

  const achieved = state === 'evaluated' && evaluation?.achieved;

  return (
    <div className={cn('min-h-[calc(100vh-4rem)] bg-background px-4 py-4 transition-all duration-700 sm:px-6', achieved && 'scale-[1.01] opacity-95')}>
      <div className="mx-auto grid min-h-[calc(100vh-6rem)] max-w-7xl gap-4 lg:grid-cols-[5rem_minmax(0,1fr)_20rem]">
        <aside className="order-2 flex rounded-xl border bg-card p-3 lg:order-1 lg:flex-col" aria-label="挑战进度">
          {progress.levels.map((levelProgress) => {
            const level = levelProgress.level as BloomLevel;
            const locked = levelProgress.state === 'locked' || progress.isComplete;
            return (
              <button
                key={level}
                type="button"
                onClick={() => generate(level)}
                disabled={locked || state === 'loading' || state === 'submitting'}
                className={cn(
                  'flex flex-1 items-center justify-center rounded-lg border text-xs font-medium transition lg:flex-none lg:py-4',
                  level === targetLevel ? 'border-transparent shadow-sm' : 'border-border bg-background hover:bg-muted',
                  locked && 'cursor-not-allowed opacity-45 hover:bg-background',
                  levelProgress.state === 'achieved' && level !== targetLevel && 'border-transparent bg-accent/15 text-accent-foreground',
                )}
                style={level === targetLevel ? { backgroundColor: `var(--bloom-${level})`, color: `var(--bloom-${level}-fg)` } : undefined}
                aria-label={locked ? `L${level} ${bloomLevelInfo[level].label} 尚未解锁` : `生成 L${level} ${bloomLevelInfo[level].label} 挑战`}
              >
                <span className="flex items-center gap-1">
                  {locked ? <Lock className="size-3" aria-hidden="true" /> : null}
                  L{level}
                </span>
              </button>
            );
          })}
        </aside>

        <main className="order-1 space-y-4 lg:order-2" aria-label="层级挑战作答区">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/student/projects/${projectId}`} />}>
              <ArrowLeft className="mr-2 size-4" />
              返回篇目
            </Button>
            <BloomBadge level={targetLevel} />
          </div>

          <Card className="min-h-[20rem] border-primary/20 shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-2xl">《{projectTitle}》层级挑战</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {state === 'idle' ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <p className="font-heading text-xl">从当前解锁层级 L{progress.currentLevel} 开始挑战</p>
                  <p className="mt-2 text-sm text-muted-foreground">挑战用于核查能力：L1 到 L6 必须逐层达标，未达标会停留在当前层补强。</p>
                </div>
              ) : null}

              {state === 'loading' ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-3" aria-live="polite">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">正在生成 L{targetLevel} 挑战题...</p>
                </div>
              ) : null}

              {error ? (
                <Alert variant="destructive">
                  <XCircle className="size-4" aria-hidden="true" />
                  <AlertTitle>挑战暂不可用</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {challenge ? (
                <div className="space-y-4">
                  <div className="rounded-xl border bg-muted/60 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">结构化核查题</p>
                    <p className="mt-2 text-sm text-muted-foreground">按三步作答：先给文本证据，再完成目标层级任务，最后说明为什么达标。</p>
                  </div>
                  <div className="grid gap-3">
                    {challenge.structuredQuestions.map((question, index) => (
                      <article key={`${question.label}-${index}`} className="rounded-xl border bg-background p-4">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{index + 1}</span>
                          <h3 className="font-heading text-lg">{question.label}</h3>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-base leading-8">{question.prompt}</p>
                        <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm leading-6 text-muted-foreground">要求：{question.requiredEvidence}</p>
                      </article>
                    ))}
                  </div>
                  {state !== 'evaluated' ? (
                    <>
                      <Textarea
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        placeholder="按 1/2/3 三步回答：证据定位、层级任务、自我校验。"
                        className="min-h-40 bg-background"
                        disabled={state === 'submitting'}
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setShowHint((value) => !value)} disabled={state === 'submitting'}>
                          <Lightbulb className="mr-2 size-4" />
                          {showHint ? '隐藏提示' : '需要提示'}
                        </Button>
                        <Button type="button" onClick={submit} disabled={!answer.trim() || state === 'submitting'}>
                          {state === 'submitting' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                          提交答案
                        </Button>
                      </div>
                    </>
                  ) : null}
                  {showHint ? (
                    <div className="rounded-lg border bg-background/80 p-3 text-sm leading-6 text-muted-foreground">
                      检查你的答案是否已经写清三件事：可核对的原文依据、L{targetLevel} {bloomLevelInfo[targetLevel].label} 的具体操作、以及为什么可以判定达标。
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {evaluation ? (
            <Alert className={evaluation.achieved ? 'border-accent/40 bg-accent/10' : 'border-destructive/30 bg-destructive/5'}>
              {evaluation.achieved ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              <AlertTitle className="font-heading">{evaluation.achieved ? '突破成功' : '先回到上一层补强'}</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap">{evaluation.feedback}</AlertDescription>
            </Alert>
          ) : null}
        </main>

        <aside className="order-3 space-y-4" aria-label="挑战操作">
          <Card>
            <CardHeader><CardTitle>当前目标</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <BloomBadge level={targetLevel} />
              <p>{bloomLevelInfo[targetLevel].hint}</p>
              <Button type="button" className="w-full" onClick={() => generate(targetLevel)} disabled={progress.isComplete || state === 'loading' || state === 'submitting'}>
                <Sparkles className="mr-2 size-4" />
                {progress.isComplete ? '挑战已完成' : challenge ? '换一题' : '生成挑战'}
              </Button>
              {evaluation && !evaluation.achieved ? (
                <Button type="button" variant="outline" className="w-full" onClick={() => { setAnswer(''); setEvaluation(null); setState('ready'); }}>
                  <RefreshCw className="mr-2 size-4" />
                  重新作答
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
