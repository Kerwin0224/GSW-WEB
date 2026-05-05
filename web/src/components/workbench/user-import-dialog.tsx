'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Loader2, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import type { CsvUserPreview } from '@/lib/data/admin';

type ImportResponse = CsvUserPreview | { error: string; preview?: CsvUserPreview };

const SAMPLE = `display_name,login_id,role,class_name,last_login_at
王同学,20260001,student,高一(3)班,
李老师,T2026001,teacher,高一(3)班,`;

export function UserImportDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState(SAMPLE);
  const [preview, setPreview] = useState<CsvUserPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function requestPreview(commit: boolean) {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/admin/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, commit }),
      });
      const data = await response.json() as ImportResponse | { ok: true; imported: number };
      if (!response.ok || 'error' in data) {
        setError('error' in data ? data.error : '导入失败');
        if ('preview' in data && data.preview) setPreview(data.preview);
        return;
      }
      if ('imported' in data) {
        toast.success(`已导入 ${data.imported} 个账号`);
        setOpen(false);
        router.refresh();
        return;
      }
      setPreview(data);
    });
  }

  return (
    <AdminDialogShell
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="CSV 导入账号"
      description="先解析并显示行级预览；存在错误时不会提交。表头必须包含 display_name, login_id, role。"
      icon={<Upload className="size-5" />}
      className="max-w-4xl"
      footer={(
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => requestPreview(false)} disabled={pending || !csvText.trim()}>
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            解析预览
          </Button>
          <Button type="button" onClick={() => requestPreview(true)} disabled={pending || !preview || preview.invalidCount > 0}>
            提交有效行
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <Textarea
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          className="min-h-40 font-mono text-xs"
        />
        {error ? (
          <Alert variant="destructive">
            <XCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">有效 {preview.validCount}</Badge>
              <Badge variant={preview.invalidCount > 0 ? 'destructive' : 'secondary'}>错误 {preview.invalidCount}</Badge>
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>行</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>账号</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>班级</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.displayName || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.loginId || '-'}</TableCell>
                      <TableCell>{row.role ?? '-'}</TableCell>
                      <TableCell>{row.className ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'valid' ? 'secondary' : 'destructive'}>
                          {row.status === 'valid' ? '可导入' : row.errors.join('；')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </div>
    </AdminDialogShell>
  );
}
