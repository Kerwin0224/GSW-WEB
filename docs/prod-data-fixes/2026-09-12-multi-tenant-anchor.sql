-- 2026-09-12 生产一次性数据修正：多租户锚点落位（ADR-0002 v1）
-- ⚠ 执行时机：迁移 20260912130000_multi_tenant_foundations.sql 之后。
-- 内容：默认公司（文韵智途）+ 学校（主校区）；全部既有名册/班级/导出批次归入；
--       创建公司级大账号（org_admin，工号 10000001，初始密码=工号，强制首登改密）。
-- 可逆：UPDATE 仅动 organization_id/school_id（原值 NULL）；新 INSERT 行按固定 UUID 可删。

BEGIN;

INSERT INTO public.organizations (id, name, status)
VALUES ('a0000000-0000-0000-0000-00000000f001', '文韵智途', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, org_id, name, status)
VALUES ('a0000000-0000-0000-0000-00000000f101', 'a0000000-0000-0000-0000-00000000f001', '主校区', 'active')
ON CONFLICT (id) DO NOTHING;

-- 既有名册归入主校区（roster-fill + 实名化的 12 个账号）
UPDATE public.profiles
SET organization_id = 'a0000000-0000-0000-0000-00000000f001',
    school_id = 'a0000000-0000-0000-0000-00000000f101'
WHERE role IN ('admin', 'teacher', 'student')
  AND organization_id IS NULL;

-- 班级与导出批次归属
UPDATE public.classes SET school_id = 'a0000000-0000-0000-0000-00000000f101' WHERE school_id IS NULL;
UPDATE public.export_batches SET school_id = 'a0000000-0000-0000-0000-00000000f101' WHERE school_id IS NULL;

-- 公司级大账号（org_admin）
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('a0000000-0000-0000-0000-00000000f002', '10000001@accounts.wenyun.com',
        extensions.crypt('10000001', extensions.gen_salt('bf')), now(), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, login_id, display_name, role, status, password_hash, must_change_password, organization_id, school_id)
VALUES ('a0000000-0000-0000-0000-00000000f002', '10000001', '文韵总部', 'org_admin', 'active',
        extensions.crypt('10000001', extensions.gen_salt('bf')), true,
        'a0000000-0000-0000-0000-00000000f001', NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- 验证（期望：1 公司 1 校；除 f002 外 12 账号带 school_id；f002 为 org_admin 待改密）：
-- SELECT role, count(*), count(school_id) AS with_school FROM profiles GROUP BY role;
-- SELECT count(*) FROM export_batches WHERE school_id IS NULL;
