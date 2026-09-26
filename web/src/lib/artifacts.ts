import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fail, ok, type DataResult } from '@/lib/data/common';

/**
 * 文件类学习产物的统一出入口。
 *
 * 此前附件只有一条纯文本通道（切块进 documents 供 RAG 检索），
 * 拍照、扫描稿、代码、实验数据表全部无处安放。现在二进制走私有桶
 * `learning-artifacts`，纯文本额外切块进检索——两件事在这里收口，
 * 附件路由与提交物路由不各自抄一份体积/mime/路径规则。
 *
 * 路径约定 `{profile_id}/{用途}/{uuid}-{原名}`：第一段是归属，
 * 数据库侧 `storage_path_owner()` 与存储 RLS 都按它判权限。
 */

export const ARTIFACT_BUCKET = 'learning-artifacts';

/**
 * 分类附件的体积上限。纯文本还要切块做 embedding，预算最小；
 * 图片与 PDF 直接交给模型多模态通道，能给到 MB 级。
 * 桶自身上限 10MB（见 20260926120000 迁移），这里不再放宽。
 */
export const ARTIFACT_MAX_BYTES: Record<ArtifactKind, number> = {
  text: 512 * 1024,
  image: 5 * 1024 * 1024,
  pdf: 8 * 1024 * 1024,
};

export type ArtifactKind = 'text' | 'image' | 'pdf';

export type UploadedArtifact = {
  path: string;
  fileName: string;
  mime: string;
  size: number;
  kind: ArtifactKind;
  /** 只有纯文本会切块进 RAG；二进制留原文给模型多模态通道。 */
  indexed: boolean;
};

/** 签名 URL 有效期。一节课够用，泄露出去也很快失效。 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** 从签名 URL 里还原对象路径。Supabase 的格式是 `/object/sign/<bucket>/<path>?token=`。 */
const SIGNED_PATH_PATTERN = new RegExp(`/object/sign/${ARTIFACT_BUCKET}/(.+?)(?:\\?|$)`);

/**
 * mime → 用途分类。收 unrecognized 的 mime 是没用的：浏览器给不出
 * 扩展名时它给的是空串，而不是 `text/plain`，所以空 mime 直接判失败。
 */
export function artifactKindOf(mime: string | undefined | null): ArtifactKind | null {
  const type = (mime ?? '').split(';')[0].trim().toLowerCase();
  if (type.startsWith('text/')) return 'text';
  // json/xml 的正式类型不是 text/*，但它们本来就走纯文本切块那条路。
  if (type === 'application/json' || type === 'application/xml') return 'text';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('image/')) return 'image';
  return null;
}

/**
 * 生成对象路径。文件名只保留安全字符并截到尾部（保住扩展名），
 * 前缀 uuid 让同名文件重传不会互相覆盖。
 */
export function buildArtifactPath(profileId: string, scopeId: string, fileName: string) {
  const safeName = fileName.replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
  return `${profileId}/${scopeId}/${crypto.randomUUID()}-${safeName}`;
}

export async function uploadArtifact({
  supabase,
  profileId,
  scopeId,
  file,
  mime,
  kind,
  indexed,
}: {
  supabase: SupabaseClient;
  profileId: string;
  scopeId: string;
  file: File;
  mime: string;
  kind: ArtifactKind;
  indexed: boolean;
}): Promise<DataResult<UploadedArtifact>> {
  const path = buildArtifactPath(profileId, scopeId, file.name);
  const { error } = await supabase.storage.from(ARTIFACT_BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  });
  // 存储 RLS 按路径第一段判归属，写不进去只会是归属或策略问题，文案要说清是哪一类。
  if (error) return fail('error', `文件保存失败${/row-level security|permission denied/i.test(error.message) ? '：这个账号没有写入权限' : `：${error.message}`}`);
  return ok({ path, fileName: file.name, mime, size: file.size, kind, indexed });
}

export async function signArtifactUrl(supabase: SupabaseClient, path: string): Promise<DataResult<string>> {
  const { data, error } = await supabase.storage.from(ARTIFACT_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return fail('error', `文件访问链接生成失败${error ? `：${error.message}` : '：存储没有返回链接，请刷新后重试。'}`);
  return ok(data.signedUrl);
}

/** 删除对象。路径不属于当前账号时 RLS 只会让这一项失败，不影响其他项。 */
export async function removeArtifact(supabase: SupabaseClient, path: string): Promise<DataResult<void>> {
  const { error } = await supabase.storage.from(ARTIFACT_BUCKET).remove([path]);
  if (error) return fail('error', `文件删除失败：${error.message}`);
  return ok(undefined);
}

/** 批量签名。个别路径失效时只跳过那一条，不让整页 500。 */
export async function signArtifactUrls(supabase: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const entries = await Promise.all(
    unique.map(async (path) => {
      const signed = await signArtifactUrl(supabase, path);
      return signed.ok ? [path, signed.data] as const : null;
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}

/** 归属判定走数据库那一份真源（`storage_path_owner`），应用层不自己解析 UUID。 */
export async function artifactPathOwner(supabase: SupabaseClient, path: string): Promise<DataResult<string | null>> {
  const { data, error } = await supabase.rpc('storage_path_owner', { p_name: path });
  if (error) return fail('error', `文件归属校验失败：${error.message}`);
  return ok((data as string | null) ?? null);
}

/** 计数用：列出某个用途目录下的对象，用来卡住"单个会话最多 N 个附件"。 */
export async function countArtifacts(supabase: SupabaseClient, profileId: string, scopeId: string, limit: number): Promise<DataResult<number>> {
  const { data, error } = await supabase.storage.from(ARTIFACT_BUCKET).list(`${profileId}/${scopeId}`, { limit });
  if (error) return fail('error', `附件数量检查失败：${error.message}`);
  return ok(data?.length ?? 0);
}

export function artifactPathFromSignedUrl(url: string): string | null {
  const match = url.match(SIGNED_PATH_PATTERN);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * 模型入参里的 file part。URL 是**短时效签名链接**，过期后模型取不到图，
 * 所以每次进模型前都按原路径重新签一次，并用 `storage_path_owner` 确认
 * 这个路径确实是当前账号的——part 来自浏览器，不能因为它长得像签名 URL 就信。
 * 校验不过返回 null：宁可不带这张图，也不能把别人的文件送进模型。
 */
export type ArtifactFilePart = { type: 'file'; mediaType: string; filename?: string; url: string };

export async function refreshArtifactPart(
  supabase: SupabaseClient,
  part: unknown,
  profileId: string,
): Promise<ArtifactFilePart | null> {
  if (!part || typeof part !== 'object') return null;
  const record = part as Record<string, unknown>;
  if (record.type !== 'file' || typeof record.url !== 'string' || typeof record.mediaType !== 'string') return null;

  const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://invalid.invalid').origin;
  let url: URL;
  try {
    url = new URL(record.url);
  } catch {
    return null;
  }
  if (url.origin !== supabaseOrigin || url.protocol !== 'https:') return null;

  const path = artifactPathFromSignedUrl(url.toString());
  if (!path) return null;
  const owner = await artifactPathOwner(supabase, path);
  if (!owner.ok || owner.data !== profileId) return null;

  const signed = await signArtifactUrl(supabase, path);
  if (!signed.ok) return null;
  return {
    type: 'file',
    mediaType: record.mediaType,
    url: signed.data,
    ...(typeof record.filename === 'string' ? { filename: record.filename } : {}),
  };
}
