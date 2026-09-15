-- 修复：总部/公司级账号（org_admin）泄露到各校管理员。
--
-- 事故根因：20260912130000_multi_tenant_foundations.sql 的 can_admin_profile 里，
-- 校 admin 分支写成 `target.school_id is null or target.school_id = me.school_id`。
-- 而 org_admin 账号的 school_id 天然为 NULL（公司级不挂校，见 ADR-0002），
-- 于是「文韵总部」命中 `school_id is null` 兜底，被每一所学校的 admin 在用户管理页
-- 读到——既是数据泄露，也是权限越界。
--
-- 修法：在校 admin 分支显式排除 org_admin 目标行。公司级账号不属于任何校内成员集合，
-- 任何学校管理员都无权可见；org_admin 自己的分支保持原语义（本公司旗下学校成员 +
-- 本公司公司级账号）。
--
-- 为什么不动 `school_id is null` 兜底本身：它是文档化的「未划归」过渡语义
-- （生产回填已于 2026-09-12 完成，见 docs/prod-data-fixes/2026-09-12-multi-tenant-anchor.sql），
-- 且此后所有建号路径都强制写 school_id（provision_school_account）。保留它避免误伤
-- 任何遗留未归属的普通账号；真正的泄露源是 org_admin 落进了这个分支。

create or replace function public.can_admin_profile(p_profile_id uuid) returns boolean
  language sql stable security definer
  set search_path to 'public'
  as $$
    select exists (
      select 1
      from public.profiles me
      join public.profiles target on target.id = p_profile_id
      where me.id = public.current_app_user_id() and me.status = 'active'
        and (
          -- 校 admin：本校成员，或未划归的普通账号。org_admin 是公司级账号
          -- （school_id 恒为 NULL），必须显式排除，否则对全校管理员泄露。
          (me.role = 'admin'
            and target.role <> 'org_admin'
            and (target.school_id is null or target.school_id = me.school_id))
          -- 公司管理员：本公司旗下各校成员；未划归行同样限定本公司，
          -- 否则 school_id 为 NULL 的公司级账号会被别家公司读到（同类泄露的另一半）。
          or (me.role = 'org_admin' and (
            target.school_id in (select s.id from public.schools s where s.org_id = me.organization_id)
            or (target.school_id is null
                and target.organization_id is not distinct from me.organization_id)
          ))
        )
    )
  $$;
