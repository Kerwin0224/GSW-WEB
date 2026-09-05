-- 演示用种子数据：supabase db reset 后自动执行。
-- 原则：只放每个环境都该有的最小账号/班级骨架；批量造数走 web/scripts/ 脚本。
-- profiles.id 外键指向 auth.users，所以先插 auth.users（应用本身不用 Supabase Auth，
-- 这层只为满足约束；真正的登录校验走 profiles.password_hash + authenticate_school_account）。
-- 密码统一为 demo1234（bcrypt 由 pgcrypto 的 crypt 生成，该扩展在 extensions schema 下）。
-- 固定 UUID 便于本地脚本/前端联调时硬编码引用。

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
  ('00000000-0000-0000-0000-000000000004'::uuid, '20240102')
) AS p(id, login_id);

INSERT INTO public.profiles (id, login_id, display_name, role, status, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', '20000101', '演示管理员', 'admin',   'active', extensions.crypt('demo1234', extensions.gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000000002', '20150101', '演示教师',   'teacher', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000000003', '20240101', '演示学生甲', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf'))),
  ('00000000-0000-0000-0000-000000000004', '20240102', '演示学生乙', 'student', 'active', extensions.crypt('demo1234', extensions.gen_salt('bf')));

INSERT INTO public.classes (id, name, grade, status, created_by) VALUES
  ('00000000-0000-0000-0000-0000000000aa', '高一（1）班', '高一', 'active', '00000000-0000-0000-0000-000000000002');

INSERT INTO public.class_memberships (class_id, profile_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000002', 'teacher'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000003', 'student'),
  ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000004', 'student');

COMMIT;
