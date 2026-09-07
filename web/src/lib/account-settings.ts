import { z } from 'zod';

export const AVATAR_KEYS = ['ink', 'pine', 'cinnabar', 'moon', 'bamboo', 'plum'] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

export const avatarKeySchema = z.enum(AVATAR_KEYS);

const passwordSchema = z
  .string()
  .min(10, '密码至少需要 10 个字符')
  .max(128, '密码不能超过 128 个字符')
  .refine((value) => new TextEncoder().encode(value).length <= 72, '密码不能超过 72 个字节');

export const accountPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '请输入当前密码').max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine(({ currentPassword, newPassword, confirmPassword }, context) => {
    if (newPassword === currentPassword) {
      context.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: '新密码不能与当前密码相同',
      });
    }

    if (newPassword !== confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: '两次输入的新密码不一致',
      });
    }
  });

export const avatarUpdateSchema = z.object({ avatarKey: avatarKeySchema });

export type AccountPasswordInput = z.infer<typeof accountPasswordSchema>;

const postgresUuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);

export const accountRpcProfileSchema = z.object({
  id: postgresUuidSchema,
  login_id: z.string(),
  role: z.enum(['admin', 'teacher', 'student']),
  display_name: z.string(),
  avatar_key: avatarKeySchema,
  session_version: z.number().int().nonnegative(),
});

export const accountRpcProfilesSchema = z.array(accountRpcProfileSchema);

const rpcErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
});

export type PasswordChangeResult =
  | { readonly kind: 'success'; readonly account: z.infer<typeof accountRpcProfileSchema> }
  | { readonly kind: 'current-password-rejected' }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'service-error' };

export function resolvePasswordChangeResult(data: unknown, error: unknown): PasswordChangeResult {
  if (error) {
    const parsedError = rpcErrorSchema.safeParse(error);
    if (!parsedError.success) return { kind: 'service-error' };
    if (parsedError.data.message.includes('password_rate_limited')) return { kind: 'rate-limited' };
    if (parsedError.data.code === '42501') return { kind: 'unauthenticated' };
    return { kind: 'service-error' };
  }

  const parsedAccounts = accountRpcProfilesSchema.safeParse(data);
  if (!parsedAccounts.success) return { kind: 'service-error' };
  const account = parsedAccounts.data[0];
  return account ? { kind: 'success', account } : { kind: 'current-password-rejected' };
}
