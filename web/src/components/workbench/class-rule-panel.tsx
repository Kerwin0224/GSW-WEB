'use client';

import { useActionState, useState } from 'react';
import { Check, Loader2, Save, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/workbench/state-surfaces';
import { saveClassClassificationRule } from '@/lib/data/teacher-actions';
import type { AuditSubmissionState } from '@/lib/data/teacher-actions';
import type { TeacherClassRule } from '@/lib/data/teacher';

const initialState: AuditSubmissionState = { ok: false, message: '' };

const PLACEHOLDER = `只写「本班按什么分类」，不用管输出格式。例如：
· 语文老师：按学生实际在学的篇目归类——问题聚焦哪一篇就归到那篇（如《赤壁赋》《静夜思》）；问的是知识点（虚词、句式、修辞）时归到知识点名称，不要硬套到某篇作品上。
· 数学老师：按知识点归类，如「一次函数」「全等三角形」；综合题归到最主要的那个知识点。
分类依据由你定，写清楚学生的问题该归到哪一类即可。`;

/**
 * 项目归类规则配置（教师视角）。
 *
 * 产品语义：归类能力属于任课教师，不属于管理员。教师在这里写下本学科的归类口径，
 * 发布后本班学生的新提问就按这套规则归属项目。
 * 输出协议由系统拼接，教师只写"怎么归类"，改规则不会破坏解析。
 */
export function ClassRulePanel({ classes }: { classes: TeacherClassRule[] }) {
  const [selected, setSelected] = useState(classes[0]?.classId ?? '');
  const current = classes.find((klass) => klass.classId === selected);

  if (classes.length === 0) {
    return <EmptyState title="暂无可配置的班级" description="被分配为某班任课教师后，即可在这里配置该班的项目归类规则。" />;
  }

  return (
    <Card className="border-border/70 bg-card/88 shadow-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          项目归类规则
        </CardTitle>
        <CardDescription>
          为每个班写下本学科的归类口径。发布后，本班学生的新提问会按这套规则归属项目；未配置则用系统默认（按学习主题归类）。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {classes.map((klass) => (
            <Button
              key={klass.classId}
              type="button"
              size="sm"
              variant={selected === klass.classId ? 'default' : 'outline'}
              onClick={() => setSelected(klass.classId)}
              className="cursor-pointer"
            >
              {klass.className}
              <Badge variant={selected === klass.classId ? 'secondary' : 'outline'}>{klass.studentCount} 人</Badge>
            </Button>
          ))}
        </div>

        {/* key 让切换班级时编辑器整机重建，draft 随之重置——避免用 effect 把 A 班规则串到 B 班。 */}
        {current ? <ClassRuleEditor key={current.classId} klass={current} /> : null}
      </CardContent>
    </Card>
  );
}

function ClassRuleEditor({ klass }: { klass: TeacherClassRule }) {
  const [state, action, pending] = useActionState(saveClassClassificationRule, initialState);
  const [draft, setDraft] = useState(klass.rule ?? '');

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="class_id" value={klass.classId} />
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="class-rule">归类规则</Label>
          {klass.rule ? (
            <Badge variant="secondary" className="gap-1"><Check className="size-3" aria-hidden="true" />已生效</Badge>
          ) : klass.hasDraft ? (
            <Badge variant="outline">有草稿未发布</Badge>
          ) : (
            <Badge variant="outline">未配置，使用系统默认</Badge>
          )}
        </div>
        <Textarea
          id="class-rule"
          name="system_instruction"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={PLACEHOLDER}
          className="min-h-40"
        />
        <p className="text-xs leading-5 text-muted-foreground">
          只写“本学科怎么归类”。两行输出协议与“无法归属”约定由系统自动拼接，不需要你重复。
        </p>
        {/* 每师每班一条：同班其他学科教师的规则独立存在，这里只提示，不在这里改写。 */}
        {klass.peerRuleCount > 0 ? (
          <p className="text-xs text-muted-foreground">本班另有 {klass.peerRuleCount} 位任课教师配置了各自学科的规则。</p>
        ) : null}
      </div>
      {state.message ? (
        <p className={state.ok ? 'rounded-lg border border-primary/30 bg-primary/10 p-2 text-sm text-primary' : 'rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive'} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={pending} className="cursor-pointer">
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 size-4" aria-hidden="true" />}
          存为草稿
        </Button>
        <Button type="submit" name="publish" value="true" disabled={pending || !draft.trim()} className="cursor-pointer">
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Check className="mr-2 size-4" aria-hidden="true" />}
          发布到本班
        </Button>
      </div>
    </form>
  );
}
