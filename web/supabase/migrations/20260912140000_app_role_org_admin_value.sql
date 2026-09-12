-- app_role 枚举补 org_admin（20260912130000 只放开了 profiles.role 的 CHECK 约束，
-- 漏了枚举类型本身：authenticate_school_account_v3 的 role::app_role 转换
-- 对 org_admin 行直接报 invalid input value，登录 RPC 整体失败）。
-- 注意：PG 事务内 ADD VALUE 后不能在同一事务使用新值，故独立成迁移。
alter type public.app_role add value if not exists 'org_admin' after 'student';
