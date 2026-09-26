'use server';

/**
 * account-provisioning.ts —— **建号的唯一出口**。
 *
 * 为什么单独成文件：账号创建此前散在三个地方（org.ts 建校管理员、admin.ts CSV 导入、
 * 平台自助开通），三处各自校验一次格式、各自调一次 RPC。放宽登录标识格式和换掉
 * 初始口令必须三处同时改，漏一处的后果是「有一个入口仍然拿账号本身当口令」——
 * 那正是最需要堵住的那个后门。收成一个出口之后，改一次就够。
 *
 * 依赖的 SQL（父 Agent 需把迁移补上，函数体见本文件末尾注释）：
 *   provision_school_account_v2 / provision_organization / set_initial_password_by_profile_v2
 * 三个函数都接受**显式的初始口令**，不再用 login_id 当口令。
 */

import { createDatabaseSessionSignature } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { generateOneTimePassword, resolveLoginIdPattern, validateSchoolLoginId } from '@/lib/school-login';

/** 建号结果。口令只在这一次返回里出现，库里不留明文。 */
export type ProvisionedAccount = {
  profileId: string;
  loginId: string;
  /** 一次性初始口令。仅此一次可读，管理员分发后即失效（首登强制改密）。 */
  initialPassword: string;
  /** true = 这次真的新建了账号；false = 同号已存在，只更新了姓名（口令未改动）。 */
  created: boolean;
};

export type ProvisionResult = { ok: true; data: ProvisionedAccount } | { ok: false; message: string };

/** 管理员也可以自己指定初始口令；不指定就生成一个随机的一次性口令。 */
export function resolveInitialPassword(requested?: string | null): string {
  const source = requested?.trim();
  // 沿用改密页的口径（至少 10 个字符、最多 72 字节），否则管理员指定的口令
  // 可能连自己第一次登录都过不去。
  if (source && source.length >= 10 && new TextEncoder().encode(source).length <= 72) return source;
  return generateOneTimePassword();
}

/**
 * 读目标学校的登录标识口径。
 *
 * 读不到就返回 null，由调用方决定回落到什么。**不抛错**：一次查询失败
 * 不该让管理员建不出账号，但也不能悄悄用一个更宽松的口径放行。
 */
export async function readSchoolLoginIdPattern(schoolId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('schools').select('login_id_pattern').eq('id', schoolId).maybeSingle();
  if (error) return null;
  return resolveLoginIdPattern(data?.login_id_pattern);
}

/**
 * 建一个学校账号（教师 / 学生 / 校管理员）。
 *
 * 口径从**目标学校**读，不从调用者读：org_admin 在 A 校建号，名册格式按 A 校走；
 * 账号却要能在 B 校登录时，那是 B 校的入口在管，不在这里。
 */
export async function provisionSchoolAccount(input: {
  schoolId: string;
  loginId: string;
  displayName: string;
  role: 'admin' | 'teacher' | 'student';
  initialPassword?: string | null;
}): Promise<ProvisionResult> {
  const pattern = await readSchoolLoginIdPattern(input.schoolId);
  const validated = validateSchoolLoginId(input.loginId, pattern);
  if (!validated.ok) return { ok: false, message: validated.message };
  if (!input.displayName.trim()) return { ok: false, message: '请填写姓名。' };

  const supabase = await createClient();
  // 重导入同一份名册时 RPC 只更新姓名、口令不动；此时不该给管理员发一个
  // 根本没生效的「一次性口令」。所以先问一次这台机器上有没有这个号。
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('school_id', input.schoolId)
    .eq('login_id', validated.loginId)
    .maybeSingle();
  const alreadyExisted = Boolean(existing?.id);

  const initialPassword = resolveInitialPassword(input.initialPassword);
  const { data, error } = await supabase.rpc('provision_school_account_v2', {
    p_login_id: validated.loginId,
    p_display_name: input.displayName.trim(),
    p_role: input.role,
    p_school_id: input.schoolId,
    p_initial_password: initialPassword,
    p_server_signature: createDatabaseSessionSignature('provision_school_account'),
  });
  if (error) return { ok: false, message: `账号创建失败：${error.message}` };
  const profileId = typeof data === 'string' ? data : (data as { id?: string } | null)?.id;
  if (!profileId) return { ok: false, message: '账号创建失败：数据库没有返回账号记录，请重试。' };

  return {
    ok: true,
    data: {
      profileId,
      loginId: validated.loginId,
      initialPassword,
      created: !alreadyExisted,
    },
  };
}

/**
 * 管理员重置某人的初始口令。
 *
 * 与 provisionSchoolAccount 同一条口令通道：重置出来的也是随机一次性口令，
 * 而不是"把账号本身还给他"。旧口令从此作废（RPC 内部递增 session_version）。
 */
export async function resetAccountInitialPassword(profileId: string): Promise<{ ok: true; initialPassword: string } | { ok: false; message: string }> {
  if (!profileId) return { ok: false, message: '请先选择要重置口令的账号。' };
  const initialPassword = generateOneTimePassword();
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_initial_password_by_profile_v2', {
    p_profile_id: profileId,
    p_password: initialPassword,
    p_server_signature: createDatabaseSessionSignature(`pw:${profileId}`),
  });
  if (error) return { ok: false, message: `口令重置失败：${error.message}` };
  return { ok: true, initialPassword };
}

/* ── SQL 契约（迁移未落库前的接线说明）────────────────────────────────────
 *
 * 三个函数都要「读 schools.login_id_pattern 校验」+「写显式初始口令」：
 *
 *   if v_login !~ (select login_id_pattern from public.schools where id = v_school) then
 *     raise exception 'invalid login id' using errcode = '22023';
 *   end if;
 *   ...
 *   update public.profiles
 *      set password_hash = extensions.crypt(p_initial_password, extensions.gen_salt('bf')),
 *          must_change_password = true,
 *          session_version = session_version + 1
 *    where id = v_id;
 *
 * authenticate_school_account_v4 只需删掉 `and p.login_id ~ '^\d{8}$'` 那一行。
 * ---------------------------------------------------------------------- */
