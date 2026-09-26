'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Loader2, Upload, XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { KIND_LABEL, planRows, succeededRowCount, type ExistingImportUser } from '@/app/admin/users/csv-import-plan';
import type { CsvUserPreview } from '@/lib/data/admin';

const SAMPLE = `display_name,login_id,role,subject,class_name
陈砚秋,20260101,student,,高一(1)班
沈立行,20180001,teacher,语文,高一(1)班`;

/**
 * 服务端返回形状随数据层演进（统一结构化 ActionState 后会带上 imported / succeededCount），
 * 这里全部按可选字段读取：拿不到就退回本地推算，UI 不会因此崩掉或谎报。
 */
type ImportResponse = (CsvUserPreview & {
  imported?: number;
  succeededCount?: number;
  failedRow?: number;
  message?: string;
  resolution?: string;
}) | ({ error: string; message?: string; resolution?: string; preview?: CsvUserPreview } & { imported?: number; succeededCount?: number; failedRow?: number });


/** /admin/users 带筛选时只拿得到筛选结果内的账号，此时"新建/更新"判定不完整。 */
export function UserImportDialog({ existingUsers = [], existingUsersPartial = false }: { existingUsers?: ExistingImportUser[]; existingUsersPartial?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [csvText, setCsvText] = useState(SAMPLE);
  const [preview, setPreview] = useState<CsvUserPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const plans = useMemo(() => (preview ? planRows(preview.rows, existingUsers) : []), [preview, existingUsers]);
  const counts = useMemo(() => ({
    create: plans.filter((plan) => plan.kind === 'create').length,
    update: plans.filter((plan) => plan.kind === 'update').length,
    roleChange: plans.filter((plan) => plan.kind === 'role-change').length,
    duplicate: plans.filter((plan) => plan.kind === 'duplicate').length,
    invalid: preview?.invalidCount ?? 0,
  }), [plans, preview]);
  /** 会覆盖已有账号的行：必须先确认再提交。 */
  const overwriting = counts.update + counts.roleChange + counts.duplicate;

  function requestPreview() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch('/api/admin/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, commit: false }),
      });
      const data = await response.json() as ImportResponse;
      if (!response.ok || 'error' in data) {
        setError('error' in data ? data.error : '解析失败');
        if ('preview' in data && data.preview) setPreview(data.preview);
        return;
      }
      setPreview(data as CsvUserPreview);
    });
  }

  function requestImport() {
    if (!preview) return;
    setConfirmOpen(false);
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch('/api/admin/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, commit: true }),
      });
      const data = await response.json() as ImportResponse;
      if (!response.ok || 'error' in data) {
        const message = 'error' in data ? data.error : '导入失败';
        // 数据层若回报 succeededCount 就直接用它；否则按「第 N 行」回推已写入的行数。
        const reported = 'succeededCount' in data && typeof data.succeededCount === 'number' ? data.succeededCount : undefined;
        const succeeded = succeededRowCount(message, plans, reported);
        setError(succeeded === null || succeeded === 0
          ? message
          : `${message}。已成功的 ${succeeded} 行不会自动回滚；修正后重新导入会按同号更新覆盖。`);
        if ('preview' in data && data.preview) setPreview(data.preview);
        return;
      }
      const imported = 'imported' in data && typeof data.imported === 'number' ? data.imported : preview.validCount;
      setSuccess(`导入完成：共处理 ${imported} 个账号（新建 ${counts.create}、更新 ${counts.update + counts.roleChange + counts.duplicate}）。`);
      setPreview(null);
      setCsvText(SAMPLE);
      // 弹窗留在原地显示结果，同时让背后的账号列表刷新到最新状态。
      router.refresh();
    });
  }

  const canImport = Boolean(preview) && counts.invalid === 0;

  return (
    <>
      <AdminDialogShell
        open={open}
        onOpenChange={setOpen}
        trigger={(
          <Button type="button">
            <Upload className="mr-2 size-4" />
            CSV 导入账号
          </Button>
        )}
        title="CSV 导入账号"
        description="先解析预览看清新建/更新/角色变化；任一行有误都会阻止提交。教师行必须填写 subject。"
        icon={<Upload className="size-5" />}
        className="sm:max-w-4xl"
        footer={(
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            {error ? <span className="mr-auto text-xs text-destructive">导入未完成</span> : null}
            {success ? <span className="mr-auto text-xs text-primary">{success}</span> : null}
            <Button type="button" variant="outline" onClick={requestPreview} disabled={pending || !csvText.trim()}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              解析预览
            </Button>
            <Button
              type="button"
              onClick={() => (overwriting > 0 ? setConfirmOpen(true) : requestImport())}
              disabled={pending || !canImport}
            >
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {overwriting > 0 ? `确认导入（含 ${overwriting} 个覆盖）` : '导入整批'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <Textarea
            value={csvText}
            onChange={(event) => {
              setCsvText(event.target.value);
              setPreview(null);
              setError(null);
              setSuccess(null);
            }}
            className="min-h-40 font-mono text-xs"
          />
          <p className="text-xs leading-5 text-muted-foreground">同一 login_id 会更新现有账号（姓名、角色、科目、班级）；导入账号统一设为启用。学生填写班级后会迁入该班级，教师可加入多个班级。</p>
          {existingUsersPartial ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>当前账号列表带筛选条件</AlertTitle>
              <AlertDescription>新建/更新判定只比对了当前筛选结果内的账号；筛选之外的同号账号仍会被服务端按"更新"处理。</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive" role="alert">
              <XCircle className="size-4" />
              <AlertTitle>导入失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">新建 {counts.create}</Badge>
                <Badge variant="secondary">更新 {counts.update}</Badge>
                <Badge variant={counts.roleChange > 0 ? 'destructive' : 'secondary'}>角色变化 {counts.roleChange}</Badge>
                {counts.duplicate > 0 ? <Badge variant="destructive">本批重复 {counts.duplicate}</Badge> : null}
                <Badge variant={counts.invalid > 0 ? 'destructive' : 'secondary'}>错误 {counts.invalid}</Badge>
              </div>
              {overwriting > 0 ? (
                <Alert>
                  <AlertTriangle className="size-4" />
                  <AlertTitle>这批会覆盖 {overwriting} 个已存在的账号</AlertTitle>
                  <AlertDescription>同名同号只更新资料，不会重置密码；角色变化会把该账号在教师/学生之间搬动，可能使其失去原有权限。</AlertDescription>
                </Alert>
              ) : null}
              <div className="max-h-80 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>行</TableHead>
                      <TableHead>姓名</TableHead>
                      <TableHead>账号</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>科目</TableHead>
                      <TableHead>班级</TableHead>
                      <TableHead>将发生</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((plan) => (
                      <TableRow key={plan.row.rowNumber}>
                        <TableCell>{plan.row.rowNumber}</TableCell>
                        <TableCell>{plan.row.displayName || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{plan.row.loginId || '-'}</TableCell>
                        <TableCell>{plan.row.role ?? '-'}</TableCell>
                        <TableCell>{plan.row.subject ?? '-'}</TableCell>
                        <TableCell>{plan.row.className ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant={plan.kind === 'invalid' ? 'destructive' : plan.kind === 'create' ? 'outline' : 'secondary'}>
                            {KIND_LABEL[plan.kind]}
                          </Badge>
                          {plan.kind === 'role-change' ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {plan.existingRole} → {plan.row.role}
                            </span>
                          ) : null}
                          {plan.kind === 'duplicate' ? (
                            <span className="ml-2 text-xs text-muted-foreground">与第 {plan.duplicateOfRow} 行同号</span>
                          ) : null}
                          {plan.kind === 'invalid' ? (
                            <span className="ml-2 text-xs text-destructive">{plan.row.errors.join('；')}</span>
                          ) : null}
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

      <AdminDialogShell
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="确认覆盖已有账号"
        description="下面这些账号已经存在，导入会按同号更新它们的资料与角色。"
        icon={<AlertTriangle className="size-5" />}
        className="max-w-2xl"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>返回修改</Button>
            <Button type="button" onClick={requestImport} disabled={pending}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              确认导入 {preview?.validCount ?? 0} 行
            </Button>
          </>
        )}
      >
        <ul className="divide-y rounded-lg border text-sm">
          {plans.filter((plan) => plan.kind === 'update' || plan.kind === 'role-change' || plan.kind === 'duplicate').map((plan) => (
            <li key={plan.row.rowNumber} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="font-medium">
                {plan.row.displayName} · <span className="font-mono text-xs">{plan.row.loginId}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {plan.kind === 'role-change'
                  ? `角色 ${plan.existingRole} → ${plan.row.role}（原：${plan.existingName}）`
                  : plan.kind === 'duplicate'
                    ? `与本批第 ${plan.duplicateOfRow} 行同号，后者覆盖前者`
                    : `更新资料（原：${plan.existingName}）`}
              </span>
            </li>
          ))}
        </ul>
      </AdminDialogShell>
    </>
  );
}
