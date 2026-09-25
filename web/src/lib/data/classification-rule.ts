import 'server-only';

import { createClient } from '@/lib/supabase/server';

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

/** 一条归类口径：老师写的语义部分 + 一个只用于区分的来源标签。 */
export type ClassificationCriterion = {
  /**
   * 来源标签（空间名 / 任课教师名）。它只是给模型在多条口径之间做区分用的，
   * 不参与格式——结构化返回协议由平台强制拼接，见 classification-prompts.ts。
   */
  label: string;
  /** 老师写的归类口径原文。这是**语义部分**，与平台的结构化返回约定严格分开。 */
  instruction: string;
};

export type ClassificationRule = {
  criteria: ClassificationCriterion[];
  /** 学生显式选中的空间；null 表示没选，交给模型在多条口径间自选。 */
  spaceId: string | null;
  /**
   * 口径来自哪里。归类出问题时第一个要看的就是它——
   * 此前「静默用错主题」这类故障在日志里没有痕迹，只能靠猜。
   */
  source: 'space-selected' | 'space' | 'none';
};

const EMPTY: ClassificationRule = { criteria: [], spaceId: null, source: 'none' };

/**
 * 解析「这个学生本轮该用哪套归类口径」。
 *
 * 产品语义（2026-09-16 起）：归类机制唯一，就是**空间主题**——老师建空间、写主题、拉班，
 * 学生切换自己被拉进去的空间。粒度从「每师每班一条」演进为「每空间一条」。
 *
 * 解析顺序（不猜）：
 *   1. 学生显式选中的空间（URL 里带 spaceId）→ 只用那一条
 *   2. 没有显式选择、且只属于一个空间 → 用它
 *   3. 没有显式选择、且属于多个空间 → 全部带出，由模型按问题自选
 *      （这是既有机制：此前是「本班多位任课教师各写各的，模型选用最贴合的一条」，
 *        换成空间后形状不变，只是来源换了）
 *   4. 一个空间都没有 → 空，调用方退内置默认口径
 *
 * 无空间可用时返回空，不再回落到旧班级规则：产品只允许一套归类机制，留着第二条路径会让
 * 「这轮口径到底来自哪里」重新变得不可判定（source 字段就是为这条排查线留的）。内置默认
 * 口径见 classification-prompts.ts 的 defaultProjectClassificationInstruction。
 *
 * 学生身份执行，故依赖 RLS；查不到就是空，不做提权兜底。
 */
export async function resolveClassificationRule(
  supabase: SupabaseLike,
  _studentId: string,
  explicitSpaceId?: string | null,
): Promise<ClassificationRule> {
  // 学生能看到哪些空间由 spaces_select 策略决定（is_my_space：我在该空间的某个班里，
  // 且空间所有者仍任教该班）。这里不做第二套过滤。
  const { data: spaces } = await supabase
    .from('spaces')
    .select('id,name,theme,subject')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  type SpaceRow = { id: string; name: string; theme: string; subject: string | null };

  const all = (spaces ?? []) as SpaceRow[];

  if (explicitSpaceId) {
    // 用**未按主题过滤**的列表判定命中：把「没写主题」和「不可见」压进同一个数组，
    // 会让「选了但没口径」掉进下面那一支，静默改用**别的空间**的口径——恰好是本函数
    // 注释里承诺不做的事。命中就认，空口径由提示词层的内置默认接住。
    const selected = all.find((space) => space.id === explicitSpaceId);
    if (selected) {
      const theme = selected.theme.trim();
      return {
        criteria: theme ? [{ label: selected.subject ? `${selected.subject}·${selected.name}` : selected.name, instruction: theme }] : [],
        spaceId: selected.id,
        source: 'space-selected',
      };
    }
    // 已不可见（被移出该班 / 老师不再任教 / 已归档）：不报错，落到下面按「没选」处理。
  }

  const withTheme = all.filter((space) => space.theme.trim());
  if (withTheme.length > 0) {
    return {
      criteria: withTheme.map((space) => ({ label: space.subject ? `${space.subject}·${space.name}` : space.name, instruction: space.theme.trim() })),
      spaceId: withTheme.length === 1 ? withTheme[0].id : null,
      source: 'space',
    };
  }

  return EMPTY;
}
