'use client';

import { useActionState, useState } from 'react';
import { Check, Loader2, Plus, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/workbench/state-surfaces';
import { SpaceDirectory } from '@/components/workbench/space-directory';
import { archiveSpaceAction, saveSpaceAction, setSpaceClassAction, setSpaceStudentAction, type SpaceStudentOption, type TeacherSpace } from '@/lib/data/spaces';
import type { TeacherClass } from '@/lib/data/teacher';
import type { ActionState } from '@/lib/data/common';
import { SPACE_COLOR_KEYS, SPACE_COLOR_LABELS, SPACE_COLOR_VALUES } from '@/lib/space-colors';
import type { SpaceColorKey, SpaceKind } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils';

const idle: ActionState = { ok: false, message: '' };

const THEME_PLACEHOLDER = `只写「这个空间按什么分类」，不用管输出格式。例如：
· 语文：按学生实际在学的篇目归类——问题聚焦哪一篇就归到那篇；问知识点（虚词、句式、修辞）时归到知识点名称。
· 数学：按知识点归类，如「一次函数」「全等三角形」；综合题归到最主要的那个知识点。`;

/**
 * 老师的学习空间管理。
 *
 * 产品语义：空间属于老师；老师可以整班加入，也可以从任教班级学生中单独加入。
 * 班级成员自动派生，直接成员单独记录；归类主题与结构化返回协议分开，主题只写语义部分。
 * 两行输出协议由系统在提示词末尾强制拼接，见 lib/classification-prompts.ts。
 */
export function SpacePanel({ spaces, classes, studentOptions, defaultSubject }: { spaces: TeacherSpace[]; classes: TeacherClass[]; studentOptions: SpaceStudentOption[]; defaultSubject: string }) {
  const [selectedId, setSelectedId] = useState(spaces[0]?.id ?? '');
  const [creating, setCreating] = useState(spaces.length === 0);
  const current = spaces.find((space) => space.id === selectedId) ?? spaces[0];

  return (
    <Card className="gap-0 rounded-none border-x-0 border-border/70 bg-card/35 py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="font-heading text-xl">空间编目</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">每个科目有自己的空间。学生进入空间后，项目、会话和挑战都在这个范围内。</CardDescription>
          </div>
          <Button type="button" size="sm" variant={creating ? 'default' : 'outline'} onClick={() => setCreating(true)} className="cursor-pointer">
            <Plus className="mr-1 size-4" aria-hidden="true" />新建空间
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 px-5 py-5 sm:px-6">
        <SpaceDirectory
          items={spaces.map((space) => ({ id: space.id, name: space.name, subject: space.subject, colorKey: space.colorKey, kind: space.kind, count: space.studentCount, hint: `${space.subject || '未设置科目'} · ${space.studentCount} 名学生` }))}
          activeId={selectedId}
          onSelect={(id) => { setSelectedId(id); setCreating(false); }}
          ariaLabel="选择教师空间"
          emptyLabel="还没有空间，先为每个科目建立一个空间。"
        />

        {creating ? (
          <SpaceEditor key="new" classes={classes} studentOptions={studentOptions} defaultSubject={defaultSubject} />
        ) : current ? (
          <SpaceEditor key={current.id} space={current} classes={classes} studentOptions={studentOptions} defaultSubject={defaultSubject} />
        ) : (
          <EmptyState title="还没有学习空间" description="从一个科目开始，写下它如何归类，再把对应学生加入。" />
        )}
      </CardContent>
    </Card>
  );
}

function SpaceEditor({ space, classes, studentOptions, defaultSubject }: { space?: TeacherSpace; classes: TeacherClass[]; studentOptions: SpaceStudentOption[]; defaultSubject: string }) {
  const [state, action, pending] = useActionState(saveSpaceAction, idle);
  const [name, setName] = useState(space?.name ?? '');
  const [subject, setSubject] = useState(space?.subject ?? defaultSubject);
  const [theme, setTheme] = useState(space?.theme ?? '');
  const [colorKey, setColorKey] = useState<SpaceColorKey>(space?.colorKey ?? 'pine');
  const [spaceKind, setSpaceKind] = useState<SpaceKind>(space?.kind ?? 'term');
  const [classId, setClassId] = useState(classes[0]?.classId ?? '');

  const pulledClassIds = new Set((space?.classes ?? []).map((klass) => klass.classId));
  const availableClasses = classes.filter((klass) => !pulledClassIds.has(klass.classId));
  const directStudentIds = new Set((space?.directStudents ?? []).map((student) => student.id));
  const studentOptionById = new Map(studentOptions.map((student) => [student.id, student]));
  const availableStudents = studentOptions.filter((student) => !directStudentIds.has(student.id));
  const derivedStudentCount = space?.classes.reduce((sum, klass) => sum + klass.studentCount, 0) ?? 0;
  const nameError = state.errors?.name;
  const subjectError = state.errors?.subject;

  return (
    <div className="grid gap-6 border-y border-border/65 bg-background/45 p-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-4 p-5 sm:p-6 lg:border-r lg:border-border/60">
      <form action={action} className="space-y-3">
        {space ? <input type="hidden" name="space_id" value={space.id} /> : null}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">空间类型</legend>
          <div role="radiogroup" aria-label="空间类型" className="grid grid-cols-2 gap-2">
            {([['term', '学期空间', '本学期主要内容都放在这里'], ['topic', '专题空间', '专题阶段单独让学生提问']] as const).map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={spaceKind === value}
                onClick={() => setSpaceKind(value)}
                className={cn('min-h-16 cursor-pointer border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', spaceKind === value ? 'border-primary/60 bg-primary/8' : 'border-border/60 bg-background/60 hover:bg-muted/50')}
              >
                <span className="block text-sm font-medium">{label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
              </button>
            ))}
          </div>
          <input type="hidden" name="space_kind" value={spaceKind} />
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="space-name">空间名称</Label>
          <Input id="space-name" name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：基础巩固空间" maxLength={40} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'space-name-error' : undefined} />
          {nameError ? <p id="space-name-error" className="text-xs text-destructive">{nameError}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="space-subject">空间科目</Label>
          <Input id="space-subject" name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="例如：语文" maxLength={40} aria-invalid={Boolean(subjectError)} aria-describedby={subjectError ? 'space-subject-error' : 'space-subject-help'} />
          <p id="space-subject-help" className="text-xs text-muted-foreground">科目用于空间目录分组，必须填写。</p>
          {subjectError ? <p id="space-subject-error" className="text-xs text-destructive">{subjectError}</p> : null}
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">空间书脊色</legend>
          <div role="radiogroup" aria-label="空间书脊色" className="grid grid-cols-3 gap-2">
            {SPACE_COLOR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={colorKey === key}
                onClick={() => setColorKey(key)}
                className={cn('flex min-h-10 items-center gap-2 border px-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', colorKey === key ? 'border-primary/60 bg-primary/8 text-foreground' : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/50')}
              >
                <span className="h-5 w-1.5 shrink-0" style={{ backgroundColor: SPACE_COLOR_VALUES[key] }} aria-hidden="true" />
                <span className="truncate">{SPACE_COLOR_LABELS[key]}</span>
              </button>
            ))}
          </div>
          <input type="hidden" name="color_key" value={colorKey} />
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="space-theme">归类主题</Label>
          <Textarea id="space-theme" name="theme" value={theme} onChange={(event) => setTheme(event.target.value)} placeholder={THEME_PLACEHOLDER} className="min-h-36" />
          <p className="text-xs leading-5 text-muted-foreground">只写「本空间怎么归类」。两行输出协议与「无法归属」约定由系统自动拼接，不需要你重复，也改不动。</p>
        </div>

        {!space ? (
          <div className="space-y-2">
            <Label htmlFor="space-class">先拉一个班进来（可留空，之后再拉）</Label>
            <select id="space-class" name="class_id" value={classId} onChange={(event) => setClassId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">暂不拉班</option>
              {classes.map((klass) => <option key={klass.classId} value={klass.classId}>{klass.className}（{klass.studentCount} 人）</option>)}
            </select>
          </div>
        ) : null}

        {state.message ? (
          <p className={state.ok ? 'rounded-lg border border-primary/30 bg-primary/10 p-2 text-sm text-primary' : 'rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive'} role={state.ok ? 'status' : 'alert'}>{state.message}</p>
        ) : null}

        <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-border/60 bg-background/92 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
          <Button type="submit" disabled={pending || !name.trim() || !subject.trim()} className="cursor-pointer">
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 size-4" aria-hidden="true" />}
            {space ? '保存空间' : '创建空间'}
          </Button>
        </div>
      </form>
      </div>
      <div className="space-y-4 p-5 sm:p-6">

      {!space ? <div className="rounded-lg border border-dashed border-border/70 bg-background/55 p-4 text-sm leading-6 text-muted-foreground">空间创建后，这里会显示任教班级和可以直接加入的学生。现在先写清空间身份和归类主题。</div> : null}
      {space ? (
        <div className="grid grid-cols-3 divide-x border-y border-border/60 bg-card/35 text-center">
          <div className="px-2 py-3"><p className="text-lg font-semibold text-foreground">{space.studentCount}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">可见学生</p></div>
          <div className="px-2 py-3"><p className="text-lg font-semibold text-foreground">{derivedStudentCount}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">班级派生</p></div>
          <div className="px-2 py-3"><p className="text-lg font-semibold text-foreground">{space.directStudents.length}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">直接加入</p></div>
        </div>
      ) : null}
      {space ? <ArchiveButton spaceId={space.id} /> : null}

      {space ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">已拉入的班</p>
            {space.classes.length === 0 ? <p className="text-xs text-muted-foreground">还没有拉班；也可以从下面单独加入学生。</p> : (
              <div className="grid gap-2">{space.classes.map((klass) => <ClassChip key={klass.classId} spaceId={space.id} classId={klass.classId} label={`${klass.className}（${klass.studentCount} 人）`} intent="remove" />)}</div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">可以拉入的班</p>
            {availableClasses.length === 0 ? <p className="text-xs text-muted-foreground">你任教的所有班都已在空间里。</p> : (
              <div className="grid gap-2">{availableClasses.map((klass) => <ClassChip key={klass.classId} spaceId={space.id} classId={klass.classId} label={`${klass.className}（${klass.studentCount} 人）`} intent="add" />)}</div>
            )}
          </div>
          <div className="space-y-2 border-t border-border/50 pt-3">
            <p className="text-sm font-medium">直接加入的学生</p>
            {space.directStudents.length === 0 ? <p className="text-xs text-muted-foreground">暂无直接加入的学生。</p> : (
              <div className="grid gap-2">{space.directStudents.map((student) => <StudentChip key={student.id} spaceId={space.id} studentId={student.id} label={`${student.displayName}（${studentOptionById.get(student.id)?.className ?? '学生'}）`} intent="remove" />)}</div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">可以加入的学生</p>
            {availableStudents.length === 0 ? <p className="text-xs text-muted-foreground">任教班级学生都已直接加入。</p> : (
              <div className="grid gap-2">{availableStudents.map((student) => <StudentChip key={student.id} spaceId={space.id} studentId={student.id} label={`${student.displayName}（${student.className}）`} intent="add" />)}</div>
            )}
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

/** 拉班 / 移出各是一个独立的小表单：一个按钮，一次提交，不涉及别的字段。 */
function ClassChip({ spaceId, classId, label, intent }: { spaceId: string; classId: string; label: string; intent: 'add' | 'remove' }) {
  const [state, action, pending] = useActionState(setSpaceClassAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="space_id" value={spaceId} />
      <input type="hidden" name="class_id" value={classId} />
      <input type="hidden" name="intent" value={intent} />
      <Button type="submit" size="sm" variant={intent === 'add' ? 'outline' : 'secondary'} disabled={pending} className="flex w-full cursor-pointer items-center justify-between gap-2 text-left">
        {pending
          ? <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
          : intent === 'add' ? <Plus className="mr-1 size-3" aria-hidden="true" /> : <X className="mr-1 size-3" aria-hidden="true" />}
        {label}
      </Button>
      {state.message ? (
        <span className={state.ok ? 'block pt-1 text-xs text-primary' : 'block pt-1 text-xs text-destructive'} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

/** 直接加入 / 移出学生，各是一个独立的小表单。 */
function StudentChip({ spaceId, studentId, label, intent }: { spaceId: string; studentId: string; label: string; intent: 'add' | 'remove' }) {
  const [state, action, pending] = useActionState(setSpaceStudentAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="space_id" value={spaceId} />
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="intent" value={intent} />
      <Button type="submit" size="sm" variant={intent === 'add' ? 'outline' : 'secondary'} disabled={pending} className="flex w-full cursor-pointer items-center justify-between gap-2 text-left">
        {pending ? <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" /> : intent === 'add' ? <Plus className="mr-1 size-3" aria-hidden="true" /> : <X className="mr-1 size-3" aria-hidden="true" />}
        {label}
      </Button>
      {state.message ? <span className={state.ok ? 'block pt-1 text-xs text-primary' : 'block pt-1 text-xs text-destructive'} role={state.ok ? 'status' : 'alert'}>{state.message}</span> : null}
    </form>
  );
}

function ArchiveButton({ spaceId }: { spaceId: string }) {
  const [state, action, pending] = useActionState(archiveSpaceAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="space_id" value={spaceId} />
      <Button type="submit" variant="outline" disabled={pending} className="cursor-pointer">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 size-4" aria-hidden="true" />}
        归档
      </Button>
      {state.message ? <span className={state.ok ? 'block pt-1 text-xs text-primary' : 'block pt-1 text-xs text-destructive'} role={state.ok ? 'status' : 'alert'}>{state.message}</span> : null}
    </form>
  );
}
