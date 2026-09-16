/**
 * 目录路径的纯函数：拼路径 + 把归类结果解析回节点。
 *
 * 无 'server-only'、无网络，可直接单元测试——与 student-chat-prompts.ts 同一套接缝约定：
 * 纯逻辑与副作用层分开。classification-rule.ts 负责取数，这里负责算。
 */

export type CatalogNodeInput = { id: string; name: string; parent_id: string | null };

/** 把扁平的目录行拼成 { id, path } 列表。path 形如 "语文 / 高一 / 文言文"。 */
export function buildCatalogNodes(rows: ReadonlyArray<CatalogNodeInput>): Array<{ id: string; path: string }> {
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
  return rows.map((row) => ({ id: row.id, path: pathOf(row.id) })).filter((node) => Boolean(node.path));
}

/**
 * 把归类结果（篇目/知识点标题）解析到本校目录节点。
 * 匹配口径：标题与路径任一层完全相等或包含标题；命中多个时取**最长路径**（更具体）。
 * 找不到返回 null——目录是可选增强，匹配不上不阻塞建项目。
 */
export function resolveCatalogIdForTitle(
  title: string,
  nodes: ReadonlyArray<{ id: string; path: string }>,
): string | null {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;
  let best: { id: string; length: number } | null = null;
  for (const node of nodes) {
    const segments = node.path.split(' / ').map((segment) => segment.trim().toLowerCase());
    const hit = segments.some((segment) => segment === normalized || segment.includes(normalized));
    if (!hit) continue;
    if (!best || node.path.length > best.length) best = { id: node.id, length: node.path.length };
  }
  return best?.id ?? null;
}
