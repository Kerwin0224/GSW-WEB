import Link from 'next/link';
import { CalendarClock, CheckCircle2, FileUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { ASSIGNMENT_KINDS, listStudentAssignments } from '@/lib/data/assignments';

const KIND_LABEL: Record<string, string> = Object.fromEntries(ASSIGNMENT_KINDS.map((item) => [item.value, item.label]));

/**
 * 学生待办任务。
 *
 * 任务本身只是入口，真正的提交物走 `submissions`（由附件/产物线提供 API）。
 * 这里不内嵌提交表单：同一份提交物（代码、扫描件、录音）在不同学科下形态完全不同，
 * 在这里硬塞一个通用输入框只会得到一个谁都不用的文本框。
 * 「能提交」= 有明确的提交入口 + 已提交数可见。
 */
export default async function StudentAssignmentsPage() {
  const assignmentsResult = await listStudentAssignments();
  if (!assignmentsResult.ok) {
    return <div className="p-6"><ErrorState title="待办任务加载失败" description={assignmentsResult.message} /></div>;
  }

  const assignments = assignmentsResult.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl">待办任务</h1>
        <p className="text-sm text-muted-foreground">老师布置的任务会出现在这里。完成后提交你的学习产物。</p>
      </header>

      {assignments.length === 0 ? (
        <EmptyState title="暂时没有待办任务" description="老师布置新任务后会出现在这里。" />
      ) : (
        <ul className="space-y-3">
          {assignments.map((assignment) => {
            const overdue = Boolean(assignment.dueAt) && new Date(assignment.dueAt!) < new Date() && !assignment.completedAt;
            return (
              <li key={assignment.id}>
                <Card className="border-border/70 bg-card/88 shadow-soft">
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="font-heading text-base">{assignment.title}</CardTitle>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{KIND_LABEL[assignment.kind] ?? assignment.kind}</Badge>
                        {assignment.targetLevel ? <span>目标第 {assignment.targetLevel} 层</span> : null}
                        {assignment.dueAt ? (
                          <span className={overdue ? 'inline-flex items-center gap-1 text-destructive' : 'inline-flex items-center gap-1'}>
                            <CalendarClock className="size-3.5" aria-hidden="true" />
                            截止 {new Date(assignment.dueAt).toLocaleString('zh-CN')}
                            {overdue ? '（已过期）' : ''}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {assignment.completedAt || assignment.submissionCount > 0 ? (
                      <Badge variant="secondary"><CheckCircle2 className="mr-1 size-3" aria-hidden="true" />已提交</Badge>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {assignment.instructions ? <p className="whitespace-pre-wrap leading-6">{assignment.instructions}</p> : <p className="text-muted-foreground">老师没有补充说明。</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {assignment.submissionCount > 0 ? `已提交 ${assignment.submissionCount} 份` : '还没有提交'}
                        {assignment.completedAt ? ` · 标记完成于 ${new Date(assignment.completedAt).toLocaleString('zh-CN')}` : ''}
                      </p>
                      {/* 提交入口指向学习提问空间：作业的思考过程与提交物都在那里产出，
                          这里再开一个通用输入框只会多一处无内容的表单。 */}
                      <Link
                        href="/student"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border/65 px-3 text-xs text-primary underline-offset-4 hover:underline"
                      >
                        <FileUp className="size-3.5" aria-hidden="true" />
                        去提交学习产物
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
