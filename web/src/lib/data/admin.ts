'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { AuditKind } from '@/lib/supabase/database.types';
import { capabilities } from '@/components/workbench/provider-capability-matrix';
import { fail, ok, requireRole } from './common';

export async function getAdminDashboard() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [users, classes, providers, presets, mcp, exports] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('classes').select('*').order('created_at', { ascending: false }),
    supabase.from('provider_capabilities').select('capability,is_enabled,provider_configs!inner(is_enabled)').eq('is_enabled', true),
    supabase.from('prompt_presets').select('*').eq('status', 'published'),
    supabase.from('mcp_servers').select('*').eq('is_enabled', true),
    supabase.from('export_batches').select('*').order('created_at', { ascending: false }).limit(10),
  ]);
  for (const result of [users, classes, providers, presets, mcp, exports]) if (result.error) return fail('error', result.error.message);
  const readyCaps = new Set(((providers.data ?? []) as Array<{ capability: string; provider_configs?: { is_enabled?: boolean } | Array<{ is_enabled?: boolean }> }>).filter((row) => { const provider = Array.isArray(row.provider_configs) ? row.provider_configs[0] : row.provider_configs; return provider?.is_enabled; }).map((row) => row.capability));
  return ok({ users: users.data ?? [], classes: classes.data ?? [], readyCaps, presets: presets.data ?? [], mcp: mcp.data ?? [], exports: exports.data ?? [] });
}

export async function getAdminClasses() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('classes').select('*, class_memberships(id, role, profiles(display_name, login_id, role))').order('created_at', { ascending: false });
  if (error) return fail('error', `班级关系加载失败：${error.message}`);
  return ok(data ?? []);
}

export async function createClass(formData: FormData): Promise<void> {
  const role = await requireRole('admin');
  if (!role.ok) return;
  const name = String(formData.get('name') ?? '').trim();
  const grade = String(formData.get('grade') ?? '').trim() || null;
  if (!name) return;
  const supabase = await createClient();
  const { error } = await supabase.from('classes').insert({ name, grade, created_by: role.data.id });
  if (error) return;
  revalidatePath('/admin/classes');
  revalidatePath('/admin');
  return;
}

export async function getAdminProviders() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('provider_configs').select('*, provider_capabilities(*)').order('created_at', { ascending: false });
  if (error) return fail('error', `Provider 能力加载失败：${error.message}`);
  return ok(data ?? []);
}

export async function saveProviderConfig(formData: FormData): Promise<void> {
  const role = await requireRole('admin');
  if (!role.ok) return;
  const name = String(formData.get('name') ?? '').trim();
  const provider_type = String(formData.get('provider_type') ?? '').trim();
  const base_url = String(formData.get('base_url') ?? '').trim() || null;
  const secret_ref = String(formData.get('secret_ref') ?? '').trim();
  const secret_last_four = String(formData.get('secret_last_four') ?? '').trim() || null;
  const model_id = String(formData.get('model_id') ?? '').trim();
  const selected = capabilities.filter((capability) => formData.get(capability) === 'on');
  if (!name || !provider_type || !secret_ref.startsWith('env:') || !model_id || selected.length === 0) return;
  const supabase = await createClient();
  const { data: provider, error } = await supabase.from('provider_configs').insert({ name, provider_type, base_url, secret_ref, secret_last_four, is_enabled: true, health_status: 'unchecked', created_by: role.data.id }).select('id').single();
  if (error) return;
  const { error: capError } = await supabase.from('provider_capabilities').insert(selected.map((capability) => ({ provider_id: provider.id, capability, model_id, is_enabled: true })));
  if (capError) return;
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
  return;
}

export async function getAdminMcp() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('mcp_servers').select('*').order('created_at', { ascending: false });
  if (error) return fail('error', `MCP 能力加载失败：${error.message}`);
  return ok(data ?? []);
}

export async function getAdminPresets() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data, error } = await supabase.from('prompt_presets').select('*').order('updated_at', { ascending: false });
  if (error) return fail('error', `Prompt 预设加载失败：${error.message}`);
  return ok(data ?? []);
}

export async function savePromptPreset(formData: FormData): Promise<void> {
  const role = await requireRole('admin');
  if (!role.ok) return;
  const title = String(formData.get('title') ?? '').trim();
  const scenario = String(formData.get('scenario') ?? '').trim();
  const system_instruction = String(formData.get('system_instruction') ?? '').trim();
  const variables = String(formData.get('variables') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const status = String(formData.get('status') ?? 'draft') as 'draft' | 'published' | 'disabled';
  if (!title || !scenario || !system_instruction) return;
  const supabase = await createClient();
  const { error } = await supabase.from('prompt_presets').insert({ title, scenario, system_instruction, variables, status, target_role: 'teacher', created_by: role.data.id });
  if (error) return;
  revalidatePath('/admin/presets');
  revalidatePath('/teacher');
  return;
}

export async function getAdminExports() {
  const role = await requireRole('admin');
  if (!role.ok) return role;
  const supabase = await createClient();
  const [{ data: approved, error: approvedError }, { data: history, error: historyError }] = await Promise.all([
    supabase.from('audit_records').select('*').eq('status', 'approved'),
    supabase.from('export_batches').select('*').order('created_at', { ascending: false }),
  ]);
  if (approvedError) return fail('error', `可导出记录加载失败：${approvedError.message}`);
  if (historyError) return fail('error', `导出历史加载失败：${historyError.message}`);
  return ok({ approved: approved ?? [], history: history ?? [] });
}

export async function createExportBatch(formData: FormData): Promise<void> {
  const role = await requireRole('admin');
  if (!role.ok) return;
  const export_type = String(formData.get('export_type') ?? 'sft') as AuditKind;
  const supabase = await createClient();
  const { data: records, error } = await supabase.from('audit_records').select('*').eq('status', 'approved').eq('kind', export_type);
  if (error) return;
  if (!records?.length) return;
  const jsonl = records.map((record) => export_type === 'sft'
    ? JSON.stringify({ prompt: record.prompt, completion: record.corrected_answer || record.original_answer, source_record_id: record.id })
    : JSON.stringify({ prompt: record.prompt, chosen: record.chosen_answer, rejected: record.rejected_answer, source_record_id: record.id, rationale: record.rationale })
  ).join('\n');
  const { error: insertError } = await supabase.from('export_batches').insert({ export_type, record_count: records.length, jsonl, created_by: role.data.id });
  if (insertError) return;
  await supabase.from('audit_records').update({ status: 'exported', exported_at: new Date().toISOString() }).in('id', records.map((record) => record.id));
  revalidatePath('/admin/exports');
  return;
}
