'use client';

import { useActionState, useState } from 'react';
import { Check, Loader2, Plus, Save, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/workbench/state-surfaces';
import { archiveSpaceAction, saveSpaceAction, setSpaceClassAction, type TeacherSpace } from '@/lib/data/spaces';
import type { TeacherClass } from '@/lib/data/teacher';
import type { ActionState } from '@/lib/data/common';

const idle: ActionState = { ok: false, message: '' };

const THEME_PLACEHOLDER = `只写「这个空间按什么分类」，不用管输出格式。例如：
· 语文：按学生实际在学的篇目归类——问题聚焦哪一篇就归到那篇；问知识点（虚词、句式、修辞）时归到知识点名称。
· 数学：按知识点归类，如「一次函数」「全等三角形」；综合题归到最主要的那个知识点。`;

/**
 * 老师的学习空间管理。
 *
 * 产品语义：空间属于老师，老师可管多个班，**通过班批量拉学生**——拉一个班就是加一条边，
 * 该班学生全部自动在内。所以这里没有「挑学生」这一步，界面也不该有。
 *
 * 归类主题与结构化返回协议是分开的：老师只写「怎么归类」（语义部分），
 * 两行输出协议由系统在提示词末尾强制拼接，见 lib/classification-prompts.ts。
 */
export function SpacePanel({ spaces, classes }: { spaces: TeacherSpace[]; classes: TeacherClass[] }) {
  const [selectedId, setSelectedId] = useState(spaces[0]?.id ?? '');
  const [creating, setCreating] = useState(spaces.length === 0);
  // 收敛到第一个：归档当前选中项后 spaces 里就没有它了，
  // 否则会出现「上方芯片还在高亮、下方显示『还没有学习空间』」的自相矛盾。
  const current = spaces.find((space) => space.id === selectedId) ?? spaces[0];

  return (
    <Card className="border-border/70 bg-card/88 shadow-soft">
      <CardHeader>
        <CardTitle className="font-heading">学习空间</CardTitle>
        <CardDescription>
          一个空间 = 一套归类口径 + 一批学生。拉一个班进来，该班学生就都在里面；之后班册有变动（转学、插班）会跟着走，不需要维护名册。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {spaces.map((space) => (
            <Button
              key={space.id}
              type="button"
              size="sm"
              variant={!creating && selectedId === space.id ? 'default' : 'outline'}
              onClick={() => { setSelectedId(space.id); setCreating(false); }}
              className="cursor-pointer"
            >
              {space.name}
              <Badge variant={!creating && selectedId === space.id ? 'secondary' : 'outline'}>{space.studentCount} 人</Badge>
            </Button>
          ))}
          <Button type="button" size="sm" variant={creating ? 'default' : 'outline'} onClick={() => setCreating(true)} className="cursor-pointer">
            <Plus className="mr-1 size-4" aria-hidden="true" />新建空间
          </Button>
        </div>

        {creating ? (
          <SpaceEditor key="new" classes={classes} />
        ) : current ? (
          <SpaceEditor key={current.id} space={current} classes={classes} />
        ) : (
          <EmptyState title="还没有学习空间" description="建一个空间，写下归类口径，再把你的班拉进来。" />
        )}
      </CardContent>
    </Card>
  );
}

function SpaceEditor({ space, classes }: { space?: TeacherSpace; classes: TeacherClass[] }) {
  const [state, action, pending] = useActionState(saveSpaceAction, idle);
  const [name, setName] = useState(space?.name ?? '');
  const [theme, setTheme] = useState(space?.theme ?? '');
  const [classId, setClassId] = useState(classes[0]?.classId ?? '');

  const pulledClassIds = new Set((space?.classes ?? []).map((klass) => klass.classId));
  const availableClasses = classes.filter((klass) => !pulledClassIds.has(klass.classId));

  return (
    <div className="space-y-4 rounded-lg border border-border/65 bg-background/78 p-4">
      <form action={action} className="space-y-3">
        {space ? <input type="hidden" name="space_id" value={space.id} /> : null}
        <div className="space-y-2">
          <Label htmlFor="space-name">空间名称</Label>
          <Input
            id="space-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：王老师的文言虚词空间"
            maxLength={40}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="space-theme">归类主题</Label>
          <Textarea
            id="space-theme"
            name="theme"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
            placeholder={THEME_PLACEHOLDER}
            className="min-h-36"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            只写「本空间怎么归类」。两行输出协议与「无法归属」约定由系统自动拼接，不需要你重复，也改不动。
          </p>
        </div>

        {!space ? (
          <div className="space-y-2">
            <Label htmlFor="space-class">先拉一个班进来（可留空，之后再拉）</Label>
            <select
              id="space-class"
              name="class_id"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">暂不拉班</option>
              {classes.map((klass) => (
                <option key={klass.classId} value={klass.classId}>{klass.className}（{klass.studentCount} 人）</option>
              ))}
            </select>
          </div>
        ) : null}

        {state.message ? (
          <p className={state.ok ? 'rounded-lg border border-primary/30 bg-primary/10 p-2 text-sm text-primary' : 'rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive'} role={state.ok ? 'status' : 'alert'}>
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !name.trim()} className="cursor-pointer">
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 size-4" aria-hidden="true" />}
            {space ? '保存' : '创建空间'}
          </Button>
        </div>
      </form>

      {/* 归档是独立表单，必须放在上面的 </form> 之外：form 不能嵌套，
          HTML 解析会丢弃内层 form，导致 hydration 失败并重建整棵树。 */}
      {space ? <ArchiveButton spaceId={space.id} /> : null}

      {space ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <div className="space-y-2">
            <p className="text-sm font-medium">已拉入的班</p>
            {space.classes.length === 0 ? (
              <p className="text-xs text-muted-foreground">还没有拉班，这个空间暂时没有学生。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {space.classes.map((klass) => (
                  <ClassChip key={klass.classId} spaceId={space.id} classId={klass.classId} label={`${klass.className}（${klass.studentCount} 人）`} intent="remove" />
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">可以拉入的班</p>
            {availableClasses.length === 0 ? (
              <p className="text-xs text-muted-foreground">你任教的所有班都已在空间里。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableClasses.map((klass) => (
                  <ClassChip key={klass.classId} spaceId={space.id} classId={klass.classId} label={`${klass.className}（${klass.studentCount} 人）`} intent="add" />
                ))}
              </div>
            )}
          </div>
        </div>
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
      <Button type="submit" size="sm" variant={intent === 'add' ? 'outline' : 'secondary'} disabled={pending} className="cursor-pointer">
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

function ArchiveButton({ spaceId }: { spaceId: string }) {
  const [state, action, pending] = useActionState(archiveSpaceAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="space_id" value={spaceId} />
      <Button type="submit" variant="outline" disabled={pending} className="cursor-pointer">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 size-4" aria-hidden="true" />}
        归档
      </Button>
      {state.message ? (
        <span className={state.ok ? 'block pt-1 text-xs text-primary' : 'block pt-1 text-xs text-destructive'} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
