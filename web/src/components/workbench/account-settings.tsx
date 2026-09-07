'use client';

import type { SubmitEvent } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AccountAvatar, accountAvatarOptions } from '@/components/workbench/account-avatar';
import { RoleBadge } from '@/components/workbench/role-badge';
import {
  accountPasswordSchema,
  avatarKeySchema,
  type AvatarKey,
} from '@/lib/account-settings';
import type { AppRole } from '@/lib/supabase/database.types';

const avatarResponseSchema = z.union([
  z.object({ ok: z.literal(true), avatarKey: avatarKeySchema }),
  z.object({ error: z.string() }),
]);
const passwordResponseSchema = z.union([
  z.object({ ok: z.literal(true), message: z.string() }),
  z.object({ error: z.string() }),
]);

type Feedback =
  | { readonly kind: 'idle'; readonly message: '' }
  | { readonly kind: 'success' | 'error'; readonly message: string };

type AccountSettingsProps = {
  readonly avatarKey: AvatarKey;
  readonly displayName: string;
  readonly loginId: string;
  readonly accountRole: AppRole;
};

type PasswordField = 'currentPassword' | 'newPassword' | 'confirmPassword';

const idleFeedback: Feedback = { kind: 'idle', message: '' };

export function AccountSettings({ avatarKey, displayName, loginId, accountRole }: AccountSettingsProps) {
  const router = useRouter();
  const [savedAvatarKey, setSavedAvatarKey] = useState(avatarKey);
  const [selectedAvatarKey, setSelectedAvatarKey] = useState(avatarKey);
  const [avatarFeedback, setAvatarFeedback] = useState<Feedback>(idleFeedback);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(idleFeedback);
  const [invalidPasswordField, setInvalidPasswordField] = useState<PasswordField | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const saveAvatar = async () => {
    setIsSavingAvatar(true);
    setAvatarFeedback(idleFeedback);

    try {
      const response = await fetch('/api/account/avatar', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avatarKey: selectedAvatarKey }),
      });
      const parsed = avatarResponseSchema.safeParse(await response.json());
      if (!parsed.success || !response.ok || !('ok' in parsed.data)) {
        setAvatarFeedback({
          kind: 'error',
          message: parsed.success && 'error' in parsed.data ? parsed.data.error : '头像保存失败，请稍后重试。',
        });
        return;
      }

      setSavedAvatarKey(parsed.data.avatarKey);
      setSelectedAvatarKey(parsed.data.avatarKey);
      setAvatarFeedback({ kind: 'success', message: '头像已更新。' });
      router.refresh();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setAvatarFeedback({ kind: 'error', message: '网络连接失败，请稍后重试。' });
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const changePassword = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordFeedback(idleFeedback);
    setInvalidPasswordField(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const input = {
      currentPassword: String(formData.get('currentPassword') ?? ''),
      newPassword: String(formData.get('newPassword') ?? ''),
      confirmPassword: String(formData.get('confirmPassword') ?? ''),
    };
    const parsedInput = accountPasswordSchema.safeParse(input);
    if (!parsedInput.success) {
      const issueField = parsedInput.error.issues[0]?.path[0];
      setInvalidPasswordField(issueField === 'currentPassword' || issueField === 'newPassword' || issueField === 'confirmPassword' ? issueField : null);
      setPasswordFeedback({ kind: 'error', message: parsedInput.error.issues[0]?.message ?? '密码信息无效。' });
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsedInput.data),
      });
      const parsed = passwordResponseSchema.safeParse(await response.json());
      if (!parsed.success || !response.ok || !('ok' in parsed.data)) {
        setInvalidPasswordField(response.status === 403 ? 'currentPassword' : null);
        setPasswordFeedback({
          kind: 'error',
          message: parsed.success && 'error' in parsed.data ? parsed.data.error : '密码更新失败，请稍后重试。',
        });
        return;
      }

      form.reset();
      setPasswordFeedback({ kind: 'success', message: parsed.data.message });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setPasswordFeedback({ kind: 'error', message: '网络连接失败，请稍后重试。' });
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="space-y-2 border-b border-border/60 pb-6">
        <h1 className="font-sans text-2xl font-semibold tracking-tight sm:text-3xl">账号设置</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          管理本人头像和登录密码。角色、班级与账号状态<span className="whitespace-nowrap">仍由学校管理员维护。</span>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-lg"><h2 className="font-sans">个人头像</h2></CardTitle>
            <CardDescription>头像只使用系统内置图案，不会上传照片<span className="whitespace-nowrap">或连接外部图片。</span></CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-muted/35 p-4">
              <AccountAvatar avatarKey={savedAvatarKey} className="size-14" iconClassName="size-6" />
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium">{displayName}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <RoleBadge role={accountRole} />
                  <span className="font-mono">{loginId}</span>
                </div>
              </div>
            </div>

            <fieldset disabled={isSavingAvatar} className="space-y-3">
              <legend className="text-sm font-medium">选择头像</legend>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-3">
                {accountAvatarOptions.map((option) => {
                  const selected = selectedAvatarKey === option.key;
                  return (
                    <Label
                      key={option.key}
                      className={`relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border p-3 text-xs transition-colors has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 ${selected ? 'border-primary bg-primary/8 text-primary ring-2 ring-primary/20' : 'border-border/60 bg-background hover:border-primary/50 hover:bg-muted/40'}`}
                    >
                      <input
                        type="radio"
                        name="avatarKey"
                        value={option.key}
                        checked={selected}
                        onChange={() => setSelectedAvatarKey(option.key)}
                        className="sr-only"
                      />
                      <AccountAvatar avatarKey={option.key} />
                      <span>{option.label}</span>
                      {selected ? <Check className="absolute right-2 top-2 size-3.5" aria-hidden="true" /> : null}
                    </Label>
                  );
                })}
              </div>
            </fieldset>

            {avatarFeedback.kind !== 'idle' ? (
              <Alert variant={avatarFeedback.kind === 'error' ? 'destructive' : 'default'} role={avatarFeedback.kind === 'error' ? 'alert' : 'status'}>
                <AlertTitle>{avatarFeedback.kind === 'error' ? '头像未保存' : '保存成功'}</AlertTitle>
                <AlertDescription>{avatarFeedback.message}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="button"
              size="lg"
              disabled={isSavingAvatar || selectedAvatarKey === savedAvatarKey}
              onClick={() => void saveAvatar()}
              className="w-full sm:w-auto"
            >
              {isSavingAvatar ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              {isSavingAvatar ? '保存中' : '保存头像'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-lg"><h2 className="font-sans">修改密码</h2></CardTitle>
            <CardDescription>修改前需要验证当前密码。成功后，其他设备上的旧登录会失效。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={(event) => void changePassword(event)}>
              <div className="space-y-2">
                <Label htmlFor="currentPassword">当前密码</Label>
                <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required aria-invalid={invalidPasswordField === 'currentPassword'} aria-describedby={invalidPasswordField === 'currentPassword' ? 'password-feedback' : undefined} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">新密码</Label>
                <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required aria-invalid={invalidPasswordField === 'newPassword'} aria-describedby={invalidPasswordField === 'newPassword' ? 'password-guidance password-feedback' : 'password-guidance'} className="h-11" />
                <p id="password-guidance" className="text-xs leading-relaxed text-muted-foreground">至少 10 个字符。建议使用一段容易记住、<span className="whitespace-nowrap">难以猜中的短语；</span>过长时会提示缩短。</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认新密码</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required aria-invalid={invalidPasswordField === 'confirmPassword'} aria-describedby={invalidPasswordField === 'confirmPassword' ? 'password-feedback' : undefined} className="h-11" />
              </div>

              {passwordFeedback.kind !== 'idle' ? (
                <Alert id="password-feedback" variant={passwordFeedback.kind === 'error' ? 'destructive' : 'default'} role={passwordFeedback.kind === 'error' ? 'alert' : 'status'}>
                  <AlertTitle>{passwordFeedback.kind === 'error' ? '密码未更新' : '修改成功'}</AlertTitle>
                  <AlertDescription>{passwordFeedback.message}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                  密码由学校账户系统加密保存
                </div>
                <Button type="submit" size="lg" disabled={isSavingPassword}>
                  {isSavingPassword ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
                  {isSavingPassword ? '更新中' : '更新密码'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
