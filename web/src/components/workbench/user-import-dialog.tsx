'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, KeyRound, Loader2, Upload, XCircle } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { AdminDialogShell } from '@/components/workbench/admin-dialog-shell';
import { KIND_LABEL, planRows, succeededRowCount, type ExistingImportUser } from '@/app/admin/users/csv-import-plan';
import type { CsvUserPreview } from '@/lib/data/admin';

/**
 * 一个表头，七列。后两列（organization_id / space）可留空——
 * 留空即回落到当前管理员所在的学校，也就是改动前的行为。
 * 账号除了 8 位学号，也可以写邮箱、手机号或字母工号：
 * 格式由各单位的登录标识口径决定，不在代码里写死。
 */
const SAMPLE = `display_name,login_id,role,subject,class_name,organization_id,space
陈砚秋,20260101,student,,高一(1)班,,
沈立行,20180001,teacher,数学,高一(1)班,,
周砚,lingxue.zhou@example.com,teacher,物理,高二(2)班,,
许知微,13900001234,student,,高一(1)班,,必修一`;

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
  /** 本次**新建**账号的一次性初始口令。只在这一刻可读，离开页面就再也取不到了。 */
  credentials?: Array<{ rowNumber: number; loginId: string; displayName: string; initialPassword: string }>;
}) | ({ error: string; message?: string; resolution?: string; preview?: CsvUserPreview } & { imported?: number; succeededCount?: number; failedRow?: number });


/** /admin/users 带筛选时只拿得到筛选结果内的账号，此时"新建/更新"判定不完整。 */
export function UserImportDialog({ existingUsers = [], existingUsersPartial = false }: { existingUsers?: ExistingImportUser[]; existingUsersPartial?: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [csvText, setCsvText] = useState(SAMPLE);
  const [preview, setPreview] = useState<CsvUserPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /** 新账号的一次性初始口令。关掉弹窗即丢弃——库里不留明文，也没有第二次取回的机会。 */
  const [credentials, setCredentials] = useState<Array<{ rowNumber: number; loginId: string; displayName: string; initialPassword: string }>>([]);
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
      setSuccess('message' in data && data.message
        ? data.message
        : `导入完成：共处理 ${imported} 个账号（新建 ${counts.create}、更新 ${counts.update + counts.roleChange + counts.duplicate}）。`);
      // 覆盖已有账号的行不产生口令：它们的旧口令原样有效，
      // 发一个没生效的「初始口令」出去比不发更糟——管理员会以为该口令可用。
      setCredentials('credentials' in data && Array.isArray(data.credentials) ? data.credentials : []);
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
          <div className="space-y-1 rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            <p>必填四列：<span className="font-mono">display_name / login_id / role / class_name</span>；教师另需 <span className="font-mono">subject</span>。账号格式由所在单位的登录标识口径决定，可以是学号、工号、邮箱或手机号。</p>
            <p>可选两列：<span className="font-mono">organization_id</span> 指定这一行归到哪个下级单位，<span className="font-mono">space</span> 指定归到哪个空间（教师变共同教师，学生直接进空间）。两列都留空时回落到当前管理员所在的单位，与改动前一致。</p>
            <p>同一 login_id 在同一单位里会更新现有账号（姓名、角色、科目、班级），不重置口令；新账号会生成一次性初始口令，导入完成后显示一次。</p>
            <p>学生填写班级后按「迁入」处理：移除其原有的全部班级关系，并把历史项目与会话一并归到新班。名册是一份全量清单，清单里的一行就是这名学生此刻的全部归属。</p>
          </div>
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
          {credentials.length > 0 ? (
            <Alert>
              <KeyRound className="size-4" />
              <AlertTitle>一次性初始口令（只显示这一次）</AlertTitle>
              <AlertDescription>
                <p>请逐条单独转交给本人，不要群发、不要贴到公告里。首次登录会强制改密，之后这条口令立刻作废；离开本页就再也取不到了。</p>
                <ul className="mt-2 max-h-56 space-y-1 overflow-auto rounded-md border bg-background/70 p-2 font-mono text-xs">
                  {credentials.map((credential) => (
                    <li key={credential.rowNumber} className="flex flex-wrap items-baseline justify-between gap-2">
                      <span>{credential.displayName} · {credential.loginId}</span>
                      <span className="font-semibold tracking-wider">{credential.initialPassword}</span>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
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
