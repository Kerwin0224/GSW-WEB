-- 会话中间节点编辑/回滚（PR #5）：学生删除自己未删除学生会话里的消息行。
-- 范围与 messages_owner_insert 对齐（本人 + student_chat 来源 + 未软删）；
-- 教师已核实的会话由 API 层 isStudentConversationFinalized 前置拦截，策略不重复表达。
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
