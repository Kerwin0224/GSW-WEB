import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AppRole, Database } from '@/lib/supabase/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export async function getSessionUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function getProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw new Error(`Profile lookup failed: ${error.message}`);
  return data;
}

export async function requireProfile(role?: AppRole): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect('/login?error=profile_required');
  if (profile.status !== 'active') redirect('/login?error=account_disabled');
  if (role && profile.role !== role) redirect('/login?error=role_denied');
  return profile;
}

export async function clearLegacySessionCookie() {
  const store = await cookies();
  store.delete('cwb_token');
}

/** Compatibility shim for older pages while they are migrated. Uses verified Supabase profile only. */
export async function getUser(): Promise<{ sub: string; role: AppRole } | null> {
  const profile = await getProfile();
  if (!profile || profile.status !== 'active') return null;
  return { sub: profile.id, role: profile.role };
}
