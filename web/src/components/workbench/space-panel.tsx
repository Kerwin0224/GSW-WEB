'use client';

import { useActionState, useCallback, useEffect, useState } from 'react';
import { Archive, Check, Loader2, Plus, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/workbench/state-surfaces';
import { SpaceDirectory } from '@/components/workbench/space-directory';
import { archiveSpaceAction, saveSpaceAction, setSpaceClassAction, setSpaceStudentAction, type SpaceStudentOption, type TeacherSpace } from '@/lib/data/spaces';
import type { TeacherClass } from '@/lib/data/teacher';
import { saveSpaceSubjectAction, saveStarterPromptsAction, STARTER_PROMPT_SLOTS, type SpaceSettingsMap, type SubjectOption } from '@/lib/data/space-settings';
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
export function SpacePanel({ spaces, classes, studentOptions, defaultSubject, subjectOptions = [], spaceSettings = {} }: { spaces: TeacherSpace[]; classes: TeacherClass[]; studentOptions: SpaceStudentOption[]; defaultSubject: string; subjectOptions?: SubjectOption[]; spaceSettings?: SpaceSettingsMap }) {
  const [selectedId, setSelectedId] = useState(spaces[0]?.id ?? '');
  const [creating, setCreating] = useState(spaces.length === 0);
  // 新建成功后服务端不回传新空间 id（saveSpaceAction 只返回 ActionState），
  // 而同名活跃空间被服务端保证唯一，按名字认领是唯一可靠的对齐方式。
  const [pendingSpaceName, setPendingSpaceName] = useState<string | null>(null);

  // 稳定引用：子组件的 effect 以它们为依赖，内联箭头会让 effect 每次渲染都重跑。
  const handleCreated = useCallback((createdName: string) => {
    setPendingSpaceName(createdName);
    setCreating(false);
  }, []);
  const handleArchived = useCallback(() => {
    setSelectedId('');
    setPendingSpaceName(null);
  }, []);

  // 归档后这条会从列表消失，`current` 自然解析为 undefined → 走空态。
  // 此前是 `?? spaces[0]`：静默跳到别的空间，教师看着编辑区毫无变化，以为归档没生效。
  // selectedId 留着一个失效 id 无害：目录高亮匹配不到任何人，正是它已消失的证据。
  const current = spaces.find((space) => space.id === selectedId)
    ?? (pendingSpaceName ? spaces.find((space) => space.name === pendingSpaceName) : undefined);
  // 新空间出现在列表里就立刻切过去（render 阶段收敛，避免多一次 effect 往返的空窗）。
  if (pendingSpaceName && current) setPendingSpaceName(null);

  function selectSpace(id: string) {
    setSelectedId(id);
    setPendingSpaceName(null);
    setCreating(false);
  }

  return (
    <Card className="gap-0 rounded-none border-x-0 border-border/70 bg-card/35 py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="font-heading text-xl">空间管理</CardTitle>
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
          onSelect={selectSpace}
          ariaLabel="选择教师空间"
          emptyLabel="还没有空间，先为每个科目建立一个空间。"
        />

        {creating ? (
          <SpaceEditor key="new" classes={classes} studentOptions={studentOptions} defaultSubject={defaultSubject} subjectOptions={subjectOptions} spaceSettings={spaceSettings} onCreated={handleCreated} />
        ) : current ? (
          <SpaceEditor key={current.id} space={current} classes={classes} studentOptions={studentOptions} defaultSubject={defaultSubject} subjectOptions={subjectOptions} spaceSettings={spaceSettings} onArchived={handleArchived} />
        ) : (
          <EmptyState
            title={spaces.length === 0 ? '还没有学习空间' : '当前没有选中的空间'}
            description={spaces.length === 0
              ? '从一个科目开始，写下它如何归类，再把对应学生加入。'
              : '从上面的目录里选一个空间继续编辑，或新建一个空间。'}
            action={spaces.length > 0
              ? <Button type="button" onClick={() => selectSpace(spaces[0].id)} className="cursor-pointer">选中「{spaces[0].name}」</Button>
              : <Button type="button" onClick={() => setCreating(true)} className="cursor-pointer"><Plus className="mr-1 size-4" aria-hidden="true" />新建空间</Button>}
          />
        )}
      </CardContent>
    </Card>
  );
}

function SpaceEditor({ space, classes, studentOptions, defaultSubject, subjectOptions, spaceSettings, onCreated, onArchived }: { space?: TeacherSpace; classes: TeacherClass[]; studentOptions: SpaceStudentOption[]; defaultSubject: string; subjectOptions: SubjectOption[]; spaceSettings: SpaceSettingsMap; onCreated?: (name: string) => void; onArchived?: () => void }) {
  const [state, action, pending] = useActionState(saveSpaceAction, idle);
  const [name, setName] = useState(space?.name ?? '');
  const [subject, setSubject] = useState(space?.subject ?? defaultSubject);
  const [theme, setTheme] = useState(space?.theme ?? '');
  const [colorKey, setColorKey] = useState<SpaceColorKey>(space?.colorKey ?? 'pine');
  const [spaceKind, setSpaceKind] = useState<SpaceKind>(space?.kind ?? 'term');
  // 默认「暂不拉班」：新建时替教师先拉一个班是不可逆的成员扩张，
  // 得由他自己明确选，而不是被默认值顺手带出去。
  const [classId, setClassId] = useState('');
  const setting = space ? spaceSettings[space.id] : undefined;

  const pulledClassIds = new Set((space?.classes ?? []).map((klass) => klass.classId));
  const availableClasses = classes.filter((klass) => !pulledClassIds.has(klass.classId));
  const directStudentIds = new Set((space?.directStudents ?? []).map((student) => student.id));
  const studentOptionById = new Map(studentOptions.map((student) => [student.id, student]));

  // 派生成员判定只能落在班名上：TeacherSpace 的 classes 没有成员 id，
  // 而 SpaceStudentOption.className 是该生所在班名的「、」连接。
  // ponytail: 跨校同名班级会误判为派生；要精确就得让数据层多返回一个 class_id。
  const pulledClassNames = new Set((space?.classes ?? []).map((klass) => klass.className.trim()));
  const isDerivedStudent = (student: SpaceStudentOption) => student.className.split('、').some((name) => pulledClassNames.has(name.trim()));
  // 已经随班级进来的学生不再出现在「可以加入」里——重复添加不会多给他一份权限，
  // 只会让教师误以为空间成员比实际多。
  const availableStudents = studentOptions.filter((student) => !directStudentIds.has(student.id) && !isDerivedStudent(student));
  const derivedDirectStudents = (space?.directStudents ?? []).filter((student) => {
    const option = studentOptionById.get(student.id);
    return option ? isDerivedStudent(option) : false;
  });
  const removableDirectStudents = (space?.directStudents ?? []).filter((student) => !derivedDirectStudents.some((derived) => derived.id === student.id));
  const derivedStudentCount = space?.classes.reduce((sum, klass) => sum + klass.studentCount, 0) ?? 0;
  const nameError = state.errors?.name;
  // 科目提交是独立小表单（见 SubjectField）：它同时写兼容文本列与词表 id，
  // 主表单因此只带一个隐藏字段把当前科目名交给 saveSpaceAction。
  const subjectError = state.errors?.subject;
  // 新建成功后把控制权交回父级去认领新空间（服务端不回传 id，见 SpacePanel 注释）。
  // 只认 state 的变化：依赖里刻意不放 name，否则教师接着改名就会重复认领。
  useEffect(() => {
    if (state.ok && !space) onCreated?.(name.trim());
  }, [state, onCreated, space, name]);

  return (
    <div className="grid gap-6 border-y border-border/65 bg-background/45 p-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-4 p-5 sm:p-6 lg:border-r lg:border-border/60">
        <SubjectField
          space={space}
          subject={subject}
          subjectOptions={subjectOptions}
          boundSubjectId={setting?.subjectId ?? null}
          onSubjectChange={setSubject}
          subjectError={subjectError}
        />
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
          {/* 空间类型目前只作标记：它不参与权限、不参与统计、也不影响归类规则。
              暑期营、考级班、1v1 长期项目这类没有学期边界的形态，今天只能记在「专题空间」里——
              这条限制必须写在教师眼前，否则他会以为选错了类型会导致看不到数据。 */}
          <p className="rounded-lg border border-border/60 bg-muted/35 p-2 text-xs leading-5 text-muted-foreground">
            空间类型只是标记，不改变任何行为：权限、统计和归类规则都不看它。暑期营、考级班、一对一长期项目这类没有学期边界的形态，目前只能记在「专题空间」里。
          </p>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="space-name">空间名称</Label>
          <Input id="space-name" name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：基础巩固空间" maxLength={40} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'space-name-error' : undefined} />
          {nameError ? <p id="space-name-error" className="text-xs text-destructive">{nameError}</p> : null}
        </div>
        {/* 科目交给独立小表单（SubjectField），它要同时写兼容文本列与词表 id。
            主表单因此只带一个隐藏字段把当前科目名交给 saveSpaceAction；
            SubjectField 本身必须放在本 form 之外——HTML 不允许表单嵌套，
            浏览器解析 SSR 出的 HTML 时会把内层 form 丢掉，提交时打到外层 action 上。 */}
        <input type="hidden" name="subject" value={subject} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">空间标识色</legend>
          <div role="radiogroup" aria-label="空间标识色" className="grid grid-cols-3 gap-2">
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
          <Label htmlFor="space-theme">空间归类规则（主题）</Label>
          <Textarea id="space-theme" name="theme" value={theme} onChange={(event) => setTheme(event.target.value)} placeholder={THEME_PLACEHOLDER} className="min-h-36" />
          <p className="text-xs leading-5 text-muted-foreground">只写「本空间怎么归类」。两行输出协议与「无法归属」约定由系统自动拼接，不需要你重复，也改不动。</p>
        </div>

        {!space ? (
          <div className="space-y-2">
            <Label htmlFor="space-class">先拉一个班进来（默认不拉，之后也能改）</Label>
            <select id="space-class" name="class_id" value={classId} onChange={(event) => setClassId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">暂不拉班</option>
              {classes.map((klass) => <option key={klass.classId} value={klass.classId}>{klass.className}（{klass.studentCount} 人）</option>)}
            </select>
            <p className="text-xs leading-5 text-muted-foreground">拉班会把整班学生一次性放进空间，之后要移出得逐个处理。默认「暂不拉班」，先建好空间再决定。</p>
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
          <div className="px-2 py-3"><p className="text-lg font-semibold text-foreground">{removableDirectStudents.length}</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">直接加入</p></div>
        </div>
      ) : null}
      {space ? <ArchiveButton space={space} onArchived={onArchived} /> : null}
      {space ? <StarterPromptsField space={space} starterPrompts={setting?.starterPrompts ?? []} /> : null}

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
            {removableDirectStudents.length === 0 && derivedDirectStudents.length === 0
              ? <p className="text-xs text-muted-foreground">暂无直接加入的学生。</p>
              : <div className="grid gap-2">{removableDirectStudents.map((student) => <StudentChip key={student.id} spaceId={space.id} studentId={student.id} label={`${student.displayName}（${studentOptionById.get(student.id)?.className ?? '学生'}）`} intent="remove" />)}</div>}
            {/* 同时被直接添加、又在已拉班级里的学生：随班级进出，给一个移除按钮会出现
                「移出后他仍在空间里」的假失败，所以只标来源、不给直接移除。 */}
            {derivedDirectStudents.length > 0 ? (
              <div className="grid gap-2">
                {derivedDirectStudents.map((student) => (
                  <div key={student.id} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/35 px-3 py-2 text-xs">
                    <span className="truncate">{student.displayName}（{studentOptionById.get(student.id)?.className ?? '学生'}）</span>
                    <Badge variant="outline" className="shrink-0">随班级进入</Badge>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">这些学生随已拉入的班级自动进出；要让他们离开空间，请在上方移出对应班级。</p>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">可以加入的学生</p>
            {availableStudents.length === 0 ? <p className="text-xs text-muted-foreground">任教班级学生都已在这个空间里（直接加入或随班级进入）。</p> : (
              <div className="grid gap-2">{availableStudents.map((student) => <StudentChip key={student.id} spaceId={space.id} studentId={student.id} label={`${student.displayName}（${student.className}）`} intent="add" />)}</div>
            )}
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}

/**
 * 空间科目：下拉 + 可新建。
 *
 * 自由文本的代价是同一个科目会长出多个空间（「物理」和「Physics」在目录里就是两组），
 * 所以改成从科目词表里选；词表里没有的可以现场新建一个词（先以文本形式落库，
 * 等学校管理员把词补进词表后再绑定 id）。两个字段一起写：文本列给老逻辑读，id 列才归一化。
 */
function SubjectField({ space, subject, subjectOptions, boundSubjectId, onSubjectChange, subjectError }: {
  space?: TeacherSpace;
  subject: string;
  subjectOptions: SubjectOption[];
  boundSubjectId: string | null;
  onSubjectChange: (value: string) => void;
  subjectError?: string;
}) {
  const [state, action, pending] = useActionState(saveSpaceSubjectAction, idle);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string>(() => {
    if (boundSubjectId) return `catalog:${boundSubjectId}`;
    return subject ? `text:${subject}` : '';
  });

  // 当前科目若不在候选里（例如历史空间写了个词表外的词），补进下拉，
  // 否则 select 会静默回落到第一项，教师看到的就不是这个空间真正的科目。
  const options = subjectOptions.some((option) => `text:${option.name}` === selected || `catalog:${option.id ?? ''}` === selected)
    ? subjectOptions
    : [...subjectOptions, { id: null, name: subject, source: 'existing' as const }].filter((option) => option.name.length > 0);
  const currentSubjectId = selected.startsWith('catalog:') ? selected.slice('catalog:'.length) : '';

  return (
    <div className="space-y-2 pb-3">
      <Label htmlFor="space-subject">空间科目</Label>
      {creating ? (
        <div className="flex gap-2">
          <Input
            id="space-subject"
            value={subject}
            onChange={(event) => onSubjectChange(event.target.value)}
            placeholder="输入新科目名"
            maxLength={40}
            aria-invalid={Boolean(subjectError)}
          />
          <Button type="button" variant="outline" onClick={() => { setCreating(false); setSelected(subject ? `text:${subject}` : ''); }} className="shrink-0 cursor-pointer">改选已有</Button>
        </div>
      ) : (
        <select
          id="space-subject"
          value={selected}
          onChange={(event) => {
            const next = event.target.value;
            setSelected(next);
            setCreating(next === '__new__');
            const option = options.find((item) => `catalog:${item.id ?? ''}` === next || `text:${item.name}` === next);
            if (option) onSubjectChange(option.name);
          }}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          aria-invalid={Boolean(subjectError)}
        >
          <option value="">请选择科目</option>
          {options.map((option) => (
            <option key={`${option.id ?? 'text'}:${option.name}`} value={option.id ? `catalog:${option.id}` : `text:${option.name}`}>
              {option.name}{option.source === 'catalog' ? '' : '（仅本空间在用）'}
            </option>
          ))}
          <option value="__new__">＋ 新建科目…</option>
        </select>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        科目用于空间目录分组。选词表里的科目，多个空间会归到同一组；选「仅本空间在用」或新建的词暂时只以文本保存。
      </p>
      {subjectError ? <p className="text-xs text-destructive">{subjectError}</p> : null}
      {space ? (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="space_id" value={space.id} />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="subject_id" value={currentSubjectId} />
          <Button type="submit" size="sm" variant="outline" disabled={pending || !subject.trim() || creating} className="cursor-pointer">
            {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" /> : null}
            保存科目
          </Button>
          <span className="text-xs text-muted-foreground">
            {boundSubjectId ? '当前已归并到词表。' : '当前未归并到词表，同学科的空间不会自动合并。'}
          </span>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">空间创建后，回到这里点「保存科目」即可把它归并到词表。</p>
      )}
      {state.message ? (
        <p className={state.ok ? 'text-xs text-primary' : 'text-xs text-destructive'} role={state.ok ? 'status' : 'alert'}>{state.message}</p>
      ) : null}
    </div>
  );
}

/**
 * 学生首屏的追问示例。留空即回落内置默认四句——教师不写也能用，
 * 写了就按他写的来（同一个空间里，学生看到的第一屏就该是这位老师想让他问的）。
 */
function StarterPromptsField({ space, starterPrompts }: { space: TeacherSpace; starterPrompts: string[] }) {
  const [state, action, pending] = useActionState(saveStarterPromptsAction, idle);
  const [values, setValues] = useState<string[]>(() => Array.from({ length: STARTER_PROMPT_SLOTS }, (_, index) => starterPrompts[index] ?? ''));

  return (
    <div className="space-y-2 border-t border-border/55 pt-3">
      <p className="text-sm font-medium">学生首屏追问示例</p>
      <form action={action} className="space-y-2">
        <input type="hidden" name="space_id" value={space.id} />
        {values.map((value, index) => (
          <Input
            key={index}
            name={`starter_prompt_${index}`}
            value={value}
            onChange={(event) => setValues((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
            placeholder={`示例 ${index + 1}（留空则用默认示例）`}
            maxLength={60}
          />
        ))}
        <Button type="submit" size="sm" variant="outline" disabled={pending} className="cursor-pointer">
          {pending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" /> : null}
          保存追问示例
        </Button>
      </form>
      {state.message ? (
        <p className={state.ok ? 'text-xs text-primary' : 'text-xs text-destructive'} role={state.ok ? 'status' : 'alert'}>{state.message}</p>
      ) : null}
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

/**
 * 归档是不可撤销的成员收缩，必须先说清影响面再动手。
 * 确认弹窗里给出学生/班级/直接成员的口径；项目与会话不会被删除（空间只支持归档，
 * 迁移里没有 delete 策略），这句话必须写出来，否则教师会以为学习数据也没了。
 */
function ArchiveButton({ space, onArchived }: { space: TeacherSpace; onArchived?: () => void }) {
  const [state, action, pending] = useActionState(archiveSpaceAction, idle);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const statusId = `archive_status_${space.id}`;

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.ok) setConfirmOpen(false);
  }
  useEffect(() => {
    if (state.ok) onArchived?.();
  }, [onArchived, state]);

  const derivedCount = space.classes.reduce((sum, klass) => sum + klass.studentCount, 0);
  const directCount = space.directStudents.length;

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)} disabled={pending} className="cursor-pointer">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Archive className="mr-2 size-4" aria-hidden="true" />}
        归档空间
      </Button>
      {state.message ? <span id={statusId} className={state.ok ? 'block pt-1 text-xs text-primary' : 'block pt-1 text-xs text-destructive'} role={state.ok ? 'status' : 'alert'}>{state.message}</span> : null}

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!pending) setConfirmOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认归档「{space.name}」？</DialogTitle>
            <DialogDescription>归档后学生侧立刻看不到这个空间，主题也不再生效。归档不可撤销。</DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-3" aria-busy={pending} aria-describedby={statusId}>
            <input type="hidden" name="space_id" value={space.id} />
            <ul className="space-y-1 rounded-lg border border-border/65 bg-muted/40 p-3 text-sm">
              <li className="flex justify-between gap-3"><span className="text-muted-foreground">可见学生</span><span className="font-medium">{space.studentCount} 名</span></li>
              <li className="flex justify-between gap-3"><span className="text-muted-foreground">其中随班级进入</span><span className="font-medium">{derivedCount} 名</span></li>
              <li className="flex justify-between gap-3"><span className="text-muted-foreground">其中直接加入</span><span className="font-medium">{directCount} 名</span></li>
              <li className="flex justify-between gap-3"><span className="text-muted-foreground">已拉入班级</span><span className="font-medium">{space.classes.length} 个</span></li>
            </ul>
            {/* 项目与会话数：数据层没有随空间返回这个口径，不能编。改成把「不会丢什么」讲清楚。 */}
            <p className="text-xs leading-5 text-muted-foreground">空间内已沉淀的项目、会话与挑战数据不会被删除，学生仍可正常查看，只是不再挂在这个空间的归类规则下。</p>
            {state.message ? <p className={state.ok ? 'rounded-lg border border-primary/30 bg-primary/10 p-2 text-sm text-primary' : 'rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive'} role={state.ok ? 'status' : 'alert'}>{state.message}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>取消</Button>
              <Button type="submit" variant="destructive" disabled={pending} className="cursor-pointer">
                {pending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : <Check className="mr-1.5 size-4" aria-hidden="true" />}
                {pending ? '归档中...' : '确认归档'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
