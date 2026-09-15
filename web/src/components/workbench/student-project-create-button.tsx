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
 * 学生自建项目。此前项目只能由 AI 从提问中识别篇目产生，
 * 学生想围绕"自己的专题"（例：文言虚词笔记）组织学习就没有入口。
 */
export function StudentProjectCreateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError('');
    startTransition(async () => {
      const formData = new FormData();
      formData.set('title', title);
      formData.set('author', author);
      const result = await createStudentProject(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`已创建项目《${result.title}》`);
      setOpen(false);
      setTitle('');
      setAuthor('');
      router.refresh();
    });
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" aria-hidden="true" />
        自定义项目
      </Button>
      <AdminDialogShell
        open={open}
        onOpenChange={setOpen}
        title="新建自定义项目"
        description="围绕自己想学的主题建一个项目，之后在这个项目里的提问同样会进入教师核实范围。"
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
              placeholder="例如：文言虚词笔记、一次函数易错点"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">不超过 80 字。已有的同名项目会直接复用，不会重复创建。</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="student-project-author">作者 / 出处（可选）</Label>
            <Input
              id="student-project-author"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="例如：苏轼、人教版必修一"
              maxLength={60}
            />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </div>
      </AdminDialogShell>
    </>
  );
}
