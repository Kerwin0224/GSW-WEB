import { redirect } from 'next/navigation';

import { getAppSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { AppRole, Database } from '@/lib/supabase/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export async function getProfile(): Promise<Profile | null> {
  const session = await getAppSession();
  if (!session) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', session.sub).maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return data;
}

/**
 * 页面侧鉴权判定只此一处。三个角色 layout 与 org 两个页面都走 requireProfile；
 * 它们此前各自手抄一遍 if 链，漏掉 must_change_password 检查的正是那份重复。
 */
async function loadProfile(role?: AppRole): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect('/login?error=profile_required');
  if (profile.status !== 'active') redirect('/login?error=account_disabled');
  if (role && profile.role !== role) redirect('/login?error=role_denied');
  return profile;
}

/**
 * RSC/页面侧的鉴权入口：失败即 redirect。
 *
 * 除了角色与状态，这里还必须重新判定 must_change_password：proxy 只能读 cookie 里的
 * 快照，管理员重置密码后用户手里的旧 cookie 仍是 false，proxy 会照常放行。页面侧每次
 * 都重新读库，才是那道真正拦得住的墙。
 *
 * API 路由侧请用 lib/data/common.ts 的 requireRole（返回 DataResult，不抛转跳）；
 * 两者都基于 getProfile()（每次调用重新读库，停用账号即时失效），分工不同勿混用。
 */
export async function requireProfile(role?: AppRole): Promise<Profile> {
  const profile = await loadProfile(role);
  // 跳转 URL 与 proxy.ts 的强制改密跳转同源，改动必须两处一起改。
  if (profile.must_change_password) redirect('/settings?required=1');
  return profile;
}

/**
 * /settings 专用逃生口：同样的角色/状态检查，但不查 must_change_password。
 *
 * 改密页自己必须能在 must_change_password 时渲染——否则 requireProfile 会把它弹回
 * /settings，用户永远改不了密码。只有改密页可以用它，别处用它等于把首登改密这项
 * 防护整个关掉。
 */
export async function requireProfileForPasswordChange(role?: AppRole): Promise<Profile> {
  return loadProfile(role);
}

/** Compatibility shim for older pages while they are migrated. Uses verified school-account session and Supabase profile only. */
export async function getUser(): Promise<{ sub: string; role: AppRole } | null> {
  const profile = await getProfile();
  if (!profile || profile.status !== 'active') return null;
  return { sub: profile.id, role: profile.role };
}
