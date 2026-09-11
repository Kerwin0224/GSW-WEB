-- 会话消息的本人写策略补齐（PR #5）。
--
-- baseline 只有 SELECT / INSERT / 教师 UPDATE 三条策略，导致学生身份的
-- 服务端客户端（走用户 JWT，RLS 生效）对 bloom_state 的 pending →
-- classified / failed 状态流转被静默拒绝，前端永远显示"正在判断提问类型"。
-- 与 messages_owner_insert 同范围：本人 + student_chat 来源 + 未软删；
-- 教师已核实的会话由 API 层 isStudentConversationFinalized 前置拦截。

-- 1) UPDATE：布鲁姆状态流转、会话内状态修正。
CREATE POLICY "messages_owner_update" ON "public"."conversation_messages"
FOR UPDATE USING (
  EXISTS (
    SELECT 1
     FROM "public"."conversations" "c"
    WHERE "c"."id" = "conversation_messages"."conversation_id"
      AND "c"."owner_id" = "public"."current_app_user_id"()
      AND "c"."source" = 'student_chat'::"public"."interaction_source"
      AND "c"."deleted_at" IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
     FROM "public"."conversations" "c"
    WHERE "c"."id" = "conversation_messages"."conversation_id"
      AND "c"."owner_id" = "public"."current_app_user_id"()
      AND "c"."source" = 'student_chat'::"public"."interaction_source"
      AND "c"."deleted_at" IS NULL
  )
);

-- 2) DELETE：会话中间节点编辑/回滚（删除某节点及其后的消息）。
CREATE POLICY "messages_owner_truncate" ON "public"."conversation_messages"
FOR DELETE USING (
  EXISTS (
    SELECT 1
     FROM "public"."conversations" "c"
    WHERE "c"."id" = "conversation_messages"."conversation_id"
      AND "c"."owner_id" = "public"."current_app_user_id"()
      AND "c"."source" = 'student_chat'::"public"."interaction_source"
      AND "c"."deleted_at" IS NULL
  )
);
