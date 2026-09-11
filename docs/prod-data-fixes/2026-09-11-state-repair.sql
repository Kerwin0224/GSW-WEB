-- 2026-09-11 生产一次性数据状态修复
--
-- A. 归档会话补归属
--   f71e4752 “孔雀东南飞 是叙事诗还是抒情诗” -> 孔雀东南飞
--   （57a041ba “秦时明月汉时关”已于 14:51:53Z 被学生自行软删，不再处理；无出塞项目需求）
--   8825f800 “庄子散文的特点有哪些？”维持归档（作者级话题，无单一篇目）。
--   语境：非流式 JSON 被网关拒绝（PR #4 前）+ 小模型不守两行协议（PR #5 解析加固前）。
--
-- B. 布鲁姆状态卡死修复
--   baseline 缺 messages_owner_update RLS 策略，服务端对学生消息的
--   pending → classified / failed 更新被静默拒绝，10 条用户消息永久
--   停在 pending（前端"正在判断提问类型"）。RLS 策略由迁移
--   20260911140732_messages_owner_write_policies.sql 补齐；
--   本节把无存活流的存量 pending 收敛为 unclassified（分类确实未成功过，不虚构）。
--
-- 注意：CONTEXT.md 规定归档会话不补归属，A 节为用户明确要求的错数据纠正，属合规例外。
-- 可逆：UPDATE 仅动 project_id（原值 NULL）与 bloom_state（原值 pending）。

-- ── A. 孔雀东南飞补归属 ──────────────────────────────────────────────
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

-- ── B. 存量 pending 收敛 ─────────────────────────────────────────────
UPDATE conversation_messages
SET bloom_state = 'unclassified'
WHERE role = 'user' AND bloom_state = 'pending';

-- 验证：
-- 1) 期望 f71e4752 带《孔雀东南飞》；学生归档仅剩 8825f800（庄子散文）。
--    SELECT left(c.id::text,8) AS conv, p.title AS project
--    FROM conversations c LEFT JOIN text_projects p ON p.id = c.project_id
--    WHERE c.source='student_chat' AND c.deleted_at IS NULL ORDER BY c.created_at DESC;
-- 2) 期望 pending 计数归零。
--    SELECT bloom_state, count(*) FROM conversation_messages WHERE role='user' GROUP BY 1;
