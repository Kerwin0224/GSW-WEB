'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus, Trash2, UsersRound, XCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { addClassMember, removeClassMember, type AdminActionState, type AdminClassListItem, type AdminUserListItem } from '@/lib/data/admin';
import { cn } from '@/lib/utils';

type AdminClassMembersDialogProps = {
  klass: AdminClassListItem;
  users: AdminUserListItem[];
};


/** 移除确认弹窗的目标：成员本身 + 它是不是最后一位负责教师。 */
type RemoveTarget = AdminClassListItem['teachers'][number] & { isLastTeacher: boolean };

function Feedback({ feedback }: { feedback: { ok: boolean; message: string } | null }) {
  if (!feedback) return null;
  return (
    <Alert variant={feedback.ok ? 'default' : 'destructive'} role={feedback.ok ? 'status' : 'alert'}>
      {feedback.ok ? null : <XCircle className="size-4" />}
      <AlertDescription>{feedback.message}</AlertDescription>
    </Alert>
  );
}

/**
 * 按姓名 / 学号搜索的成员选择器。
 * 此前是 <Input list=...> 让人手填 profile id（UUID）——普通管理员无从核对，
 * 填错只能静默失败。现在只能从候选里选，搜索匹配姓名与学号。
 */
function MemberPicker({ candidates, value, onChange, disabled, label }: {
  candidates: AdminUserListItem[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = candidates.find((user) => user.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal" />
        }
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? `${selected.displayName} · ${selected.loginId ?? '未设置账号'}` : label}
        </span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="输入姓名或学号搜索" />
          <CommandList>
            <CommandEmpty>没有匹配的账号。请先在用户管理里创建或搜索别的姓名/学号。</CommandEmpty>
            <CommandGroup>
              {candidates.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`${user.displayName} ${user.loginId ?? ''} ${user.assignmentSummary}`}
                  onSelect={() => {
                    onChange(user.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 size-4', value === user.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{user.displayName}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{user.loginId ?? '未设置账号'}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MemberList({ members, roleLabel, onRemove, disabledMemberId }: {
  members: AdminClassListItem['teachers'];
  roleLabel: string;
  onRemove: (member: AdminClassListItem['teachers'][number]) => void;
  /** 最后一位负责教师：按钮直接禁用，点了也进不了确认弹窗。 */
  disabledMemberId?: string | null;
}) {
  if (members.length === 0) {
    return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">暂无{roleLabel}成员。</p>;
  }
  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background/70 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.profile?.displayName ?? '未命名账号'}</p>
            <p className="font-mono text-xs text-muted-foreground">{member.profile?.loginId ?? '未设置账号'} · {new Date(member.createdAt).toLocaleString('zh-CN')}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRemove(member)}
            disabled={member.id === disabledMemberId}
            title={member.id === disabledMemberId ? '最后一位负责教师，不能移除' : undefined}
          >
            <Trash2 className="mr-1 size-3.5" />
            移除
          </Button>
        </div>
      ))}
    </div>
  );
}

function AddMemberForm({ klass, users, memberRole }: { klass: AdminClassListItem; users: AdminUserListItem[]; memberRole: 'teacher' | 'student' }) {
  const roleLabel = memberRole === 'teacher' ? '教师' : '学生';
  // 学生的两种入班方式数据后果完全不同（迁班会改写全部历史归属），必须让管理员显式选，默认迁班。
  const [membershipMode, setMembershipMode] = useState<'transfer' | 'add'>('transfer');
  const [selectedId, setSelectedId] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // 数据层只接受启用中的账号；已停用/角色不符的账号列出来只会点了没反应。
  const candidates = useMemo(
    () => users.filter((user) => user.role === memberRole && user.status === 'active'),
    [users, memberRole],
  );

  function submit() {
    if (!selectedId) {
      setFeedback({ ok: false, message: `请先选择要加入的${roleLabel}账号。` });
      return;
    }
    setFeedback(null);
    const formData = new FormData();
    formData.set('class_id', klass.id);
    formData.set('role', memberRole);
    formData.set('profile_id', selectedId);
    if (memberRole === 'student') formData.set('membership_mode', membershipMode);
    startTransition(async () => {
      const result: AdminActionState = await addClassMember(formData);
      if (result && !result.ok) {
        setFeedback({ ok: false, message: result.message ?? '添加失败。' });
        return;
      }
      setSelectedId('');
      setFeedback({ ok: true, message: result.message ?? `已添加${roleLabel}。` });
    });
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background/70 p-4">
      <div className="space-y-2">
        <Label>添加{roleLabel}账号</Label>
        <MemberPicker
          candidates={candidates}
          value={selectedId}
          onChange={setSelectedId}
          disabled={pending || candidates.length === 0}
          label={candidates.length === 0 ? `没有可选的启用中${roleLabel}账号` : `选择${roleLabel}（按姓名或学号搜索）`}
        />
        {candidates.length > 0 ? <p className="text-xs text-muted-foreground">共 {candidates.length} 个启用中的{roleLabel}账号可选。</p> : null}
      </div>
      {memberRole === 'student' ? (
        <div className="space-y-2">
          <Label>入班方式</Label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'transfer' as const, label: '迁班' },
              { value: 'add' as const, label: '加入' },
            ]).map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={membershipMode === option.value ? 'default' : 'outline'}
                aria-pressed={membershipMode === option.value}
                onClick={() => setMembershipMode(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <p className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs text-primary">
            {membershipMode === 'transfer'
              ? '迁班：学生会离开原班级，历史项目与未删除的学习会话一并改归本班，供本班教师核实完整学习记录。'
              : '加入：学生在保留原班级的同时归属本班，历史项目与会话仍归原班级不变。'}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">教师可以负责多个班级；重复加入同一班级会被忽略。</p>
      )}
      <Button type="button" onClick={submit} disabled={pending || !selectedId} className="w-full">
        {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}
        {pending ? '添加中…' : `添加${roleLabel}`}
      </Button>
      <Feedback feedback={feedback} />
    </div>
  );
}

export function AdminClassMembersDialog({ klass, users }: AdminClassMembersDialogProps) {
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [removeFeedback, setRemoveFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const lastTeacherId = klass.teachers.length <= 1 ? (klass.teachers[0]?.id ?? null) : null;

  function confirmRemove() {
    if (!removeTarget) return;
    const formData = new FormData();
    formData.set('membership_id', removeTarget.id);
    startTransition(async () => {
      const result: AdminActionState = await removeClassMember(formData);
      if (result && !result.ok) {
        setRemoveFeedback({ ok: false, message: result.message ?? '移除失败。' });
        return;
      }
      setRemoveFeedback({ ok: true, message: result.message ?? '已移除该成员。' });
      setRemoveTarget(null);
    });
  }

  return (
    <>
      <AdminDialogShell
        trigger={(
          <Button type="button" variant="outline" className="w-full">
            <UsersRound className="mr-2 size-4" />
            成员分配
          </Button>
        )}
        title={`${klass.name} · 成员分配`}
        description="搜索姓名或学号添加成员；移除需要确认，失败原因会直接显示在这里。"
        icon={<UsersRound className="size-5" />}
        className="max-w-4xl"
      >
        <Tabs defaultValue="teachers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="teachers">教师 <Badge variant="outline">{klass.teachers.length}</Badge></TabsTrigger>
            <TabsTrigger value="students">学生 <Badge variant="outline">{klass.students.length}</Badge></TabsTrigger>
          </TabsList>
          <TabsContent value="teachers" className="space-y-4">
            {klass.teachers.length === 1 ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">该班级只有这一位负责教师，移除按钮已禁用：移除后教学总览和学习记录核实将没有负责人。请先添加另一位教师。</p>
            ) : null}
            <AddMemberForm klass={klass} users={users} memberRole="teacher" />
            <ScrollArea className="max-h-80 pr-3">
              <MemberList
                members={klass.teachers}
                roleLabel="教师"
                disabledMemberId={lastTeacherId}
                onRemove={(member) => { setRemoveFeedback(null); setRemoveTarget({ ...member, isLastTeacher: member.id === lastTeacherId }); }}
              />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="students" className="space-y-4">
            <AddMemberForm klass={klass} users={users} memberRole="student" />
            <ScrollArea className="max-h-80 pr-3">
              <MemberList
                members={klass.students}
                roleLabel="学生"
                onRemove={(member) => { setRemoveFeedback(null); setRemoveTarget({ ...member, isLastTeacher: false }); }}
              />
            </ScrollArea>
          </TabsContent>
          <Feedback feedback={removeFeedback} />
        </Tabs>
      </AdminDialogShell>

      <AdminDialogShell
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open && !pending) setRemoveTarget(null); }}
        title={`移除成员「${removeTarget?.profile?.displayName ?? '未命名账号'}」`}
        description="移除后该账号将不再属于本班级，其权限范围随之变化。"
        icon={<Trash2 className="size-5" />}
        className="max-w-md"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)} disabled={pending}>取消</Button>
            <Button type="button" variant="destructive" onClick={confirmRemove} disabled={pending || removeTarget?.isLastTeacher}>
              {pending ? <><Loader2 className="mr-2 size-4 animate-spin" />处理中…</> : '确认移除'}
            </Button>
          </>
        )}
      >
        <Alert variant={removeTarget?.isLastTeacher ? 'destructive' : 'default'}>
          {removeTarget?.isLastTeacher ? <XCircle className="size-4" /> : null}
          <AlertDescription>
            {removeTarget?.isLastTeacher
              ? '这是该班级最后一位负责教师，请先添加另一位教师再移除。'
              : '移除会立即生效：学生的历史项目与学习记录会转由新班级教师负责，教师的核实范围也会随之变化。'}
          </AlertDescription>
        </Alert>
      </AdminDialogShell>
    </>
  );
}
