import 'server-only';

import { createClient } from '@/lib/supabase/server';

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

export type ClassificationRule = {
  /**
   * 学生所在班各任课教师的归类规则（每师每班一条）。
   * 空数组表示未配置，用内置默认。
   */
  teacherRules: Array<{ teacherName: string; instruction: string }>;
  /** 学生所在班级 id；null 表示无班级（无归属规则可用）。 */
  classId: string | null;
  /** 本校可选归属路径，帮模型对齐本校目录口径。 */
  catalogPaths: string[];
};

/**
 * 解析"这个学生本轮该用哪套归类规则"。
 *
 * 产品语义（2026-09-16）：归类口径由**任课教师**决定，且每师每班各一条。
 * 一个班可以有语文/数学/英语等多位教师，各写各的学科口径；学生的问题由哪套规则管，
 * 交给模型按学科判断（规则文本自带学科说明），所以这里把本班所有生效规则一并带出。
 *
 * 链路：学生 → 其班级（学生只有一个班）→ 该班全部已发布的 project_classification 规则。
 * 任一环缺失都安全退化：没配规则就用内置默认，不阻塞学生提问。
 *
 * 学生身份执行，故依赖迁移里给 class_memberships / prompt_presets / project_catalogs
 * 配好的 RLS；查不到就是空，不做提权兜底。
 */
export async function resolveClassificationRule(
  supabase: SupabaseLike,
  studentId: string,
): Promise<ClassificationRule> {
  const fallback: ClassificationRule = { teacherRules: [], classId: null, catalogPaths: [] };

  const { data: membership, error: membershipError } = await supabase
    .from('class_memberships')
    .select('class_id')
    .eq('profile_id', studentId)
    .eq('role', 'student')
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership?.class_id) return fallback;

  const classId = membership.class_id;
  const [rulesResult, catalogResult] = await Promise.all([
    supabase
      .from('prompt_presets')
      .select('system_instruction,profiles(display_name)')
      .eq('class_id', classId)
      .eq('purpose', 'project_classification')
      .eq('status', 'published')
      .order('updated_at', { ascending: false }),
    supabase
      .from('project_catalogs')
      .select('id,name,parent_id')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
  ]);

  const teacherRules = ((rulesResult.data ?? []) as Array<{
    system_instruction: string | null;
    profiles: { display_name: string | null } | Array<{ display_name: string | null }> | null;
  }>).flatMap((row) => {
    const instruction = row.system_instruction?.trim();
    if (!instruction) return [];
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return [{ teacherName: profile?.display_name?.trim() || '任课教师', instruction }];
  });

  return {
    teacherRules,
    classId,
    catalogPaths: catalogResult.error ? [] : buildCatalogPaths(catalogResult.data ?? []),
  };
}

/** 把扁平的目录行拼成 "语文 / 高一 / 文言文" 形式的路径列表。 */
function buildCatalogPaths(rows: Array<{ id: string; name: string; parent_id: string | null }>): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathOf = (id: string) => {
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
  return rows.map((row) => pathOf(row.id)).filter(Boolean);
}
