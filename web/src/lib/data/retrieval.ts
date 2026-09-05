import 'server-only';

import { createGateway, embed, type EmbeddingModel } from 'ai';
import { createOpenAI, type OpenAIEmbeddingModelOptions } from '@ai-sdk/openai';
import { createClient } from '@/lib/supabase/server';
import type { Database, Vector } from '@/lib/supabase/database.types';
import { getAppSession } from '@/lib/session';
import { fail, getCapability, ok, resolveEnvSecret, type CapabilityStatus, type DataResult } from './common';

export type DocumentChunkMatch = Database['public']['Functions']['match_document_chunks']['Returns'][number];
export type ConversationDocumentChunkMatch = Database['public']['Functions']['match_conversation_document_chunks']['Returns'][number];

export type MatchDocumentChunksInput = {
  queryEmbedding: Vector;
  matchCount?: number;
  matchThreshold?: number;
  projectId?: string | null;
};

const DEFAULT_MATCH_COUNT = 8;
const DEFAULT_MATCH_THRESHOLD = 0.25;
const CONVERSATION_RAG_EMBEDDING_DIMENSIONS = 768;

type ResolvedEmbeddingModel = {
  model: EmbeddingModel;
  modelId?: string;
};

function resolveEmbeddingModel(capability: CapabilityStatus): ResolvedEmbeddingModel | null {
  if (!capability.modelId) return null;
  const apiKey = resolveEnvSecret(capability.secretRef);
  if (!apiKey) return null;
  if (capability.providerType === 'gateway') {
    return {
      model: createGateway({ apiKey, baseURL: capability.baseUrl ?? process.env.AI_GATEWAY_BASE_URL }).embedding(capability.modelId),
      modelId: capability.modelId,
    };
  }
  return {
    model: createOpenAI({ apiKey, baseURL: capability.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined }).embedding(capability.modelId),
    modelId: capability.modelId,
  };
}

function embeddingProviderOptions(modelId?: string, dimensions?: number) {
  if (!dimensions) return undefined;
  if (!modelId?.startsWith('text-embedding-3-')) return undefined;
  return {
    openai: {
      dimensions,
    } satisfies OpenAIEmbeddingModelOptions,
  };
}

async function generateEmbedding(value: string, dimensions?: number): Promise<DataResult<Vector>> {
  const trimmed = value.trim();
  if (!trimmed) return fail('blocked', '检索 query 不能为空。');

  const capability = await getCapability('embedding');
  if (!capability.ok) return fail(capability.reason, capability.message);
  if (!capability.data.ready || !capability.data.modelId) {
    return fail('blocked', capability.data.blockedReason ?? '缺少 embedding 真实模型能力配置。');
  }
  const resolvedModel = resolveEmbeddingModel(capability.data);
  if (!resolvedModel) return fail('blocked', `${capability.data.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功；RAG 不会在缺少 embedding 密钥时降级。`);

  const { embedding } = await embed({
    model: resolvedModel.model,
    value: trimmed,
    providerOptions: embeddingProviderOptions(resolvedModel.modelId, dimensions),
  });
  return ok(embedding);
}

export async function embedText(value: string, dimensions?: number): Promise<DataResult<Vector>> {
  return generateEmbedding(value, dimensions);
}

export async function matchDocumentChunks({
  queryEmbedding,
  matchCount = DEFAULT_MATCH_COUNT,
  matchThreshold = DEFAULT_MATCH_THRESHOLD,
  projectId = null,
}: MatchDocumentChunksInput): Promise<DataResult<DocumentChunkMatch[]>> {
  if (!queryEmbedding.length) {
    return fail('blocked', 'queryEmbedding 不能为空；RAG 检索必须先生成真实 embedding。');
  }

  const session = await getAppSession();
  if (!session) {
    return fail('unauthenticated', '需要登录后才能检索私有文档片段。');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    match_threshold: matchThreshold,
    project_id: projectId,
  });

  if (error) return fail('error', `RAG 检索失败：${error.message}`);
  return ok(data ?? []);
}

export async function matchConversationDocumentChunks({
  queryEmbedding,
  conversationId,
  matchCount = 6,
  matchThreshold = DEFAULT_MATCH_THRESHOLD,
}: {
  queryEmbedding: Vector;
  conversationId: string;
  matchCount?: number;
  matchThreshold?: number;
}): Promise<DataResult<ConversationDocumentChunkMatch[]>> {
  if (!queryEmbedding.length) return fail('blocked', 'queryEmbedding 不能为空；会话 RAG 检索必须先生成真实 embedding。');
  if (!conversationId) return fail('blocked', 'conversationId 不能为空；会话 RAG 不允许跨会话检索。');

  const session = await getAppSession();
  if (!session) return fail('unauthenticated', '需要登录后才能检索当前会话附件。');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('match_conversation_document_chunks', {
    query_embedding: queryEmbedding,
    conversation_id: conversationId,
    match_count: matchCount,
    match_threshold: matchThreshold,
  });

  if (error) return fail('error', `会话 RAG 检索失败：${error.message}`);
  return ok(data ?? []);
}

export async function retrieveDocumentChunks({
  query,
  matchCount = DEFAULT_MATCH_COUNT,
  matchThreshold = DEFAULT_MATCH_THRESHOLD,
  projectId = null,
}: {
  query: string;
  matchCount?: number;
  matchThreshold?: number;
  projectId?: string | null;
}): Promise<DataResult<DocumentChunkMatch[]>> {
  const embedding = await generateEmbedding(query);
  if (!embedding.ok) return embedding;
  return matchDocumentChunks({ queryEmbedding: embedding.data, matchCount, matchThreshold, projectId });
}

export async function retrieveConversationDocumentChunks({
  query,
  conversationId,
  matchCount = 6,
  matchThreshold = DEFAULT_MATCH_THRESHOLD,
}: {
  query: string;
  conversationId: string;
  matchCount?: number;
  matchThreshold?: number;
}): Promise<DataResult<ConversationDocumentChunkMatch[]>> {
  const embedding = await generateEmbedding(query, CONVERSATION_RAG_EMBEDDING_DIMENSIONS);
  if (!embedding.ok) return embedding;
  return matchConversationDocumentChunks({ queryEmbedding: embedding.data, conversationId, matchCount, matchThreshold });
}
