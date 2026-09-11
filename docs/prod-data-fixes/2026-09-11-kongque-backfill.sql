-- 2026-09-11 生产一次性数据修正（第二批）：孔雀东南飞首问补归属到篇目项目
-- 背景：篇目归属模型裁决走非流式 JSON，被 dots3-note-prev 网关拒绝
--   （app_log_events: project_classification_fallback, request api_2c9b422f-5ca3-49fc-a6dc-a4e5a4799f84,
--   reason=model-error, detail="Invalid JSON response"，发生时 PR #4 流式修复尚未部署）。
--   f71e4752 “孔雀东南飞 是叙事诗还是抒情诗” -> 孔雀东南飞
-- 代码修复：PR #4（篇目归属流式化）+ 本分支（布鲁姆判定流式化 + SSE 网关契约测试）。
-- 归属人：owner a0000000-0000-0000-0000-000000000011，与第一批 backfill 同一学生。
-- 注意：CONTEXT.md 规定归档会话不补归属，本次为用户明确要求的错数据纠正，属合规例外；
--   该会话用户消息 bloom_state 保持 unclassified（布鲁姆分类从未执行成功，不虚构）；
--   会话内无布鲁姆/挑战数据需要补建。
-- 可逆：UPDATE 仅动 project_id（原值为 NULL）；新建项目无其他引用时可删。

INSERT INTO text_projects (owner_id, title, author, classification_state)
SELECT 'a0000000-0000-0000-0000-000000000011', '孔雀东南飞', NULL, 'classified'
WHERE NOT EXISTS (
  SELECT 1 FROM text_projects p
  WHERE p.owner_id = 'a0000000-0000-0000-0000-000000000011' AND p.title = '孔雀东南飞'
);

UPDATE conversations
SET project_id = (
  SELECT p.id FROM text_projects p
  WHERE p.owner_id = conversations.owner_id AND p.title = '孔雀东南飞'
)
WHERE id = 'f71e4752-4ea8-4dcd-92e7-4ba4a6be637c'
  AND project_id IS NULL AND deleted_at IS NULL;

-- 验证（期望：该会话带项目名 孔雀东南飞）：
-- SELECT left(c.id::text,8) AS conv, p.title AS project
-- FROM conversations c LEFT JOIN text_projects p ON p.id = c.project_id
-- WHERE c.source = 'student_chat' AND c.deleted_at IS NULL ORDER BY c.created_at DESC;
