import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AssignmentCreateForm } from '@/components/workbench/assignment-create-form';
import { AssignmentCloseButton } from '@/components/workbench/assignment-close-button';
import { EmptyState, ErrorState } from '@/components/workbench/state-surfaces';
import { ASSIGNMENT_KINDS, listTeacherAssignments } from '@/lib/data/assignments';
import { getTeacherClasses, getTeacherWorkspace } from '@/lib/data/teacher';
import { listTeacherStudentOptions, listTeacherSpaces } from '@/lib/data/spaces';

const KIND_LABEL: Record<string, string> = Object.fromEntries(ASSIGNMENT_KINDS.map((item) => [item.value, item.label]));

/**
 * 教师任务下发。
 *
 * 「教师侧只有三个一级工作区」是 CONTEXT 的硬约束，所以本页是学习记录核实与
 * 教师问答之外的挂靠页，而不是新增一级导航——教师看板与核实队列各给一个入口即可。
 */
export default async function TeacherAssignmentsPage() {
  const [assignmentsResult, classesResult, spacesResult, studentsResult, workspaceResult] = await Promise.all([
    listTeacherAssignments(),
    getTeacherClasses(),
    listTeacherSpaces(),
    listTeacherStudentOptions(),
    getTeacherWorkspace(),
  ]);

  if (!assignmentsResult.ok) {
    return <div className="p-6"><ErrorState title="任务列表加载失败" description={assignmentsResult.message} /></div>;
  }

  const classOptions = classesResult.ok ? classesResult.data.map((item) => ({ classId: item.classId, className: item.className })) : [];
  const spaceOptions = spacesResult.ok ? spacesResult.data.map((item) => ({ spaceId: item.id, spaceName: item.name })) : [];
  // 点名候选取任教班级的学生并带上班名：同名学生在两个班时，教师分不出自己点的是谁。
  const studentOptions = studentsResult.ok
    ? studentsResult.data.map((item) => ({ studentId: item.id, studentName: item.className ? `${item.displayName}（${item.className}）` : item.displayName }))
    : [];
  const assignments = assignmentsResult.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl">任务下发</h1>
        <p className="text-sm text-muted-foreground">
          按班级或空间布置，也可点名学生。学生完成后你能在这里看到完成情况。
        </p>
      </header>

      <Card className="border-border/70 bg-card/88 shadow-soft">
        <CardHeader><CardTitle className="font-heading">布置新任务</CardTitle></CardHeader>
        <CardContent>
          {workspaceResult.ok ? (
            <AssignmentCreateForm classOptions={classOptions} spaceOptions={spaceOptions} studentOptions={studentOptions} />
          ) : (
            <p className="text-sm text-muted-foreground">布置任务需要先有一个学习空间。{workspaceResult.message}</p>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-heading text-lg">已布置的任务</h2>
        {assignments.length === 0 ? (
          <EmptyState title="还没有布置任务" description="上面选好受众后点「布置任务」，学生端会出现待办。" />
        ) : (
          <ul className="space-y-3">
            {assignments.map((assignment) => {
              const doneCount = assignment.recipients.filter((recipient) => recipient.completedAt).length;
              return (
                <li key={assignment.id}>
                  <Card className="border-border/70 bg-card/88 shadow-soft">
                    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="font-heading text-base">{assignment.title}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {KIND_LABEL[assignment.kind] ?? assignment.kind}
                          {assignment.classId ? ` · ${assignment.className}` : ''}
                          {assignment.spaceId ? ` · ${assignment.spaceName}` : ''}
                          {assignment.targetLevel ? ` · 目标第 ${assignment.targetLevel} 层` : ''}
                          {assignment.dueAt ? ` · 截止 ${new Date(assignment.dueAt).toLocaleString('zh-CN')}` : ' · 无截止时间'}
                        </p>
                      </div>
                      <span className="flex items-center gap-2">
                        <Badge variant={assignment.status === 'open' ? 'default' : 'outline'}>{assignment.status === 'open' ? '进行中' : '已关闭'}</Badge>
                        {assignment.status === 'open' ? <AssignmentCloseButton assignmentId={assignment.id} /> : null}
                      </span>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {assignment.instructions ? <p className="whitespace-pre-wrap leading-6">{assignment.instructions}</p> : null}
                      {assignment.recipients.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">点名 {assignment.recipients.length} 人，已完成 {doneCount} 人</p>
                          <ul className="flex flex-wrap gap-1.5">
                            {assignment.recipients.map((recipient) => (
                              <li key={recipient.profileId}>
                                <Badge variant={recipient.completedAt ? 'secondary' : 'outline'}>
                                  {recipient.displayName}{recipient.completedAt ? ' ✓' : ''}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">面向该班级/空间全体成员，未点名。</p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
