import Link from 'next/link';
import { AlertTriangle, ChevronRight, FileSearch, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/workbench/pagination';
import { EmptyState } from '@/components/workbench/state-surfaces';
import { buildAuditHref, preReviewSummaryLabel, reviewStateLabel } from '@/components/workbench/audit/presentation';
import type { TeacherAuditQueuePage } from '@/lib/data/teacher';
import { cn } from '@/lib/utils';

/**
 * 核实队列导航：班级 → 学生 → 项目 → 会话。
 *
 * CONTEXT.md 要求学习记录核实保留完整上下文，不能退化成单条回答待办队列，
 * 所以这四层都要在。但四层不意味着四层卡片套卡片——用缩进表达从属，
 * 用行内徽章表达状态，扫读成本比嵌套卡片低得多。
 *
 * 选中态是 URL（?session=），不是组件 state：可深链、可后退、可与分页共存。
 */
export function AuditQueueNav({ queue, selectedId }: { queue: TeacherAuditQueuePage; selectedId?: string }) {
  const pageSessionCount = queue.groups.reduce(
    (sum, group) => sum + group.students.reduce((studentSum, student) => studentSum + student.projects.reduce((projectSum, project) => projectSum + project.sessions.length, 0), 0),
    0,
  );
  const classCount = queue.groups.length;
  const studentCount = queue.groups.reduce((sum, group) => sum + group.students.length, 0);
  const projectCount = queue.groups.reduce((sum, group) => sum + group.students.reduce((studentSum, student) => studentSum + student.projects.length, 0), 0);

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/6 p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">学习记录核实</p>
            <h1 className="mt-2 font-heading text-xl">待核实队列</h1>
          </div>
          <Badge variant="outline" className="bg-card/80">{queue.pendingTotal} 待核实</Badge>
        </div>
        {/* 待核实是全局口径（不受分页影响）；其余按当前页统计，文案里说清，否则又是一个「看着像总数其实不是」的误导。 */}
        <p className="text-xs leading-5 text-muted-foreground">
          按班级 → 学生 → 项目 → 会话查看。本页覆盖 {classCount} 个班级 · {studentCount} 名学生 · {projectCount} 个项目 · {pageSessionCount} 条会话。
        </p>
      </div>

      {pageSessionCount === 0 ? (
        <EmptyState
          title={queue.status === 'pending' ? '暂无待核实会话' : '暂无会话'}
          description={queue.status === 'pending' ? '学生产生新的 AI 学习记录后，会进入这里等待核实。' : '这个范围内还没有可核实的学生会话。'}
        />
      ) : (
        <div className="space-y-4">
          {queue.groups.map((group) => (
            <section key={group.classId ?? group.classLabel} className="space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/78 px-3 py-2">
                <p className="truncate font-heading text-sm">{group.classLabel}</p>
                <Badge variant="outline" className="bg-card/80">{group.students.length} 名学生</Badge>
              </div>

              <div className="space-y-3 pl-2">
                {group.students.map((student) => (
                  <div key={`${group.classLabel}-${student.studentName}`} className="space-y-1.5">
                    <p className="flex items-center gap-1.5 pl-1 text-sm font-medium">
                      <UserRound className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate">{student.studentName}</span>
                    </p>

                    {student.projects.map((project) => (
                      <div key={`${student.studentName}-${project.projectTitle}`} className="space-y-1 pl-4">
                        <p className="truncate text-xs font-medium text-muted-foreground">《{project.projectTitle}》</p>

                        <ul className="space-y-1 pl-2">
                          {project.sessions.map((session) => {
                            const active = session.conversationId === selectedId;
                            const risk = session.issueCount > 0;
                            return (
                              <li key={session.conversationId}>
                                <Link
                                  href={buildAuditHref({ status: queue.status, page: queue.page, session: session.conversationId })}
                                  aria-current={active ? 'true' : undefined}
                                  className={cn(
                                    'block cursor-pointer rounded-lg border px-2.5 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    active
                                      ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/15'
                                      : 'border-border/55 bg-card/80 hover:border-primary/35 hover:bg-primary/6',
                                  )}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <ChevronRight className={cn('size-3 shrink-0 text-muted-foreground transition-transform', active && 'rotate-90 text-primary')} aria-hidden="true" />
                                    <span className="truncate font-medium">{session.sessionLabel}</span>
                                    {risk ? <AlertTriangle className="size-3 shrink-0 text-destructive" aria-hidden="true" /> : null}
                                  </span>
                                  <span className="mt-1 flex flex-wrap items-center gap-1.5 pl-4.5 text-muted-foreground">
                                    <Badge variant={session.finalized ? 'secondary' : 'outline'}>{reviewStateLabel(session.finalized ? 'confirmed' : 'pending')}</Badge>
                                    <span>{session.assistantCount} 条 AI 回答</span>
                                    {risk ? <span className="text-destructive">{session.issueCount} 处疑点</span> : null}
                                    <span>{new Date(session.updatedAt).toLocaleString('zh-CN')}</span>
                                  </span>
                                  <span className="mt-1 block pl-4.5 text-muted-foreground">
                                    {preReviewSummaryLabel({ preReviewState: session.preReviewState, coveredCount: session.preReviewCoveredMessageCount, assistantCount: session.assistantCount, issueCount: session.issueCount })}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Pagination
        className="border-t border-border/60 pt-4"
        page={queue.page}
        pageSize={queue.pageSize}
        total={queue.total}
        itemLabel="条会话"
        buildHref={(target) => buildAuditHref({ status: queue.status, page: target })}
      />

      {queue.status === 'pending' ? (
        <Link href={buildAuditHref({ status: 'all' })} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
          <FileSearch className="size-3.5" aria-hidden="true" />
          查看已提交的记录
        </Link>
      ) : (
        <Link href={buildAuditHref({})} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
          <FileSearch className="size-3.5" aria-hidden="true" />
          只看待核实
        </Link>
      )}
    </div>
  );
}
