'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FolderTree, Loader2, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { importProjectCatalog, previewProjectCatalogCsv, type CatalogImportPreview } from '@/lib/data/project-catalog';

const SAMPLE = `path
语文/高一/文言文/《赤壁赋》
语文/高一/文言文/《静夜思》
语文/知识点/虚词/之
数学/初一/函数/一次函数`;

const kindLabel: Record<string, string> = {
  subject: '学科',
  grade: '年级',
  category: '类别',
  topic: '专题',
};

export function ProjectCatalogPanel({
  nodes,
  targetSchoolId,
  scopeLabel = '本校',
}: {
  nodes: Array<{ id: string; name: string; kind: string; path: string; schoolId: string | null }>;
  /** org_admin 为某校单独下发目录时传该校 id；不传走公司模板/本校。 */
  targetSchoolId?: string;
  scopeLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState(SAMPLE);
  const [preview, setPreview] = useState<CatalogImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function requestPreview(commit: boolean) {
    setError(null);
    startTransition(async () => {
      if (!commit) {
        setPreview(await previewProjectCatalogCsv(csvText));
        return;
      }
      const result = await importProjectCatalog(csvText, targetSchoolId ? { targetSchoolId } : {});
      if (result.ok) {
        toast.success(`已导入 ${result.created} 个目录节点`);
        setOpen(false);
        setPreview(null);
        router.refresh();
        return;
      }
      setError(result.message);
      setPreview(result.preview);
    });
  }

  // 按路径缩进展示层级：目录是树，纯列表会看不出从属关系。
  const sorted = [...nodes].sort((a, b) => a.path.localeCompare(b.path, 'zh'));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          目录决定项目归到什么。导入后用路径（如 <span className="font-mono text-xs">语文/高一/文言文</span>）表达层级，系统自动建父子节点。
        </p>
        <Button type="button" onClick={() => setOpen(true)}>
          <Upload className="mr-2 size-4" aria-hidden="true" />
          导入{scopeLabel}目录
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/25 px-4 py-6 text-center text-sm text-muted-foreground">
          还没有目录。导入一份目录后，项目即可按学科 / 年级 / 类别归属，不再局限于古诗文。
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>归属路径</TableHead>
                <TableHead className="w-24">层级</TableHead>
                <TableHead className="w-28">来源</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((node) => (
                <TableRow key={node.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <FolderTree className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {node.path}
                    </span>
                  </TableCell>
                  <TableCell><Badge variant="outline">{kindLabel[node.kind] ?? node.kind}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{node.schoolId ? '本校目录' : '公司模板'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AdminDialogShell
        open={open}
        onOpenChange={setOpen}
        title="导入项目归属目录"
        description="每行一个完整路径，用斜杠分隔层级。首列是路径，其余列忽略。已存在的同级节点会复用，不会重复创建。"
        icon={<Upload className="size-5" />}
        className="sm:max-w-3xl"
        footer={(
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => requestPreview(false)} disabled={pending || !csvText.trim()}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
              解析预览
            </Button>
            <Button type="button" onClick={() => requestPreview(true)} disabled={pending || !preview || preview.invalidCount > 0}>
              导入目录
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <Textarea value={csvText} onChange={(event) => { setCsvText(event.target.value); setPreview(null); setError(null); }} className="min-h-40 font-mono text-xs" />
          {error ? (
            <Alert variant="destructive">
              <XCircle className="size-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">有效 {preview.validCount}</Badge>
                <Badge variant={preview.invalidCount > 0 ? 'destructive' : 'secondary'}>错误 {preview.invalidCount}</Badge>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">行</TableHead>
                      <TableHead>路径</TableHead>
                      <TableHead className="w-40">状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell className="font-mono text-xs">{row.path || '-'}</TableCell>
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
    </div>
  );
}
