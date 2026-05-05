import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type LevelNode = {
  level: BloomLevel;
  label: string;
  count: number;
  questions: Array<{
    id: string;
    content: string;
    createdAt: string;
  }>;
};

export type CognitivePath = {
  projectId: string;
  projectTitle: string;
  levels: LevelNode[];
  maxLevel: BloomLevel | null;
  unlockedCount: number;
  totalQuestions: number;
};

export type CognitiveProfile = {
  userId: string;
  dimensions: [number, number, number, number, number, number]; // L1-L6 counts
  strengths: BloomLevel[];
  weaknesses: BloomLevel[];
  suggestion: string;
};

const BLOOM_LABELS: Record<BloomLevel, string> = {
  1: '记忆',
  2: '理解',
  3: '应用',
  4: '分析',
  5: '评价',
  6: '创造',
};

/**
 * 获取指定项目的认知路径
 * @param projectId 项目 ID
 * @param userId 用户 ID
 * @returns 认知路径数据
 */
export async function getCognitivePath(
  projectId: string,
  userId: string
): Promise<CognitivePath | null> {
  const supabase = await createClient();

  // 获取项目信息
  const { data: project, error: projectError } = await supabase
    .from('text_projects')
    .select('id, title')
    .eq('id', projectId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (projectError || !project) {
    return null;
  }

  // 获取该项目下所有用户消息及其布鲁姆层级
  const { data: messages, error: messagesError } = await supabase
    .from('conversation_messages')
    .select('id, content, bloom_level, created_at, conversations!inner(project_id)')
    .eq('conversations.project_id', projectId)
    .eq('role', 'user')
    .order('created_at', { ascending: false });

  if (messagesError) {
    throw new Error(`Failed to fetch messages: ${messagesError.message}`);
  }

  // 按层级聚合消息
  const levelMap = new Map<BloomLevel, Array<{ id: string; content: string; createdAt: string }>>();

  for (const msg of messages || []) {
    if (msg.bloom_level && msg.bloom_level >= 1 && msg.bloom_level <= 6) {
      const level = msg.bloom_level as BloomLevel;
      if (!levelMap.has(level)) {
        levelMap.set(level, []);
      }
      levelMap.get(level)!.push({
        id: msg.id,
        content: msg.content,
        createdAt: msg.created_at,
      });
    }
  }

  // 构建 L1-L6 的层级节点
  const levels: LevelNode[] = ([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => ({
    level,
    label: BLOOM_LABELS[level],
    count: levelMap.get(level)?.length || 0,
    questions: levelMap.get(level) || [],
  }));

  // 计算最高层级
  const maxLevel = levels
    .filter((l) => l.count > 0)
    .map((l) => l.level)
    .sort((a, b) => b - a)[0] || null;

  // 计算已解锁层级数量
  const unlockedCount = levels.filter((l) => l.count > 0).length;

  // 计算总问题数
  const totalQuestions = levels.reduce((sum, l) => sum + l.count, 0);

  return {
    projectId: project.id,
    projectTitle: project.title,
    levels,
    maxLevel,
    unlockedCount,
    totalQuestions,
  };
}

/**
 * 获取用户的全局认知画像（雷达图数据）
 * @param userId 用户 ID
 * @returns 认知画像数据
 */
export async function getCognitiveProfile(userId: string): Promise<CognitiveProfile> {
  const supabase = await createClient();

  // 获取用户所有项目下的消息
  const { data: messages, error } = await supabase
    .from('conversation_messages')
    .select('bloom_level, conversations!inner(owner_id)')
    .eq('conversations.owner_id', userId)
    .eq('role', 'user')
    .not('bloom_level', 'is', null);

  if (error) {
    throw new Error(`Failed to fetch user messages: ${error.message}`);
  }

  // 统计每个层级的问题数量
  const dimensions: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];

  for (const msg of messages || []) {
    if (msg.bloom_level && msg.bloom_level >= 1 && msg.bloom_level <= 6) {
      dimensions[msg.bloom_level - 1]++;
    }
  }

  // 识别优势层级（问题数量 > 平均值）
  const avg = dimensions.reduce((sum, count) => sum + count, 0) / 6;
  const strengths: BloomLevel[] = [];
  const weaknesses: BloomLevel[] = [];

  dimensions.forEach((count, index) => {
    const level = (index + 1) as BloomLevel;
    if (count > avg) {
      strengths.push(level);
    } else if (count < avg / 2) {
      weaknesses.push(level);
    }
  });

  // 生成建议
  let suggestion = '';
  if (weaknesses.length > 0) {
    const weakLabels = weaknesses.map((l) => BLOOM_LABELS[l]).join('、');
    suggestion = `你在 ${weakLabels} 层级还有提升空间，可以尝试更多相关问题。`;
  } else if (strengths.length > 0) {
    const strongLabels = strengths.map((l) => BLOOM_LABELS[l]).join('、');
    suggestion = `你在 ${strongLabels} 层级表现出色，继续保持！`;
  } else {
    suggestion = '继续探索，沿着布鲁姆认知阶梯向上攀登！';
  }

  return {
    userId,
    dimensions,
    strengths,
    weaknesses,
    suggestion,
  };
}
