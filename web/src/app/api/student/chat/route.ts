import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, safeValidateUIMessages, streamText, stepCountIs, type LanguageModel, type TextUIPart, type UIMessage } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withApiLogging } from '@/lib/observability/with-api-logging';
import { writeLogEvent } from '@/lib/observability/server-log-store';
import { extractTextFromParts, getCapabilities, jsonForDatabase, requireRole, resolveLanguageModel } from '@/lib/data/common';
import { toPersistedAssistantParts } from '@/lib/chat-message-parts';
import { isStudentConversationLocked } from '@/lib/data/conversation-finalization';
import { resolveClassificationRule } from '@/lib/data/classification-rule';
import { buildAttachmentPrompt } from '@/lib/chat-attachments';
import { refreshArtifactPart, type ArtifactFilePart } from '@/lib/artifacts';
import { getRoleMcpTools } from '@/lib/mcp-runtime';
import { shouldClassifyProjectForStudentTurn } from '@/lib/student-chat-contract';
import { buildStudentSystemPrompt } from '@/lib/student-chat-prompts';
import { normalizeConcreteProjectTitle } from '@/lib/project-title';
import {
  classifyBloomLevel,
  classifyProjectFromQuestion,
} from '@/lib/student-chat-classifiers';

export const maxDuration = 60;

async function ensureProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  name: string,
  subtitle: string | null,
  spaceId: string,
) {
  const { data: existingProject, error: existingError } = await supabase
    .from('projects')
    .select('id,name')
    .eq('owner_id', ownerId)
    .eq('space_id', spaceId)
    .eq('name', name)
    .maybeSingle();

  if (existingError) {
    throw new Error(`项目查重失败：${existingError.message}`);
  }

  if (existingProject) return existingProject;

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ owner_id: ownerId, space_id: spaceId, name, subtitle, classification_state: 'classified' })
    .select('id,name')
    .single();

  if (error || !project) {
    throw new Error(`项目归档失败：${error?.message ?? 'unknown'}`);
  }

  return project;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeUuid(value?: string | null) {
  const id = value?.trim();
  return id && uuidPattern.test(id) ? id : undefined;
}

const optionalUuidField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().uuid().optional(),
);
const optionalProjectIdField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);
const optionalProjectTitleField = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const bodySchema = z.object({
  messages: z.unknown(),
  // 学生当前选中的空间。新会话会持久化这个字段，已有会话优先使用自身绑定的空间。
  spaceId: optionalUuidField,
  conversationId: optionalUuidField,
  projectId: optionalProjectIdField,
  projectTitle: optionalProjectTitleField,
  trigger: z.enum(['submit-message', 'regenerate-message']).optional(),
  messageId: z.string().trim().min(1).optional(),
});
type AssignmentKind = 'project' | 'archive';
type ProjectAssignment = { kind: AssignmentKind; projectId: string | null; name: string | null };
type StudentChatData = {
  'student-assignment':
    | { kind: 'project'; projectId: string; name: string }
    | { kind: 'archive'; projectId: null; name: null };
  'student-bloom':
    | { messageId: string; state: 'pending' }
    | { messageId: string; state: 'classified'; level: 1 | 2 | 3 | 4 | 5 | 6 }
    | { messageId: string; state: 'failed'; reason?: string };
};
type StudentChatMessage = UIMessage<unknown, StudentChatData>;

type ConversationContext = {
  id: string;
  project_id: string | null;
  space_id: string | null;
  projects?: { name: string } | { name: string }[] | null;
};
type StoredConversationMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts: unknown;
  created_at: string;
};

function getConversationProjectTitle(conversation: ConversationContext | null) {
  const project = conversation ? (Array.isArray(conversation.projects) ? conversation.projects[0] : conversation.projects) : null;
  return normalizeConcreteProjectTitle(project?.name);
}

/**
 * 落库的 parts → 送模型的 UI 消息。
 * 附件轮次在这里必须保住 file part：学生交的是一张证明照片，
 * 只留 text 会让模型看到"一句提问、零张图"，比不给附件更糟。
 */
function toStudentChatMessage(row: StoredConversationMessage): StudentChatMessage {
  const kept = (Array.isArray(row.parts) ? row.parts : [])
    .map((part) => {
      if (!part || typeof part !== 'object') return null;
      const value = part as Record<string, unknown>;
      if (value.type === 'text' && typeof value.text === 'string') return { type: 'text' as const, text: value.text };
      if (value.type === 'file' && typeof value.mediaType === 'string' && typeof value.url === 'string') {
        return { type: 'file' as const, mediaType: value.mediaType, url: value.url, ...(typeof value.filename === 'string' ? { filename: value.filename } : {}) };
      }
      return null;
    })
    .filter((part): part is TextUIPart | ArtifactFilePart => part !== null);
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : row.role === 'system' ? 'system' : 'user',
    parts: kept.length ? kept : [{ type: 'text', text: row.content }],
  };
}

/**
 * part 来自浏览器：只认自家存储的签名 URL，且归属必须是本人，否则整条丢掉。
 * 丢完只剩空 parts 时给一句占位文字——空 content 的 user 消息会被部分网关拒收，
 * 学生看到的是"回答失败"，比提示附件失效更难排查。
 */
async function refreshArtifactParts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messages: StudentChatMessage[],
  profileId: string,
) {
  return Promise.all(messages.map(async (message) => {
    if (!message.parts.some((part) => part.type === 'file')) return message;
    const parts = await Promise.all(message.parts.map((part) => (part.type === 'file' ? refreshArtifactPart(supabase, part, profileId) : part)));
    const usable = parts.filter((part): part is TextUIPart | ArtifactFilePart => part !== null);
    return { ...message, parts: usable.length ? usable : [{ type: 'text' as const, text: '（附件已失效）' }] };
  }));
}

function trimTranscriptAtUserMessage(messages: StudentChatMessage[], userMessageId: string) {
  const userIndex = messages.findIndex((message) => message.id === userMessageId);
  return userIndex === -1 ? messages : messages.slice(0, userIndex + 1);
}

async function resolveProjectAssignment({
  supabase,
  ownerId,
  userText,
  projectModel,
  requestId,
  spaceId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  ownerId: string;
  userText: string;
  projectModel: LanguageModel | null;
  requestId: string;
  spaceId?: string | null;
}): Promise<ProjectAssignment> {
  const { data: ownedNames } = await supabase
    .from('projects')
    .select('name')
    .eq('owner_id', ownerId)
    .eq('space_id', spaceId ?? null);
  const knownNames = (ownedNames ?? []).map((row) => row.name).filter((title): title is string => Boolean(title));
  // 归类口径来自学生所属空间的**空间主题**；没有可用空间时用内置默认口径。
  // 只在首问归类时解析一次，不进提问热路径。
  const rule = await resolveClassificationRule(supabase, ownerId, spaceId);
  const classified = projectModel
    ? await classifyProjectFromQuestion(projectModel, userText, knownNames, { criteria: rule.criteria })
    : { name: null, subtitle: null, failure: 'model-unavailable' as const };
  const name = classified.name ?? null;

  if (!spaceId) {
    await writeLogEvent({
      level: 'warn',
      area: 'api',
      event: 'project_classification_fallback',
      requestId,
      route: '/api/student/chat',
      context: { reason: 'no-space-scope' },
    });
    return { kind: 'archive', projectId: null, name: null };
  }

  if (!name) {
    await writeLogEvent({
      level: 'warn',
      area: 'api',
      event: 'project_classification_fallback',
      requestId,
      route: '/api/student/chat',
      context: {
        reason: classified.failure ?? 'unclassified',
        // 口径来源与条数：归类出问题时第一个要看的两个数。
        // 「静默用错主题」这类故障此前在日志里没有痕迹。
        ruleSource: rule.source,
        criterionCount: rule.criteria.length,
        ...('detail' in classified && classified.detail ? { detail: classified.detail } : {}),
      },
    });
    return { kind: 'archive', projectId: null, name: null };
  }

  const project = await ensureProject(supabase, ownerId, name, classified.subtitle ?? null, spaceId);
  return { kind: 'project', projectId: project.id, name: project.name };
}

function assignmentHeaders(response: Response, assignment: ProjectAssignment | null) {
  if (!assignment) return;
  response.headers.set('x-assignment-kind', assignment.kind);
  if (assignment.kind === 'project' && assignment.projectId && assignment.name) {
    response.headers.set('x-project-id', assignment.projectId);
    response.headers.set('x-project-name', encodeURIComponent(assignment.name));
  }
}

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'student_chat', route: '/api/student/chat' }, async (requestId) => {
    const role = await requireRole('student');
    if (!role.ok) return Response.json({ error: role.message }, { status: role.reason === 'forbidden' ? 403 : 401 });
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });
    const validated = await safeValidateUIMessages<StudentChatMessage>({ messages: parsed.data.messages });
    if (!validated.success) return Response.json({ error: 'Invalid request', issues: [{ message: validated.error.message }] }, { status: 400 });
    const messages = validated.data;

    const caps = await getCapabilities(['student_chat', 'project_classification', 'bloom_classification']);
    if (!caps.student_chat.ready) return Response.json({ error: 'AI provider not configured', resolution: caps.student_chat.blockedReason }, { status: 503 });
    const languageModel = resolveLanguageModel(caps.student_chat);
    if (!languageModel) return Response.json({ error: 'Server model secret missing', resolution: `${caps.student_chat.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功；不能从浏览器读取 Provider 密钥。` }, { status: 503 });

    const supabase = await createClient();
    // 有效消息 = 有文字**或**有附件。学生拍一张证明照片问"这步对吗"是完整的一轮，
    // 此前只认 text part，这一轮会被判成"消息不能为空"。
    const lastParts = messages.at(-1)?.parts ?? [];
    const lastFilePart = lastParts.find((part) => Boolean(part) && typeof part === 'object' && 'type' in part && part.type === 'file');
    const lastFileName = lastFilePart && 'filename' in lastFilePart && typeof lastFilePart.filename === 'string' ? lastFilePart.filename : '';
    const userText = extractTextFromParts(messages);
    if (!userText && !lastFilePart) return Response.json({ error: '消息不能为空' }, { status: 400 });
    const turnLabel = (userText || lastFileName || '学习记录').slice(0, 80);

    const requestedProjectId = parsed.data.projectId;
    let projectId = normalizeUuid(requestedProjectId);
    if (!parsed.data.conversationId && requestedProjectId && !projectId) return Response.json({ error: '项目 ID 无效' }, { status: 400 });
    let classifiedProjectName = normalizeConcreteProjectTitle(parsed.data.projectTitle);
    const isRegeneration = parsed.data.trigger === 'regenerate-message';
    let conversation: ConversationContext | null = null;
    let immediateAssignment: ProjectAssignment | null = null;
    let effectiveSpaceId: string | null = parsed.data.spaceId ?? null;

    if (parsed.data.conversationId) {
      const { data: existingConversation, error: existingConversationError } = await supabase
        .from('conversations')
        .select('id,project_id,space_id,projects(name)')
        .eq('id', parsed.data.conversationId)
        .eq('owner_id', role.data.id)
        .eq('source', 'student_chat')
        .is('deleted_at', null)
        .maybeSingle();
      if (existingConversationError) return Response.json({ error: `会话加载失败：${existingConversationError.message}` }, { status: 500 });
      if (!existingConversation) return Response.json({ error: '会话不存在或已删除' }, { status: 404 });
      conversation = existingConversation as ConversationContext;
      // 封口判定读 conversations.locked_at，而不是「教师是否已核实」。
      // 已核实但未封口的会话必须能继续追问——异步答疑、复核后追问、错题再讨论都走这条路。
      // blockedReason 的 wire 值保持不变：客户端按它显示拦截态，改值要连带改客户端判断。
      try {
        if (await isStudentConversationLocked(supabase, conversation.id)) {
          return Response.json({
            error: '该会话已被教师封口，不能继续追问。',
            resolution: '请从项目或空白入口新开一个会话继续学习。',
            blockedReason: 'teacher_conversation_finalized',
          }, { status: 409 });
        }
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : '会话状态检查失败' }, { status: 500 });
      }
      projectId = conversation.project_id ?? undefined;
      effectiveSpaceId = conversation.space_id ?? null;
      classifiedProjectName = getConversationProjectTitle(conversation) ?? null;
    }

    // 归类与提问类型判断都读文字。一轮只有一张照片时没有可归类的语句，
    // 硬让模型对着空串归类只会得到一个编出来的项目名。
    const shouldClassifyProject = Boolean(userText) && shouldClassifyProjectForStudentTurn({
      hasConversation: Boolean(conversation),
      hasProject: Boolean(projectId),
      isRegeneration,
    });
    const projectModel = shouldClassifyProject && caps.project_classification.ready
      ? resolveLanguageModel(caps.project_classification)
      : null;
    let projectAssignmentPromise: Promise<ProjectAssignment> | null = null;

    const hadConversation = Boolean(conversation);

    if (!hadConversation && projectId) {
      const { data: ownedProject, error: ownedProjectError } = await supabase
        .from('projects')
        .select('id,name,space_id')
        .eq('id', projectId)
        .eq('owner_id', role.data.id)
        .maybeSingle();
      if (ownedProjectError) return Response.json({ error: `项目校验失败：${ownedProjectError.message}` }, { status: 500 });
      if (!ownedProject) return Response.json({ error: '项目不存在或不可访问' }, { status: 404 });
      if (ownedProject.space_id && effectiveSpaceId && ownedProject.space_id !== effectiveSpaceId) {
        return Response.json({ error: '项目不属于当前空间' }, { status: 409 });
      }
      projectId = ownedProject.id;
      effectiveSpaceId = ownedProject.space_id ?? effectiveSpaceId;
      classifiedProjectName = classifiedProjectName ?? normalizeConcreteProjectTitle(ownedProject.name);
    }

    if (!conversation) {
      const { data: newConversation, error: conversationError } = await supabase
        .from('conversations')
        .insert({ owner_id: role.data.id, project_id: projectId ?? null, space_id: effectiveSpaceId, source: 'student_chat', title: turnLabel })
        // 见 attachments route：与 deleted-at 守护测试形式一致，不影响 insert 本身。
        .is('deleted_at', null)
        .select('id,project_id,space_id,projects(name)')
        .single();
      if (conversationError) return Response.json({ error: `会话创建失败：${conversationError.message}` }, { status: 500 });
      conversation = newConversation as ConversationContext;
      if (projectId) {
        immediateAssignment = { kind: 'project', projectId, name: classifiedProjectName ?? getConversationProjectTitle(conversation) };
      }
    }

    if (shouldClassifyProject) {
      projectAssignmentPromise = resolveProjectAssignment({ supabase, ownerId: role.data.id, userText, projectModel, requestId, spaceId: effectiveSpaceId })
        .catch(async (error) => {
          await writeLogEvent({
            level: 'error',
            area: 'api',
            event: 'project_classification_fallback',
            requestId,
            route: '/api/student/chat',
            message: error instanceof Error ? error.message : 'project assignment failed',
          });
          return { kind: 'archive', projectId: null, name: null };
        });
    }

    projectId = conversation.project_id ?? projectId;
    classifiedProjectName = classifiedProjectName ?? getConversationProjectTitle(conversation);
    const bloomModel = caps.bloom_classification.ready
      ? resolveLanguageModel(caps.bloom_classification)
      : null;

    let userMessage = null as null | { id: string; content?: string | null };
    if (isRegeneration) {
      const { data: existingUserMessage, error: existingUserMessageError } = await supabase
        .from('conversation_messages')
        .select('id,content')
        .eq('conversation_id', conversation.id)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .maybeSingle();
      if (existingUserMessageError) return Response.json({ error: `学生问题重试失败：${existingUserMessageError.message}` }, { status: 500 });
      if (existingUserMessage?.content === userText) userMessage = existingUserMessage;
    }

    if (!userMessage) {
      const { data: insertedUserMessage, error: insertedUserMessageError } = await supabase
        .from('conversation_messages')
        .insert({ conversation_id: conversation.id, role: 'user', content: userText || turnLabel, parts: jsonForDatabase(lastParts), bloom_state: projectId && bloomModel && userText ? 'pending' : 'unclassified' })
        .select('id,content')
        .single();
      if (insertedUserMessageError) return Response.json({ error: `学生问题保存失败：${insertedUserMessageError.message}` }, { status: 500 });
      userMessage = insertedUserMessage;
    }
    if (!userMessage) return Response.json({ error: '学生问题保存失败：没有可用的学生消息。' }, { status: 500 });
    const { data: persistedMessageRows, error: persistedMessagesError } = await supabase
      .from('conversation_messages')
      .select('id,role,content,parts,created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });
    if (persistedMessagesError) return Response.json({ error: `会话上下文加载失败：${persistedMessagesError.message}` }, { status: 500 });
    const modelInputMessages = trimTranscriptAtUserMessage(
      await refreshArtifactParts(supabase, ((persistedMessageRows ?? []) as StoredConversationMessage[]).map(toStudentChatMessage), role.data.id),
      userMessage.id,
    );
    // 检索 query 必须是真文字：只有照片的一轮没有可比对的文本，
    // 而非文本附件本来就不进 documents/RAG，没有可检索的东西。
    let attachmentPrompt = '';
    if (userText) {
      const attachment = await buildAttachmentPrompt({
        supabase,
        conversationId: conversation.id,
        ownerId: role.data.id,
        query: userText,
        projectAttachments: true,
      });
      if (!attachment.ok) return Response.json({ error: attachment.message }, { status: attachment.status });
      attachmentPrompt = attachment.prompt;
    }
    const modelId = caps.student_chat.modelId;
    if (!modelId) return Response.json({ error: 'Model id missing', resolution: 'Provider capability 缺少 model_id；不能选择默认模型。' }, { status: 503 });
    let mcp: Awaited<ReturnType<typeof getRoleMcpTools>>;
    try {
      mcp = await getRoleMcpTools(supabase, 'student');
    } catch (error) {
      return Response.json({ error: 'MCP Server unavailable', resolution: error instanceof Error ? error.message : 'MCP Server 初始化失败。' }, { status: 503 });
    }
    let mcpClosed = false;
    const closeMcpOnce = async () => {
      if (mcpClosed) return;
      mcpClosed = true;
      await mcp.close();
    };
    // bloom_state 落库的统一出口：RLS/网络失败必须记日志，不能静默吞掉，
    // 否则前端永远停在"正在判断提问类型"（messages_owner_update 策略曾缺失导致的事故形态）。
    const setBloomState = async (state: 'pending' | 'classified' | 'failed' | 'unclassified', extra?: { bloom_level?: number }) => {
      if (!userMessage) return;
      const { error } = await supabase
        .from('conversation_messages')
        .update({ bloom_state: state, bloom_level: extra?.bloom_level ?? null })
        .eq('id', userMessage.id)
        .eq('bloom_state', 'pending');
      if (error) {
        await writeLogEvent({
          level: 'warn',
          area: 'api',
          event: 'bloom_state_update_failed',
          requestId,
          route: '/api/student/chat',
          context: { messageId: userMessage.id, target: state, detail: error.message },
        });
      }
    };
    const systemPrompt = buildStudentSystemPrompt(
      classifiedProjectName
        ? { kind: 'project', projectTitle: classifiedProjectName, attachmentPrompt }
        : projectAssignmentPromise
          ? { kind: 'classifying', attachmentPrompt }
          : { kind: 'archive', attachmentPrompt },
    );


    const stream = createUIMessageStream<StudentChatMessage>({
      originalMessages: messages,
      execute: async ({ writer }) => {
        let assignedProjectId = projectId ?? null;
        const assignmentTask = (async () => {
          if (!projectAssignmentPromise || !conversation) return null;
          const assignment = await projectAssignmentPromise;
          if (assignment.kind === 'project' && assignment.projectId) {
            const { error: projectLinkError } = await supabase
              .from('conversations')
              .update({ project_id: assignment.projectId })
              .eq('id', conversation.id)
              .eq('owner_id', role.data.id)
              .is('project_id', null)
              // 防御：学生在归属识别期间删掉会话时，race 下不应该再把 project_id
              // 补写到已软删的行里；与会话入口处的 deleted_at 过滤保持一致。
              .is('deleted_at', null);
            if (projectLinkError) throw new Error(`会话归入项目失败：${projectLinkError.message}`);
            assignedProjectId = assignment.projectId;
            projectId = assignment.projectId;
            classifiedProjectName = assignment.name;
            if (userMessage && bloomModel) {
              await supabase.from('conversation_messages').update({ bloom_state: 'pending' }).eq('id', userMessage.id);
              writer.write({
                type: 'data-student-bloom',
                id: userMessage.id,
                data: { messageId: userMessage.id, state: 'pending' },
                transient: true,
              });
            }
            writer.write({
              type: 'data-student-assignment',
              id: conversation.id,
              data: { kind: 'project', projectId: assignment.projectId, name: assignment.name ?? '对应项目' },
              transient: true,
            });
            return assignment;
          }

          writer.write({
            type: 'data-student-assignment',
            id: conversation.id,
            data: { kind: 'archive', projectId: null, name: null },
            transient: true,
          });
          return assignment;
        })();

        const result = streamText({
          model: languageModel,
          system: systemPrompt,
          messages: await convertToModelMessages(modelInputMessages),
          tools: mcp.tools,
          stopWhen: stepCountIs(5),
          abortSignal: req.signal,
          // 落库不在这里：组装好的 UI 消息（含工具调用 part）只在 toUIMessageStream.onFinish 拿得到。
          onFinish: async () => {
            await assignmentTask;
            if (assignedProjectId && userMessage && bloomModel && userText) {
              try {
                const bloom = await classifyBloomLevel(bloomModel, userText);
                await setBloomState('classified', { bloom_level: bloom.level });
                writer.write({
                  type: 'data-student-bloom',
                  id: userMessage.id,
                  data: { messageId: userMessage.id, state: 'classified', level: bloom.level },
                  transient: true,
                });
              } catch (error) {
                const reason = error instanceof Error ? error.message : '布鲁姆路径判断失败';
                await setBloomState('failed');
                writer.write({
                  type: 'data-student-bloom',
                  id: userMessage.id,
                  data: { messageId: userMessage.id, state: 'failed', reason },
                  transient: true,
                });
              }
            }
            await closeMcpOnce();
          },
          onError: async (error) => {
            // 流式中断/出错时 onFinish 不会跑，pending 不回收就会永久卡在"正在判断提问类型"。
            // 关键：mid-stream 失败时 withApiLogging 已经把请求记成 200 _completed（响应头先返回了），
            // 不在这里补一条 error 事件，模型调用故障就在 app_log_events 里彻底消失——这正是
            // "接口报错查不到原因"的根因。这里显式落库，带上 provider/model 便于定位。
            await writeLogEvent({
              level: 'error',
              area: 'api',
              event: 'student_chat_stream_failed',
              requestId,
              route: '/api/student/chat',
              message: error instanceof Error ? error.message : '学生会话流式响应失败',
              context: { conversationId: conversation.id, modelId, provider: caps.student_chat.providerName },
            });
            await setBloomState('unclassified');
            await closeMcpOnce();
          },
          onAbort: async () => {
            await setBloomState('unclassified');
            await closeMcpOnce();
          },
        });

        writer.merge(result.toUIMessageStream<StudentChatMessage>({
          originalMessages: messages,
          // 落库放在这里而不是 streamText.onFinish：只有组装好的 responseMessage 才带工具调用 part。
          // 放 onFinish 的话工具调用只存在于流里，学生一刷新、「调用过联网搜索」这条依据就没了，
          // 而这恰恰是教师核实时要看的。
          onFinish: async ({ responseMessage, isAborted }) => {
            // 中断的流不落库：保留原行为——半截回答不该变成一条可核实的「AI 回答」。
            if (isAborted) return;
            const persistedParts = toPersistedAssistantParts(responseMessage.parts);
            const text = persistedParts
              .filter((part): part is { type: 'text'; text: string } => Boolean(part) && (part as { type?: string }).type === 'text')
              .map((part) => part.text)
              .join('');
            await supabase.from('conversation_messages').insert({
              conversation_id: conversation.id,
              role: 'assistant',
              content: text,
              parts: jsonForDatabase(persistedParts),
              model_id: modelId,
              bloom_state: 'unclassified',
            });
          },
        }));

        if (!projectAssignmentPromise) {
          return;
        }

        await assignmentTask;
        await result.consumeStream();
        await closeMcpOnce();
      },
      onError: (error) => {
        // 兜底文案保留可读中文；技术细节走上面的 app_log_events，不再把原始 provider 报文抛给浏览器。
        return error instanceof Error ? `AI 回答生成失败：${error.message}` : '学生会话流式响应失败';
      },
    });
    const response = createUIMessageStreamResponse({ stream });
    response.headers.set('x-conversation-id', conversation.id);
    assignmentHeaders(response, immediateAssignment);
    if (!immediateAssignment && classifiedProjectName) response.headers.set('x-project-name', encodeURIComponent(classifiedProjectName));
    if (!immediateAssignment && projectId) response.headers.set('x-project-id', projectId);
    return response;
  });
}
