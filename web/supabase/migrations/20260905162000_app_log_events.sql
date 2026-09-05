-- 应用日志持久通道（治本）：Vercel serverless 文件系统只读，
-- 原 .logs/app-events.jsonl 本地落盘在生产写入失败（log_file_write_failed），
-- 管理后台"运行日志"在生产永远为空，客户端错误只能靠平台日志排查。
-- 该表是 writeLogEvent 的落库层：写入面向所有已验证应用用户（current_app_user_id 验签），
-- 读取仅管理员；update/delete 显式收回，日志只追加。
create table if not exists "public"."app_log_events" (
  "id" uuid not null default gen_random_uuid(),
  "created_at" timestamptz not null default now(),
  "level" text not null,
  "area" text not null,
  "event" text not null,
  "route" text,
  "method" text,
  "status" integer,
  "request_id" text,
  "message" text,
  "digest" text,
  "context" jsonb,
  constraint "app_log_events_level_check" check ("level" in ('debug', 'info', 'warn', 'error'))
);

alter table "public"."app_log_events" enable row level security;

create policy "app_log_events_insert_verified"
  on "public"."app_log_events" for insert
  with check ("public"."current_app_user_id"() is not null);

create policy "app_log_events_admin_read"
  on "public"."app_log_events" for select
  using ("public"."is_admin"());

revoke update, delete on "public"."app_log_events" from anon, authenticated;

create index if not exists "app_log_events_created_at_idx"
  on "public"."app_log_events" ("created_at" desc);
create index if not exists "app_log_events_level_idx"
  on "public"."app_log_events" ("level");
