'use server';

/**
 * tenant-signup.ts —— 新客户自助开通。
 *
 * 租户开通是通用 SaaS 的第一道门。此前每接一个客户都要平台运营手工插库：
 * 建 organization、建第一所学校、建 org_admin 账号、给初始口令。
 * 那条路走不通规模——运营不是增长瓶颈，产品是。
 *
 * 一次性 token 的生成与校验在 lib/signup-token.ts，走**现有**的
 * private.runtime_secrets 口径（同一把 CWB_AUTH_SECRET），不自建密钥体系：
 * 多出来的那一套迟早忘了轮换，忘了轮换的等于没有。
 */

import { createDatabaseSessionSignature } from '@/lib/session';
import { verifySignupToken } from '@/lib/signup-token';
import { createClient } from '@/lib/supabase/server';
import { resolveInitialPassword } from './account-provisioning';
import { validateLoginAttemptId } from '@/lib/school-login';

export type SignupInput = {
  token: string;
  organizationName: string;
  unitName: string;
  adminLoginId: string;
  adminDisplayName: string;
  adminPassword?: string;
};

export type SignupResult =
  | { ok: true; message: string; adminLoginId: string; initialPassword: string }
  | { ok: false; message: string };

/**
 * 开一个新客户：organization + 第一所学校 + 首位公司管理员。
 *
 * 一个事务走完（RPC），避免留下「有公司没管理员」的半开通状态——
 * 那种租户谁也进不去，只能运营手工收尾。
 */
export async function signUpTenant(input: SignupInput): Promise<SignupResult> {
  const organizationName = input.organizationName.trim();
  const unitName = input.unitName.trim();
  const adminDisplayName = input.adminDisplayName.trim();
  if (!organizationName || !unitName || !adminDisplayName) {
    return { ok: false, message: '请填写公司名称、下级单位名称与管理员姓名。' };
  }
  if (organizationName.length > 60 || unitName.length > 60) {
    return { ok: false, message: '公司名称与单位名称请控制在 60 字以内。' };
  }
  // 开通过程里还没有任何学校行可查，所以这里只做通用硬约束；
  // 租户口径（8 位数字 / 邮箱 / 手机号）建完号之后由管理员自己改。
  const loginId = validateLoginAttemptId(input.adminLoginId);
  if (!loginId.ok) return { ok: false, message: loginId.message };

  if (!verifySignupToken(input.token)) {
    return { ok: false, message: '开通凭证无效或已失效。请向平台运营索取新的开通凭证。' };
  }

  const initialPassword = resolveInitialPassword(input.adminPassword);
  const supabase = await createClient();
  const { error } = await supabase.rpc('provision_organization', {
    p_organization_name: organizationName,
    p_unit_name: unitName,
    p_admin_login_id: loginId.loginId,
    p_admin_display_name: adminDisplayName,
    p_initial_password: initialPassword,
    p_server_signature: createDatabaseSessionSignature('provision_organization'),
  });
  if (error) return { ok: false, message: `开通失败：${error.message}` };

  return {
    ok: true,
    message: `已为「${organizationName}」开通，管理员账号 ${loginId.loginId}。请把下面的一次性初始口令单独转交给本人，首次登录会强制改密。`,
    adminLoginId: loginId.loginId,
    initialPassword,
  };
}

/* ── SQL 契约（迁移未落库前的接线说明）────────────────────────────────────
 *
 *   create or replace function public.provision_organization(
 *     p_organization_name text, p_unit_name text, p_admin_login_id text,
 *     p_admin_display_name text, p_initial_password text, p_server_signature text
 *   ) returns uuid language plpgsql security definer set search_path to 'public','extensions'
 *   as $$
 *   declare v_org uuid; v_unit uuid; v_admin uuid; v_user uuid;
 *   begin
 *     if p_server_signature <> (select encode(extensions.hmac('provision_organization'::bytea,
 *            value::bytea,'sha256'),'hex') from private.runtime_secrets where name='cwb_auth_secret') then
 *       raise exception 'invalid server signature' using errcode='42501';
 *     end if;
 *     -- 已开通过就不再重复开：一个 token 只对一个客户生效
 *     if exists (select 1 from public.organizations where name = btrim(p_organization_name)) then
 *       raise exception 'organization % already exists', p_organization_name using errcode='23505';
 *     end if;
 *     insert into public.organizations (name) values (btrim(p_organization_name)) returning id into v_org;
 *     insert into public.schools (org_id, name, kind, education_stages, login_id_pattern)
 *       values (v_org, btrim(p_unit_name), 'school', '{}'::text[], '^\d{8}$') returning id into v_unit;
 *     insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
 *       values (gen_random_uuid(), p_admin_login_id || '@accounts.internal', 'provisioned', now(), now(), now())
 *       returning id into v_user;
 *     insert into public.profiles (id, login_id, display_name, role, status, organization_id, school_id, must_change_password)
 *       values (v_user, btrim(p_admin_login_id), btrim(p_admin_display_name), 'org_admin', 'active', v_org, v_unit, true);
 *     update public.profiles
 *        set password_hash = extensions.crypt(p_initial_password, extensions.gen_salt('bf')),
 *            must_change_password = true
 *      where id = v_user;
 *     return v_org;
 *   end $$;
 *
 * token 校验不在 DB 侧：它是**未认证**入口，能调 RPC 的人还没有会话，
 * 所以走应用层常量时间比较，RPC 侧只认服务端签名。
 * ---------------------------------------------------------------------- */
