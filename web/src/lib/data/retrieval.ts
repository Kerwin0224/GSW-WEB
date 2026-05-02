import 'server-only';

import { createGateway, embed, type EmbeddingModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@/lib/supabase/server';
import type { Database, Vector } from '@/lib/supabase/database.types';
import { fail, getCapability, ok, resolveEnvSecret, type CapabilityStatus, type DataResult } from './common';

export type DocumentChunkMatch = Database['public']['Functions']['match_document_chunks']['Returns'][number];

export type MatchDocumentChunksInput = {
  queryEmbedding: Vector;
  matchCount?: number;
  matchThreshold?: number;
  projectId?: string | null;
};

const DEFAULT_MATCH_COUNT = 8;
const DEFAULT_MATCH_THRESHOLD = 0.25;

function resolveEmbeddingModel(capability: CapabilityStatus): EmbeddingModel | null {
  if (!capability.modelId) return null;
  const apiKey = resolveEnvSecret(capability.secretRef);
  if (!apiKey) return null;
  if (capability.providerType === 'gateway') return createGateway({ apiKey, baseURL: capability.baseUrl ?? process.env.AI_GATEWAY_BASE_URL }).embedding(capability.modelId);
  return createOpenAI({ apiKey, baseURL: capability.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined }).embedding(capability.modelId);
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

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return fail('unauthenticated', '需要登录后才能检索私有文档片段。');
  }

  const { data, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    match_threshold: matchThreshold,
    project_id: projectId,
  });

  if (error) return fail('error', `RAG 检索失败：${error.message}`);
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
  const trimmed = query.trim();
  if (!trimmed) return fail('blocked', '检索 query 不能为空。');

  const capability = await getCapability('embedding');
  if (!capability.ok) return fail(capability.reason, capability.message);
  if (!capability.data.ready || !capability.data.modelId) {
    return fail('blocked', capability.data.blockedReason ?? '缺少 embedding 真实模型能力配置。');
  }
  const embeddingModel = resolveEmbeddingModel(capability.data);
  if (!embeddingModel) return fail('blocked', `${capability.data.providerName ?? 'Provider'} 的 secret_ref 未在服务端环境中解析成功；RAG 不会在缺少 embedding 密钥时降级。`);

  const { embedding } = await embed({
    model: embeddingModel,
    value: trimmed,
  });

  return matchDocumentChunks({ queryEmbedding: embedding, matchCount, matchThreshold, projectId });
}
