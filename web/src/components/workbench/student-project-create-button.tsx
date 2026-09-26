'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { createStudentProject } from '@/lib/data/student-projects';

/**
 * 学生自建项目。此前项目只能由 AI 从提问中识别产生，
 * 学生想围绕"自己的专题"（例：文言虚词笔记）组织学习就没有入口。
 */
export function StudentProjectCreateButton({ spaceId }: { spaceId?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError('');
    startTransition(async () => {
      const formData = new FormData();
      formData.set('name', title);
      if (spaceId) formData.set('space_id', spaceId);
      formData.set('subtitle', subtitle);
      const result = await createStudentProject(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`已创建项目《${result.name}》`);
      setOpen(false);
      setTitle('');
      setSubtitle('');
      router.refresh();
    });
  };

  return (
    <>
      <Button type="button" variant="outline" disabled={!spaceId} title={spaceId ? '在当前空间创建项目' : '请先从学习提问页选择空间'} onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" aria-hidden="true" />
        自定义项目
      </Button>
      <AdminDialogShell
        open={open}
        onOpenChange={setOpen}
        title="新建自定义项目"
        description="围绕自己想学的主题建一个项目，之后可以在这里继续提问。"
        icon={<Plus className="size-5" />}
        footer={(
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>取消</Button>
            <Button type="button" onClick={submit} disabled={pending || !title.trim()}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              创建项目
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="student-project-title">项目名称</Label>
            <Input
              id="student-project-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：第三单元复习、阅读专题、易错点整理"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">不超过 80 字。已有的同名项目会直接复用，不会重复创建。</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="student-project-author">补充标识（可选）</Label>
            <Input
              id="student-project-author"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="例如：作者、版本、单元"
              maxLength={60}
            />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </div>
      </AdminDialogShell>
    </>
  );
}
