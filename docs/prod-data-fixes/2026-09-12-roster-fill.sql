-- 2026-09-12 生产一次性数据修正：账号实名化 + 班级名册填充
--
-- 背景：用户要求演示/测试数据使用真实全名（弃用"王同学/李老师/教务管理员"占位名），
-- 并按真实校园场景补齐班级名册。命名规范（与 supabase/seed.sql 一致）：
--   教师工号 = 入职年份(4位) + 4位流水；学生学号 = 入学年份(4位) + 4位流水。
-- 密码统一 demo1234（extensions.crypt 生成，与本地 seed 相同演示口径）。
-- 可逆：A 节为 UPDATE display_name（原名见注释）；B 节仅 INSERT 新行，按固定 UUID 可精确删除。
-- 注意：新账号 email 沿用生产 @wenyun.com 模式；auth.users 先于 profiles 插入（FK）。

BEGIN;

-- ── A. 既有账号实名化（原名：教务管理员 / 李老师 / 王同学）────────────────
UPDATE profiles SET display_name = '周慧明' WHERE login_id = '20240001' AND role = 'admin';
UPDATE profiles SET display_name = '沈立行' WHERE login_id = '20240002' AND role = 'teacher';
UPDATE profiles SET display_name = '陈砚秋' WHERE login_id = '20260101' AND role = 'student';

-- ── B. 班级名册（高一1班已存在 b0000000-…-101，补高一2班）──────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
SELECT
  p.id,
  p.login_id || '@wenyun.com',
  extensions.crypt('demo1234', extensions.gen_salt('bf')),
  now(), now(), now()
FROM (VALUES
  ('a0000000-0000-0000-0000-000000000003'::uuid, '20180001'),  -- 顾清晏 教师
  ('a0000000-0000-0000-0000-000000000004'::uuid, '20240102'),  -- 林望舒
  ('a0000000-0000-0000-0000-000000000005'::uuid, '20240103'),  -- 苏晏清
  ('a0000000-0000-0000-0000-000000000006'::uuid, '20240104'),  -- 江晚吟
  ('a0000000-0000-0000-0000-000000000007'::uuid, '20240105'),  -- 赵启铭
  ('a0000000-0000-0000-0000-000000000008'::uuid, '20240106'),  -- 何雨眠
  ('a0000000-0000-0000-0000-000000000009'::uuid, '20240201'),  -- 孟繁星
  ('a0000000-0000-0000-0000-00000000000a'::uuid, '20240202'),  -- 秦子衿
  ('a0000000-0000-0000-0000-00000000000b'::uuid, '20240203')   -- 柳闻莺
) AS p(id, login_id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, login_id, display_name, role, status, password_hash)
SELECT
  p.id,
  p.login_id,
  p.display_name,
  p.role,
  'active',
  extensions.crypt('demo1234', extensions.gen_salt('bf'))
FROM (VALUES
  ('a0000000-0000-0000-0000-000000000003'::uuid, '20180001', '顾清晏', 'teacher'),
  ('a0000000-0000-0000-0000-000000000004'::uuid, '20240102', '林望舒', 'student'),
  ('a0000000-0000-0000-0000-000000000005'::uuid, '20240103', '苏晏清', 'student'),
  ('a0000000-0000-0000-0000-000000000006'::uuid, '20240104', '江晚吟', 'student'),
  ('a0000000-0000-0000-0000-000000000007'::uuid, '20240105', '赵启铭', 'student'),
  ('a0000000-0000-0000-0000-000000000008'::uuid, '20240106', '何雨眠', 'student'),
  ('a0000000-0000-0000-0000-000000000009'::uuid, '20240201', '孟繁星', 'student'),
  ('a0000000-0000-0000-0000-00000000000a'::uuid, '20240202', '秦子衿', 'student'),
  ('a0000000-0000-0000-0000-00000000000b'::uuid, '20240203', '柳闻莺', 'student')
) AS p(id, login_id, display_name, role)
ON CONFLICT (login_id) DO NOTHING;

INSERT INTO classes (id, name, grade, status, created_by)
VALUES ('b0000000-0000-0000-0000-000000000102', '高一(2)班', '高一', 'active', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── C. 班级成员关系（幂等）───────────────────────────────────────────────────
INSERT INTO class_memberships (class_id, profile_id, role)
VALUES
  -- 高一(1)班：沈立行任教；陈砚秋及新转入学生
  ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000002', 'teacher'),
  ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000011', 'student'),
  ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000004', 'student'),
  ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000005', 'student'),
  ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000006', 'student'),
  ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000007', 'student'),
  ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000008', 'student'),
  -- 高一(2)班：顾清晏任教
  ('b0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000003', 'teacher'),
  ('b0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000009', 'student'),
  ('b0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-00000000000a', 'student'),
  ('b0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-00000000000b', 'student')
ON CONFLICT (class_id, profile_id) DO NOTHING;

-- 陈砚秋既有学习数据挂到高一(1)班（与用户导入迁班行为一致，教师端可见其核实队列）
UPDATE text_projects SET class_id = 'b0000000-0000-0000-0000-000000000101'
WHERE owner_id = 'a0000000-0000-0000-0000-000000000011' AND class_id IS NULL;
UPDATE conversations SET class_id = 'b0000000-0000-0000-0000-000000000101'
WHERE owner_id = 'a0000000-0000-0000-0000-000000000011' AND source = 'student_chat' AND deleted_at IS NULL AND class_id IS NULL;

COMMIT;

-- 验证（期望：3 班级关系组齐全，无王同学/李老师占位名）：
-- SELECT p.login_id, p.display_name, p.role, c.name FROM profiles p
-- LEFT JOIN class_memberships m ON m.profile_id = p.id
-- LEFT JOIN classes c ON c.id = m.class_id ORDER BY p.role, p.login_id;
