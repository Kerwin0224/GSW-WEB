-- 演示用种子数据：supabase db reset 后自动执行。
-- 原则：只放每个环境都该有的最小账号/班级骨架；批量造数走 web/scripts/ 脚本。
-- 只造"用户与班级场景"数据，不造会话/提问等 Agent 交互数据（那些应由真实使用产生）。
-- profiles.id 外键指向 auth.users，所以先插 auth.users（应用本身不用 Supabase Auth，
-- 这层只为满足约束；真正的登录校验走 profiles.password_hash + authenticate_school_account）。
-- 密码策略（2026-09-12 裁定）：管理员导入/建号的账号初始密码 = 学号/工号（8 位），
-- 且 must_change_password=true 强制首登改密（自助改密 ≥10 位，见
-- 20260912110000_initial_password_login_id.sql）。seed 里的账号是"已完成首登"的
-- 演示账号，故密码统一 demo1234（bcrypt 由 pgcrypto 的 crypt 生成）且不强制改密；
-- 账号与密码一一对应：登录名见下表，密码均为 demo1234。
-- 固定 UUID 便于本地脚本/前端联调时硬编码引用。
--
-- 登录名规范（工号/学号，纯数字，全局唯一；多租户落地后改为校内唯一）：
--   教师/行政工号 = 入职年份(4位) + 4位流水，如 20150001（2015 年入职第 1 人）；
--   学生学号     = 入学年份(4位) + 4位流水，如 20240101（2024 级第 101 号）。
BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT
  p.id,
  p.login_id || '@demo.local',
  extensions.crypt('demo1234', extensions.gen_salt('bf')),
  now(), now(), now()
FROM (VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, '20000101'),
  ('00000000-0000-0000-0000-000000000002'::uuid, '20150101'),
  ('00000000-0000-0000-0000-000000000003'::uuid, '20240101'),
  ('00000000-0000-0000-0000-000000000004'::uuid, '20240102'),
  ('00000000-0000-0000-0000-000000000005'::uuid, '20180001'),
  ('00000000-0000-0000-0000-000000000006'::uuid, '20240103'),
  ('00000000-0000-0000-0000-000000000007'::uuid, '20240104'),
  ('00000000-0000-0000-0000-000000000008'::uuid, '20240105'),
  ('00000000-0000-0000-0000-000000000009'::uuid, '20240106'),
  ('00000000-0000-0000-0000-00000000000a'::uuid, '20240201'),
  ('00000000-0000-0000-0000-00000000000b'::uuid, '20240202'),
  ('00000000-0000-0000-0000-00000000000c'::uuid, '20240203'),
  -- e2e 夹具（scripts/sft-dpo-pipeline-e2e.mjs 默认引用的固定 UUID）
  ('a0000000-0000-0000-0000-000000000001'::uuid, '20990001'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, '20990002'),
  ('a0000000-0000-0000-0000-000000000012'::uuid, '20990101')
) AS p(id, login_id);

-- 账号一览（密码均为 demo1234）：管理员 20000101 周慧明；
-- 教师 20150101 沈立行（高一1班）、20180001 顾清晏（高一2班）；学生见 profiles 插入段。
INSERT INTO public.profiles (id, login_id, display_name, role, status, password_hash, must_change_password) VALUES
  -- 管理员与教师（工号 = 入职年 + 流水）
  ('00000000-0000-0000-0000-000000000001', '20000101', '周慧明', 'admin',   'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('00000000-0000-0000-0000-000000000002', '20150101', '沈立行', 'teacher', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('00000000-0000-0000-0000-000000000005', '20180001', '顾清晏', 'teacher', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  -- 高一（1）班学生（2024 级，01 开头流水）
  ('00000000-0000-0000-0000-000000000003', '20240101', '陈砚秋', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('00000000-0000-0000-0000-000000000004', '20240102', '林望舒', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('00000000-0000-0000-0000-000000000006', '20240103', '苏晏清', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('00000000-0000-0000-0000-000000000007', '20240104', '江晚吟', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('00000000-0000-0000-0000-000000000008', '20240105', '赵启铭', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('00000000-0000-0000-0000-000000000009', '20240106', '何雨眠', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  -- 高一（2）班学生（2024 级，02 开头流水）
  ('00000000-0000-0000-0000-00000000000a', '20240201', '孟繁星', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('00000000-0000-0000-0000-00000000000b', '20240202', '秦子衿', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('00000000-0000-0000-0000-00000000000c', '20240203', '柳闻莺', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  -- e2e 夹具账号（仅供 scripts/sft-dpo-pipeline-e2e.mjs 使用，登录名走 2099 测试段）
  ('a0000000-0000-0000-0000-000000000001', '20990001', 'e2e管理员', 'admin',   'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('a0000000-0000-0000-0000-000000000002', '20990002', 'e2e教师',   'teacher', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false),
  ('a0000000-0000-0000-0000-000000000012', '20990101', 'e2e学生',   'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')), false);

INSERT INTO public.classes (id, name, grade, status, created_by) VALUES
  ('00000000-0000-0000-0000-0000000000aa', '高一（1）班', '高一', 'active', '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-0000000000ab', '高一（2）班', '高一', 'active', '00000000-0000-0000-0000-000000000005'),
  -- e2e 夹具班级（scripts/sft-dpo-pipeline-e2e.mjs 默认 classId）
  ('c0000000-0000-0000-0000-000000000001', 'e2e 测试班', '高一', 'active', 'a0000000-0000-0000-0000-000000000001');

INSERT INTO public.class_memberships (class_id, profile_id, role) VALUES
  -- 高一（1）班：沈立行任教
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000002', 'teacher'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000003', 'student'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000004', 'student'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000006', 'student'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000007', 'student'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000008', 'student'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000009', 'student'),
  -- 高一（2）班：顾清晏任教
  ('00000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-000000000005', 'teacher'),
  ('00000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000a', 'student'),
  ('00000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000b', 'student'),
  ('00000000-0000-0000-0000-0000000000ab', '00000000-0000-0000-0000-00000000000c', 'student'),
  -- e2e 夹具班级（scripts/sft-dpo-pipeline-e2e.mjs 默认 classId）
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'teacher'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012', 'student');

-- 本地会话签名密钥：current_app_user_id() / write_app_log_event 的 header 验签
-- 依赖 private.runtime_secrets.cwb_auth_secret（生产值由 Vercel 环境变量对应，
-- 此处为本地固定演示值），不供给则 RLS 身份头路径全部退化为匿名，
-- e2e 夹具查询会得到空集。本地 .env.local 与 e2e 运行时的 CWB_AUTH_SECRET
-- 必须等于此值。
INSERT INTO private.runtime_secrets (name, value)
VALUES ('cwb_auth_secret', 'dev-only-cwb-auth-secret-gsw-local')
ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;

COMMIT;
