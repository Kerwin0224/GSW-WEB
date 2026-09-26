import 'server-only';

/**
 * portability-export.ts —— 学生与教师拿走「自己数据」的读面。
 *
 * 此前产品里唯一的导出是管理员的 SFT/DPO JSONL：学生拿不走自己的任何会话，
 * 教师拿不走自己核实过的记录，学校也拿不成绩表。可携带性为零，
 * 转学、换机构、家长索要记录时没有任何合规出口。
 *
 * 三条约束：
 * 1. 范围由 RLS 决定，不在应用层另写一套可见性——复用既有策略就不会漂移。
 * 2. 角色门是「owner 或 admin」双路：学生永远只能导自己的；管理员可以指定 owner。
 * 3. 每份导出都要在正文里说清它包含什么、不包含什么（导出头 + 界面文案），
 *    否则用户会以为导的是全量，实际上少了一半。
 */

import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { firstJoined } from '@/lib/data/audit-record';
import { toCsv } from '@/lib/portability-csv';
import type { Database } from '@/lib/supabase/database.types';

// 托管版 PostgREST 有行数上限：任何一次全量查询不翻页都会静默截断，
// 导出会变成「看起来导完了其实少一半」。与会话正文相关的查询一律翻页取尽。
const PAGE_SIZE = 500;

export type PortabilityFormat = 'json' | 'md' | 'csv';
export type StudentDataset = 'conversations' | 'challenges' | 'summary' | 'attachments';
export type TeacherDataset = 'finalized';

export type ExportDocument = {
  filename: string;
  contentType: string;
  body: string;
};

type NameJoin = { name: string | null };
type ConversationExportRow = {
  id: string;
  title: string | null;
  project_id: string | null;
  space_id: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  projects?: NameJoin | NameJoin[] | null;
};
type MessageExportRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  bloom_level: number | null;
  created_at: string;
};
type PracticeExportRow = {
  id: string;
  project_id: string;
  target_bloom_level: number;
  achieved: boolean | null;
  evaluation_state: string;
  prompt: string | null;
  answer: string | null;
  feedback: string | null;
  created_at: string;
  projects?: NameJoin | NameJoin[] | null;
};
type ProjectExportRow = { id: string; name: string; subtitle: string | null; highest_bloom_level: number | null; created_at: string; updated_at: string };
type DocumentExportRow = {
  id: string;
  title: string;
  project_id: string | null;
  conversation_id: string | null;
  content: string | null;
  source_uri: string | null;
  created_at: string;
  projects?: NameJoin | NameJoin[] | null;
};

/** 翻页取尽：每页 PAGE_SIZE 行，直到返回不足一页。builder 是可变对象，必须每次新建。 */
async function fetchAll<T>(
  supabase: SupabaseClient<Database>,
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}：${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function projectNameOf(row: ConversationExportRow): string {
  return firstJoined(row.projects)?.name ?? '';
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 学生导出会话：Markdown 给人看，JSON 给机器读。两者都是同一批会话、同一段正文。 */
export async function buildStudentConversationsExport(ownerId: string, format: PortabilityFormat): Promise<ExportDocument> {
  const supabase = await createClient();
  const conversations = await fetchAll<ConversationExportRow>(
    supabase,
    (from, to) => supabase
      .from('conversations')
      .select('id,title,project_id,space_id,created_at,updated_at,finalized_at,projects(name)')
      .eq('owner_id', ownerId)
      .eq('source', 'student_chat')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(from, to),
    '读取会话失败',
  );

  const messagesByConversation = new Map<string, MessageExportRow[]>();
  for (const conversation of conversations) {
    const messages = await fetchAll<MessageExportRow>(
      supabase,
      (from, to) => supabase
        .from('conversation_messages')
        .select('id,conversation_id,role,content,bloom_level,created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
        .range(from, to),
      '读取会话正文失败',
    );
    messagesByConversation.set(conversation.id, messages);
  }

  const payload = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    project: projectNameOf(conversation),
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
    teacherFinalizedAt: conversation.finalized_at,
    messages: (messagesByConversation.get(conversation.id) ?? []).map((message) => ({
      role: message.role,
      content: message.content,
      bloomLevel: message.bloom_level,
      createdAt: message.created_at,
    })),
  }));

  if (format === 'json') {
    return {
      filename: `我的会话-${stamp()}.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ 说明: '你名下全部未删除的学生会话正文；不含其他同学的数据，也不含教师核实备注。', 会话数: payload.length, 会话: payload }, null, 2),
    };
  }

  const markdown = payload.map((conversation) => {
    const header = [`# ${conversation.title || '未命名会话'}`, '', `- 项目：${conversation.project || '未归项目'}`,
      `- 会话 id：${conversation.id}`, `- 创建：${conversation.createdAt}`, `- 最近更新：${conversation.updatedAt}`,
      conversation.teacherFinalizedAt ? `- 教师完成核实：${conversation.teacherFinalizedAt}` : '- 教师完成核实：尚未完成', ''].join('\n');
    const body = conversation.messages
      .map((message) => `**${message.role === 'user' ? '我' : message.role === 'assistant' ? 'AI' : message.role}**（${message.createdAt}）\n\n${message.content}`)
      .join('\n\n---\n\n');
    return `${header}\n${body}`;
  }).join('\n\n---\n\n');

  return {
    filename: `我的会话-${stamp()}.md`,
    contentType: 'text/markdown; charset=utf-8',
    body: `# 我与会话 AI 的学习记录\n\n导出于 ${new Date().toISOString()}：共 ${payload.length} 条未删除会话。\n\n${markdown}\n`,
  };
}

/** 学生导出挑战记录：CSV，含目标层级、是否通过、评价状态与时间。 */
export async function buildStudentChallengesExport(ownerId: string): Promise<ExportDocument> {
  const supabase = await createClient();
  const practices = await fetchAll<PracticeExportRow>(
    supabase,
    (from, to) => supabase
      .from('practice_records')
      .select('id,project_id,target_bloom_level,achieved,evaluation_state,prompt,answer,feedback,created_at,projects(name)')
      .eq('student_id', ownerId)
      .order('created_at', { ascending: true })
      .range(from, to),
    '读取挑战记录失败',
  );

  return {
    filename: `我的挑战记录-${stamp()}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: toCsv(
      ['挑战 id', '项目', '目标层级', '是否通过', '评价状态', '题目', '我的作答', '反馈', '时间'],
      practices.map((practice) => [
        practice.id,
        firstJoined(practice.projects)?.name ?? '',
        `L${practice.target_bloom_level}`,
        practice.achieved === null ? '未评价' : practice.achieved ? '通过' : '未通过',
        practice.evaluation_state,
        practice.prompt ?? '',
        practice.answer ?? '',
        practice.feedback ?? '',
        practice.created_at,
      ]),
    ),
  };
}

/** 学习记录汇总：按项目给提问数、挑战数与已确认层级，机构与家长要的多半是这张表。 */
export async function buildStudentSummaryExport(ownerId: string, spaceId?: string | null): Promise<ExportDocument> {
  const supabase = await createClient();
  let projectsQuery = supabase.from('projects').select('id,name,subtitle,highest_bloom_level,created_at,updated_at').eq('owner_id', ownerId);
  if (spaceId !== undefined) {
    projectsQuery = spaceId === null ? projectsQuery.is('space_id', null) : projectsQuery.eq('space_id', spaceId);
  }
  const projects = await fetchAll<ProjectExportRow>(supabase, (from, to) => projectsQuery.range(from, to), '读取项目失败');

  const practices = await fetchAll<{ project_id: string; achieved: boolean | null }>(
    supabase,
    (from, to) => supabase.from('practice_records').select('id,project_id,target_bloom_level,achieved').eq('student_id', ownerId).range(from, to),
    '读取挑战记录失败',
  );
  const questionCounts = new Map<string, number>();
  const messages = await fetchAll<{ conversations: { project_id: string | null } | Array<{ project_id: string | null }> }>(
    supabase,
    (from, to) => supabase
      .from('conversation_messages')
      .select('id,conversations!inner(project_id)')
      .eq('conversations.owner_id', ownerId)
      .eq('role', 'user')
      // 已软删除的会话不在任何业务查询里，也不该出现在学生的个人数据导出里：
      // 学生点删除的语义是删除，导出时又把它们捞回来等于撤销了这次删除。
      .is('conversations.deleted_at', null)
      .not('conversations.project_id', 'is', null)
      .range(from, to),
    '读取提问记录失败',
  );
  for (const message of messages) {
    const projectId = firstJoined(message.conversations)?.project_id;
    if (!projectId) continue;
    questionCounts.set(projectId, (questionCounts.get(projectId) ?? 0) + 1);
  }

  const practiceCounts = new Map<string, { total: number; passed: number }>();
  for (const practice of practices) {
    const current = practiceCounts.get(practice.project_id) ?? { total: 0, passed: 0 };
    current.total += 1;
    if (practice.achieved) current.passed += 1;
    practiceCounts.set(practice.project_id, current);
  }

  const rows = projects.map((project) => {
    const counts = practiceCounts.get(project.id) ?? { total: 0, passed: 0 };
    return {
      项目: project.name,
      副标题: project.subtitle ?? '',
      提问条数: questionCounts.get(project.id) ?? 0,
      挑战次数: counts.total,
      通过次数: counts.passed,
      已确认层级: project.highest_bloom_level === null ? '尚未通过挑战' : `L${project.highest_bloom_level}`,
      最近更新: project.updated_at,
    };
  });

  return {
    filename: `我的学习记录汇总-${stamp()}.json`,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      说明: '按项目汇总的学习记录。提问条数只统计未删除会话里的提问。',
      导出时间: new Date().toISOString(),
      项目数: rows.length,
      合计: {
        提问条数: rows.reduce((sum, row) => sum + row.提问条数, 0),
        挑战次数: rows.reduce((sum, row) => sum + row.挑战次数, 0),
      },
      项目: rows,
    }, null, 2),
  };
}

/** 附件清单：文件名、归属项目与会话、上传时间与正文长度。内容本体不走导出（由附件原文件渠道提供）。 */
export async function buildStudentAttachmentsExport(ownerId: string): Promise<ExportDocument> {
  const supabase = await createClient();
  const documents = await fetchAll<DocumentExportRow>(
    supabase,
    (from, to) => supabase
      .from('documents')
      .select('id,title,project_id,conversation_id,content,source_uri,created_at,projects(name)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
      .range(from, to),
    '读取附件清单失败',
  );

  return {
    filename: `我的附件清单-${stamp()}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: toCsv(
      ['附件 id', '标题', '所属项目', '所属会话', '上传时间', '正文字数', '来源'],
      documents.map((document) => [
        document.id,
        document.title,
        firstJoined(document.projects)?.name ?? '',
        document.conversation_id ?? '',
        document.created_at,
        (document.content ?? '').length,
        document.source_uri ?? '',
      ]),
    ),
  };
}

/**
 * 教师导出自己范围内的核实记录。会话、学生、项目、结论、修订前后、时间、维度键。
 * 范围由 audit_records 的 RLS 决定（任教班级 ∪ 自己拥有的空间），应用层不再另判。
 */
export async function buildTeacherFinalizedExport(options: { classId?: string; spaceId?: string }): Promise<ExportDocument> {
  const supabase = await createClient();
  let recordsQuery = supabase
    .from('audit_records')
    .select('id,kind,status,quality,dimension_key,prompt,original_answer,corrected_answer,chosen_answer,rejected_answer,teacher_comment,created_at,updated_at,exported_at,class_id,space_id,source_conversation_id,conversations!inner(id,title,owner_id,deleted_at,profiles!conversations_owner_id_fkey(display_name),projects(name),classes(name))')
    // 过滤放在 SQL 而不只是结果里：已删除的会话不该被传出来再丢掉，
    // 守卫测试也只认 SQL 层的这一条。
    .is('conversations.deleted_at', null)
    .not('source_message_id', 'is', null)
    .order('created_at', { ascending: true });
  if (options.classId) recordsQuery = recordsQuery.eq('class_id', options.classId);
  if (options.spaceId) recordsQuery = recordsQuery.eq('space_id', options.spaceId);

  const records = await fetchAll<AuditRecordWithConversation>(supabase, (from, to) => recordsQuery.range(from, to), '读取核实记录失败');

  // 学生删掉的会话不再出现在导出里：产品语义是删除，导出不能把它绕回来。
  const rows = records.filter((record) => {
    const conversation = firstJoined(record.conversations);
    return Boolean(conversation) && conversation?.deleted_at === null;
  });

  return {
    filename: `核实记录-${stamp()}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: toCsv(
      ['记录 id', '班级', '学生', '项目', '会话', '结论', '样本类型', '维度键', '学生提问', '修订前回答', '修订后回答', '教师备注', '核实时间', '是否已进导出批次'],
      rows.map((record) => {
        const conversation = firstJoined(record.conversations);
        const revised = record.corrected_answer ?? record.chosen_answer ?? '';
        const conclusion = revised ? '教师已修订' : record.corrected_answer === null && record.chosen_answer === null ? '确认无误' : '已确认';
        return [
          record.id,
          firstJoined(conversation?.classes)?.name ?? '无行政班',
          firstJoined(conversation?.profiles)?.display_name ?? '',
          firstJoined(conversation?.projects)?.name ?? '',
          conversation?.title ?? '',
          conclusion,
          record.kind,
          record.dimension_key ?? '',
          record.prompt,
          record.rejected_answer ?? record.original_answer ?? '',
          revised,
          record.teacher_comment ?? '',
          record.updated_at ?? record.created_at,
          record.exported_at ? '是' : '否',
        ];
      }),
    ),
  };
}

type DisplayNameJoin = { display_name: string | null };
type AuditConversationJoin = {
  id: string;
  title: string | null;
  owner_id: string;
  deleted_at: string | null;
  profiles?: DisplayNameJoin | DisplayNameJoin[] | null;
  projects?: NameJoin | NameJoin[] | null;
  classes?: NameJoin | NameJoin[] | null;
};
type AuditRecordWithConversation = {
  id: string;
  kind: string;
  status: string;
  quality: string | null;
  dimension_key: string | null;
  prompt: string;
  original_answer: string | null;
  corrected_answer: string | null;
  chosen_answer: string | null;
  rejected_answer: string | null;
  teacher_comment: string | null;
  created_at: string;
  updated_at: string;
  exported_at: string | null;
  class_id: string | null;
  space_id: string | null;
  source_conversation_id: string;
  conversations: AuditConversationJoin | AuditConversationJoin[] | null;
};
