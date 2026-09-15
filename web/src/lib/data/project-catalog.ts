'use server';

/**
 * project-catalog.ts
 *
 * 项目归属目录（SaaS 通用化，见迁移 20260916001845_project_catalog_taxonomy.sql）。
 *
 * 产品意图：AI 学习工作台不该只服务古诗文。管理员导入一份目录（学科 → 年级 → 类别 → 专题），
 * 之后学生的项目自动/手动挂到目录节点，教师核实页也能按目录分组。
 * 目录是校维数据：校 admin 维护本校目录，org_admin 可维护公司模板（下发各校）。
 *
 * 与 admin.ts 的分工：admin.ts 管账号/班级/AI 运维；目录是独立的领域概念，单独成文件。
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, requireAnyRole, type DataResult } from './common';

export type CatalogNode = {
  id: string;
  name: string;
  kind: 'subject' | 'grade' | 'category' | 'topic';
  parentId: string | null;
  schoolId: string | null;
  status: 'active' | 'archived';
  sortOrder: number;
  /** 从根到本节点的名字路径，如 "语文 / 高一 / 文言文"。 */
  path: string;
};

export type CatalogImportRow = {
  rowNumber: number;
  /** 斜杠分隔的路径，如 "语文/高一/文言文/《赤壁赋》"。 */
  path: string;
  status: 'valid' | 'invalid';
  errors: string[];
};

export type CatalogImportPreview = { rows: CatalogImportRow[]; validCount: number; invalidCount: number };

type CatalogKind = 'subject' | 'grade' | 'category' | 'topic';

/**
 * 目录导入的路径深度 → 层级语义映射。
 * 4 段以内直接按序映射；更深的一律作为 topic（具体项目可任意深）。
 */
function kindForDepth(depth: number): CatalogKind {
  const fixed: CatalogKind[] = ['subject', 'grade', 'category', 'topic'];
  return fixed[Math.min(depth, fixed.length - 1)];
}

function normalizePath(raw: string): string[] {
  return raw.split('/').map((segment) => segment.trim()).filter(Boolean);
}

/**
 * 解析 CSV 形式的目录清单。每行一个完整路径（首列），
 * 例：`语文/高一/文言文/《赤壁赋》`。同一路径的父级会被复用。
 */
export async function previewProjectCatalogCsv(csvText: string): Promise<CatalogImportPreview> {
  const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  // 跳过表头（第一行是 path 或目录路径时视为表头）。
  const body = lines[0] && /^(path|目录路径|路径)$/i.test(lines[0].split(',')[0]?.trim() ?? '') ? lines.slice(1) : lines;

  const rows = body.map((line, index) => {
    const rawPath = line.split(',')[0]?.trim() ?? '';
    const segments = normalizePath(rawPath);
    const errors: string[] = [];
    if (segments.length === 0) errors.push('路径为空');
    if (segments.length > 8) errors.push('路径层级过深（上限 8 层）');
    if (segments.some((segment) => segment.length > 60)) errors.push('某层名称过长（上限 60 字）');
    return {
      rowNumber: index + 1,
      path: segments.join(' / '),
      status: errors.length > 0 ? 'invalid' : 'valid',
      errors,
    } satisfies CatalogImportRow;
  });

  return { rows, validCount: rows.filter((row) => row.status === 'valid').length, invalidCount: rows.filter((row) => row.status === 'invalid').length };
}

/**
 * 读当前管理员可见的目录。
 * 校 admin：本校目录 + 公司模板（RLS 判定）；
 * org_admin：本公司全部（可传 schoolId 只看某校）。
 */
export async function listProjectCatalog(options: { schoolId?: string | null } = {}): Promise<DataResult<CatalogNode[]>> {
  // admin 与 org_admin 都可读目录：校 admin 管本校、org_admin 管公司模板与各校。
  const role = await requireAnyRole(['admin', 'org_admin']);
  if (!role.ok) return role;
  const supabase = await createClient();
  let query = supabase
    .from('project_catalogs')
    .select('id,name,kind,parent_id,school_id,status,sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  // org_admin 指定学校时只看该校；不传则看全部（含公司模板）。
  if (options.schoolId) query = query.eq('school_id', options.schoolId);
  const { data, error } = await query;
  if (error) return fail('error', `目录加载失败：${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string; name: string; kind: CatalogKind; parent_id: string | null;
    school_id: string | null; status: 'active' | 'archived'; sort_order: number;
  }>;
  const byId = new Map(rows.map((row) => [row.id, row]));

  // 路径在内存里拼：目录规模是几十到几百节点，递归查询不如一次读出来划算。
  const pathOf = (id: string): string => {
    const names: string[] = [];
    let cursor = byId.get(id);
    let guard = 0;
    while (cursor && guard < 16) {
      names.unshift(cursor.name);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
      guard += 1;
    }
    return names.join(' / ');
  };

  return ok(rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parent_id,
    schoolId: row.school_id,
    status: row.status,
    sortOrder: row.sort_order,
    path: pathOf(row.id),
  })));
}

/**
 * 导入目录：按路径逐层 upsert 父节点，幂等（同名同父复用）。
 * 校 admin 写入本校目录；org_admin 写入公司模板（school_id NULL），
 * 或传 targetSchoolId 给某所学校单独下发一份（公司级管理员为不同学校开不同系统）。
 */
export async function importProjectCatalog(
  csvText: string,
  options: { targetSchoolId?: string | null } = {},
): Promise<{ ok: true; created: number } | { ok: false; message: string; preview: CatalogImportPreview }> {
  // admin 与 org_admin 都可读目录：校 admin 管本校、org_admin 管公司模板与各校。
  const role = await requireAnyRole(['admin', 'org_admin']);
  const preview = await previewProjectCatalogCsv(csvText);
  if (!role.ok) return { ok: false, message: role.message, preview };
  if (preview.invalidCount > 0) return { ok: false, message: '目录清单存在无效行。', preview };
  if (!role.data.organization_id) return { ok: false, message: '当前账号未归属组织，无法导入目录。', preview };

  const supabase = await createClient();

  // 目标学校归属判定：
  //   - 校 admin：只能写本校（忽略 targetSchoolId，防止越校写）。
  //   - org_admin：显式传 targetSchoolId 则该学校；不传则为公司模板（school_id NULL）。
  let schoolId: string | null;
  if (role.data.role === 'org_admin') {
    schoolId = options.targetSchoolId ?? null;
    if (schoolId) {
      const { data: school, error } = await supabase.from('schools').select('id').eq('id', schoolId).maybeSingle();
      if (error) return { ok: false, message: `学校查询失败：${error.message}`, preview };
      if (!school) return { ok: false, message: '目标学校不存在或不属于当前公司。', preview };
    }
  } else {
    schoolId = role.data.school_id;
  }

  let created = 0;
  for (const row of preview.rows) {
    const segments = normalizePath(row.path);
    let parentId: string | null = null;
    for (let depth = 0; depth < segments.length; depth += 1) {
      const name = segments[depth];
      // 同级同名复用。parent_id 为 NULL 时用 is()，否则用 eq()——.is() 只接受 null。
      // 唯一索引是 (school, parent, lower(name))，所以 school 维度也要限定。
      let lookup = supabase
        .from('project_catalogs')
        .select('id')
        .eq('organization_id', role.data.organization_id)
        .eq('name', name);
      lookup = parentId === null ? lookup.is('parent_id', null) : lookup.eq('parent_id', parentId);
      lookup = schoolId === null ? lookup.is('school_id', null) : lookup.eq('school_id', schoolId);

      const { data: existing, error: selectError } = await lookup.limit(1).maybeSingle();
      if (selectError) return { ok: false, message: `第 ${row.rowNumber} 行目录查询失败：${selectError.message}`, preview };
      if (existing?.id) {
        parentId = existing.id;
        continue;
      }
      // 显式标注 inserted：结果又要赋回 parentId，而 parentId 又是查询条件之一，
      // 不标注会让 TS 陷入 parentId↔inserted 的循环推断（TS7022）。
      const { data: inserted, error: insertError }: {
        data: { id: string } | null;
        error: { message: string } | null;
      } = await supabase
        .from('project_catalogs')
        .insert({
          organization_id: role.data.organization_id,
          school_id: schoolId,
          parent_id: parentId,
          name,
          kind: kindForDepth(depth),
          created_by: role.data.id,
        })
        .select('id')
        .single();
      if (insertError || !inserted) return { ok: false, message: `第 ${row.rowNumber} 行目录写入失败：${insertError?.message ?? 'unknown'}`, preview };
      parentId = inserted.id;
      created += 1;
    }
  }

  revalidatePath('/admin/catalogs');
  revalidatePath('/admin');
  return { ok: true, created };
}
