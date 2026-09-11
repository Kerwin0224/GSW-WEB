-- 2026-09-11 生产一次性数据修正（第二批）：误入日常会话归档的学生会话补归属到篇目项目
-- 背景：篇目归属模型裁决对该网关失败（详见 PR #4/#5）：
--   非流式 JSON 被拒（request api_2c9b422f，"Invalid JSON response"）；
--   流式打通后小模型不守两行协议，把整段回答当首行输出导致 unclassified（request api_ea1045c4 / api_1a23739b）。
-- 归档沉寂会话逐条核对：
--   f71e4752 “孔雀东南飞 是叙事诗还是抒情诗”          -> 孔雀东南飞（明确点名篇目）
--   57a041ba “秦时明月汉时关 这句用到了什么修辞？”     -> 出塞（名句出自王昌龄《出塞》，明确可归属）
--   8825f800 “庄子散文的特点有哪些？”                 -> 不归属（作者级话题，无单一篇目；维持归档）
-- 归属人：owner a0000000-0000-0000-0000-000000000011，与第一批 backfill 同一学生。
-- 注意：CONTEXT.md 规定归档会话不补归属，本次为用户明确要求的错数据纠正，属合规例外；
--   两条被补归属会话的用户消息 bloom_state 保持 unclassified（分类从未执行成功，不虚构）。
-- 可逆：UPDATE 仅动 project_id（原值全为 NULL）；新建项目无其他引用时可删。

INSERT INTO text_projects (owner_id, title, author, classification_state)
SELECT 'a0000000-0000-0000-0000-000000000011', t.title, t.author, 'classified'
FROM (VALUES ('孔雀东南飞', NULL::text), ('出塞', '王昌龄')) AS t(title, author)
WHERE NOT EXISTS (
  SELECT 1 FROM text_projects p
  WHERE p.owner_id = 'a0000000-0000-0000-0000-000000000011' AND p.title = t.title
);

UPDATE conversations
SET project_id = (
  SELECT p.id FROM text_projects p
  WHERE p.owner_id = conversations.owner_id AND p.title = CASE
    WHEN conversations.id = 'f71e4752-4ea8-4dcd-92e7-4ba4a6be637c' THEN '孔雀东南飞'
    WHEN conversations.id = '57a041ba-95e1-4f2b-9914-50afcea55166' THEN '出塞'
  END
)
WHERE id IN ('f71e4752-4ea8-4dcd-92e7-4ba4a6be637c', '57a041ba-95e1-4f2b-9914-50afcea55166')
  AND project_id IS NULL AND deleted_at IS NULL;

-- 验证（期望：仅剩 8825f800 庄子散文一条无项目）：
-- SELECT left(c.id::text,8) AS conv, p.title AS project
-- FROM conversations c LEFT JOIN text_projects p ON p.id = c.project_id
-- WHERE c.source = 'student_chat' AND c.deleted_at IS NULL ORDER BY c.created_at DESC;
