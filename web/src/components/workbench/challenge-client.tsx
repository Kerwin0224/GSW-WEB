'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, RotateCcw, Swords } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownContent } from '@/components/workbench/markdown-content';
import { BloomBadge, bloomLevelInfo, type BloomLevel } from '@/components/workbench/bloom-badge';
import { BlockedState, ErrorState } from '@/components/workbench/state-surfaces';
import type { Database } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';

type PracticeRecord = Database['public']['Tables']['practice_records']['Row'];
type ChallengeState = 'idle' | 'generating' | 'pending' | 'evaluating' | 'evaluated' | 'blocked' | 'failed' | 'error';
type ApiIssue = { message?: string };
type ApiIssueBag = ApiIssue[] | { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> };
type ApiError = { state?: ChallengeState | string; error?: string; resolution?: string; issues?: ApiIssueBag };

function getIssueMessages(issues: ApiIssueBag | undefined) {
  if (Array.isArray(issues)) return issues.map((issue) => issue.message).filter(Boolean);
  if (!issues || typeof issues !== 'object') return [];
  const formErrors = Array.isArray(issues.formErrors) ? issues.formErrors.filter(Boolean) : [];
  const fieldErrors = Object.values(issues.fieldErrors ?? {}).flatMap((messages) => Array.isArray(messages) ? messages.filter(Boolean) : []);
  return [...formErrors, ...fieldErrors];
}

function isPracticeRecord(value: unknown): value is PracticeRecord {
  return Boolean(value && typeof value === 'object' && 'id' in value && 'target_bloom_level' in value);
}

function parseApiError(value: unknown, fallback: string) {
  const error = value as ApiError;
  const issueMessage = getIssueMessages(error.issues).join('；');
  return {
    state: error.state,
    message: [error.error, error.resolution, issueMessage].filter(Boolean).join('：') || fallback,
  };
}

function initialChallengeState(practice?: PracticeRecord): ChallengeState {
  if (!practice) return 'idle';
  if (practice.evaluation_state === 'evaluated') return 'evaluated';
  if (practice.evaluation_state === 'failed') return 'failed';
  if (practice.evaluation_state === 'blocked') return 'blocked';
  return 'pending';
}

function LevelRoute({ currentLevel, targetLevel }: { currentLevel?: number | null; targetLevel: BloomLevel }) {
  return (
    <div className="grid gap-3 md:grid-cols-6">
      {([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => {
        const info = bloomLevelInfo[level];
        const reached = Boolean(currentLevel && level <= currentLevel);
        const isTarget = level === targetLevel;
        return (
          <div key={level} className={cn('rounded-lg border bg-background/70 p-4', reached && 'border-primary/30 bg-primary/5', isTarget && 'ring-2 ring-primary/30')}>
            <BloomBadge level={level} className={reached || isTarget ? undefined : 'opacity-70'} />
            <p className="mt-3 text-sm font-medium">{info.hint}</p>
            <p className="mt-1 text-xs text-muted-foreground">{reached ? '已确认' : isTarget ? '当前挑战' : '待攀登'}</p>
          </div>
        );
      })}
    </div>
  );
}

export function ChallengeClient({
  projectId,
  projectTitle,
  projectAuthor,
  confirmedLevel,
  initialPractice,
  challengeBlocked,
  challengeStatusLabel,
  isComplete = false,
}: {
  projectId: string;
  projectTitle: string;
  projectAuthor?: string | null;
  confirmedLevel?: BloomLevel | null;
  initialPractice?: PracticeRecord;
  challengeBlocked?: string;
  challengeStatusLabel?: string;
  isComplete?: boolean;
}) {
  const router = useRouter();
  const [challenge, setChallenge] = useState<PracticeRecord | undefined>(initialPractice);
  const [answer, setAnswer] = useState(initialPractice?.answer ?? '');
  const [state, setState] = useState<ChallengeState>(initialChallengeState(initialPractice));
  const [message, setMessage] = useState('');
  const [targetLevel, setTargetLevel] = useState<BloomLevel>((initialPractice?.target_bloom_level ?? Math.min((confirmedLevel ?? 0) + 1 || 1, 6)) as BloomLevel);
  const localConfirmedLevel = challenge?.evaluation_state === 'evaluated' && challenge.achieved
    ? Math.max(confirmedLevel ?? 0, challenge.target_bloom_level) as BloomLevel
    : confirmedLevel;
  const localIsComplete = isComplete || Boolean(localConfirmedLevel && localConfirmedLevel >= 6);

  const canGenerate = !localIsComplete && !challengeBlocked && state !== 'generating' && state !== 'evaluating';
  const canEvaluate = Boolean(challenge?.id && answer.trim() && !localIsComplete && !challengeBlocked && state !== 'evaluating' && state !== 'generating' && challenge.evaluation_state !== 'evaluated');
  const resultTone = useMemo(() => {
    if (!challenge || challenge.evaluation_state !== 'evaluated') return null;
    if (challenge.achieved) return '已确认';
    return challengeStatusLabel === '需要巩固' ? '需要巩固' : '待巩固';
  }, [challenge, challengeStatusLabel]);

  const generateChallenge = async () => {
    if (localIsComplete) {
      setMessage('L1 到 L6 已全部确认，本页保留路线图复盘，不再生成更高层级挑战。');
      return;
    }
    setState('generating');
    setMessage('');
    try {
      const response = await fetch('/api/challenge/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsed = parseApiError(payload, '挑战生成失败。');
        setState(parsed.state === 'blocked' ? 'blocked' : parsed.state === 'failed' ? 'failed' : 'error');
        setMessage(parsed.message);
        return;
      }
      const nextChallenge = (payload as { challenge?: unknown }).challenge;
      if (!isPracticeRecord(nextChallenge)) {
        setState('error');
        setMessage('挑战生成接口未返回可保存的挑战记录。');
        return;
      }
      setChallenge(nextChallenge);
      setAnswer('');
      setTargetLevel(nextChallenge.target_bloom_level as BloomLevel);
      setState('pending');
      setMessage('挑战已生成并保存，完成作答后即可提交评估。');
      router.refresh();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : '挑战生成请求失败。');
    }
  };

  const evaluateChallenge = async () => {
    if (!challenge) return;
    setState('evaluating');
    setMessage('');
    try {
      const response = await fetch('/api/challenge/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ practiceId: challenge.id, answer }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsed = parseApiError(payload, '挑战确认失败。');
        setState(parsed.state === 'blocked' ? 'blocked' : parsed.state === 'failed' ? 'failed' : 'error');
        setMessage(parsed.message);
        return;
      }
      const result = (payload as { result?: unknown }).result;
      if (!isPracticeRecord(result)) {
        setState('error');
        setMessage('挑战确认接口未返回可追踪的挑战记录。');
        return;
      }
      setChallenge(result);
      setAnswer(result.answer ?? answer);
      const nextLevel = Math.min((result.achieved ? result.target_bloom_level : confirmedLevel ?? 0) + 1 || 1, 6) as BloomLevel;
      setTargetLevel(nextLevel);
      setState('evaluated');
      setMessage(result.achieved ? '挑战通过，项目当前确认层级已更新。' : '本次尚未通过，请先回到项目会话继续学习，再决定是否再次挑战。');
      router.refresh();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : '挑战确认请求失败。');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="font-heading">《{projectTitle}》{projectAuthor ? ` · ${projectAuthor}` : ''}认知攀登路线</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">当前已确认层级：{localConfirmedLevel ? `L${localConfirmedLevel}` : '等待挑战确认'}；本页只调用真实 Provider 生成挑战并确认结果。</p>
            </div>
            <Badge variant="outline">目标 L{targetLevel}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <LevelRoute currentLevel={localConfirmedLevel} targetLevel={targetLevel} />
        </CardContent>
      </Card>

      {challengeBlocked ? <BlockedState title="挑战功能未就绪" description={challengeBlocked} /> : null}
      {message && state === 'blocked' ? <BlockedState title="挑战暂不可用" description={message} /> : null}
      {message && (state === 'failed' || state === 'error') ? <ErrorState title={state === 'failed' ? '模型调用失败' : '挑战流程失败'} description={message} /> : null}
      {message && ['pending', 'evaluated'].includes(state) ? (
        <Alert className="border-primary/30 bg-primary/5" role="status">
          <CheckCircle2 className="size-4" />
          <AlertTitle className="font-heading">挑战状态已更新</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 font-heading"><Swords className="size-5 text-primary" />当前挑战</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">先认真读题，再结合原文和自己的理解完成作答。</p>
            </div>
            <Button type="button" variant="outline" disabled={!canGenerate} onClick={generateChallenge}>
              {state === 'generating' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}
              {localIsComplete ? '六层已完成' : challenge?.evaluation_state === 'evaluated' && challenge.achieved ? '生成下一挑战' : challenge ? '换一题' : '生成挑战'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {challenge ? (
            <>
              <div className="rounded-lg border bg-background/70 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <BloomBadge level={challenge.target_bloom_level} />
                  <Badge variant={challenge.evaluation_state === 'evaluated' ? 'default' : 'outline'}>{challenge.evaluation_state}</Badge>
                  {resultTone ? <Badge variant={challenge.achieved ? 'default' : 'secondary'}>{resultTone}</Badge> : null}
                </div>
                <MarkdownContent content={challenge.prompt ?? ''} />
                {challenge.feedback && challenge.evaluation_state === 'pending' ? (
                  <div className="mt-3 rounded-lg bg-muted/60 p-3 text-muted-foreground">
                    <p className="mb-2 text-sm font-medium text-foreground">作答提示</p>
                    <MarkdownContent content={challenge.feedback} className="text-muted-foreground" />
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="challenge-answer">你的作答</Label>
                <Textarea id="challenge-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={challenge.evaluation_state === 'evaluated' || Boolean(challengeBlocked)} className="min-h-40" placeholder="结合原文、关键字句和自己的理解作答。" />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">提交后你会看到本次是否通过，以及下一步可以怎么学。</p>
                <Button type="button" disabled={!canEvaluate} onClick={evaluateChallenge}>
                  {state === 'evaluating' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}
                  提交评估
                </Button>
              </div>

              {challenge.evaluation_state === 'evaluated' ? (
                <Alert className={challenge.achieved ? 'border-primary/30 bg-primary/5' : undefined}>
                  <CheckCircle2 className="size-4" />
                  <AlertTitle className="font-heading">挑战结果：{challenge.achieved ? '已通过' : resultTone ?? '待巩固'}</AlertTitle>
                  <AlertDescription>
                    <MarkdownContent content={challenge.feedback ?? '评估反馈已保存。'} className="text-muted-foreground" />
                  </AlertDescription>
                </Alert>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
              <p className="font-heading text-lg">还没有当前挑战</p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">点击“生成挑战”后，这里会出现一道新的挑战题。</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
