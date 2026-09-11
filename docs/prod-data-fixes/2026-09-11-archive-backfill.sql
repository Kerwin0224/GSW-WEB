-- 2026-09-11 生产一次性数据修正：4 条误入日常会话归档的学生会话补归属到篇目项目
-- 背景：篇目归属当时只认书名号 + 模型裁决静默失败（见 PR #2 #3），以下首问明确点名篇目却进了归档
--   5c7578c4 “赤壁赋的背景是什么”       -> 赤壁赋
--   b42e68cb “赤壁赋的作者是谁”         -> 赤壁赋
--   99a533b1 “登高这首诗的背景是什么？” -> 登高
--   3c098b23 “登高这首诗的背景是什么”   -> 登高
-- 归属人：owner a0000000-0000-0000-0000-000000000011（4 条同属同一学生，已逐条核对完整 UUID）
-- 注意：CONTEXT.md 规定归档会话不补归属，本次为用户明确要求的错数据纠正，属合规例外；
--   被补归属会话的用户消息 bloom_state 保持 unclassified（分类从未执行，不虚构）；
--   已在 Supabase SQL Editor 执行并用查询验证（10/10 会话均有项目，归档为 0）。
-- 可逆：UPDATE 仅动 project_id（原值全为 NULL）；新建的 2 个项目无其他引用时可删。

INSERT INTO text_projects (owner_id, title, author, classification_state)
SELECT 'a0000000-0000-0000-0000-000000000011', t.title, t.author, 'classified'
FROM (VALUES ('赤壁赋', '苏轼'), ('登高', '杜甫')) AS t(title, author)
WHERE NOT EXISTS (
  SELECT 1 FROM text_projects p
  WHERE p.owner_id = 'a0000000-0000-0000-0000-000000000011' AND p.title = t.title
);

UPDATE conversations SET project_id = (
  SELECT p.id FROM text_projects p
  WHERE p.owner_id = conversations.owner_id AND p.title = CASE
    WHEN conversations.id IN ('5c7578c4-4657-409b-bb48-0fc0bbe43b7f', 'b42e68cb-9ff8-4523-aedc-e47ed9782a3a') THEN '赤壁赋'
    WHEN conversations.id IN ('99a533b1-dc34-4812-ab1d-07e174f9b7f0', '3c098b23-e203-40fa-88c5-ff7c9b144e70') THEN '登高'
  END
)
WHERE id IN ('5c7578c4-4657-409b-bb48-0fc0bbe43b7f', 'b42e68cb-9ff8-4523-aedc-e47ed9782a3a', '99a533b1-dc34-4812-ab1d-07e174f9b7f0', '3c098b23-e203-40fa-88c5-ff7c9b144e70')
  AND project_id IS NULL AND deleted_at IS NULL;

-- 验证（期望：10 行全带项目名，归档 0 条）：
-- SELECT left(c.id::text,8) AS conv, p.title AS project
-- FROM conversations c LEFT JOIN text_projects p ON p.id = c.project_id
-- WHERE c.source = 'student_chat' AND c.deleted_at IS NULL ORDER BY c.created_at;
