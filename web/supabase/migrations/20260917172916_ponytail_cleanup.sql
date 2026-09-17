-- 一次性清理：删死代码（表 / 函数 / 冗余索引）、给三条漏了公司谓词的策略补谓词、
-- 补一条名册导入依赖的唯一约束。
--
-- 各段互不依赖，单独回滚任何一段都不影响其余段。
--
--   §1 drop table  data_quality_events          全仓零读零写（领域语义已判给 app_log_events）
--   §2 drop func   clear_school_model_tier_binding  应用层零调用方，按钮从未存在
--   §3 drop index  5 个被复合索引完全覆盖的前缀索引（纯写放大）
--   §4 重建策略    schools_admin_read / organizations_admin_read / organizations_org_admin_all
--                  补公司谓词（安全修复；第三条是 permissive OR 合并下的必需品）
--   §5 加约束      classes(school_id, name) unique —— admin.ts 的 upsert 落点
--   §6 revoke      match_document_chunks 的 EXECUTE（PUBLIC/anon/authenticated，保留 service_role）

-- ══════════════════════════════════════════════════════════════════════════════
-- §1 data_quality_events：整张表没有任何调用方
-- ══════════════════════════════════════════════════════════════════════════════
-- 全仓（web/src）零读写：既没有 .from('data_quality_events')，也没有任何 RPC 写它。
-- 唯一的痕迹是 database.types.ts 里那份类型声明与 CONTEXT.md 的一句反义说明
-- （「运行日志不是 data_quality_events 的同义词」）—— 两处都不构成依赖。
-- 领域语义已判给 app_log_events（20260905162000），这张表留着只是让人以为有第二条日志链路。
--
-- cascade 只为带走它自己的 pkey / 策略 / 授权，没有别的表引用它。
-- 注：库里还有 1 行历史数据，随表一起消失；这张表从未被写入过业务内容，丢的是运维噪声。

drop table if exists public.data_quality_events cascade;

-- ══════════════════════════════════════════════════════════════════════════════
-- §2 clear_school_model_tier_binding：为「回退到公司级绑定」按钮而建，按钮从未存在
-- ══════════════════════════════════════════════════════════════════════════════
-- 应用层零调用方（web/src 下 0 命中）。它的 anon EXECUTE 已在 20260916160943 收回，
-- 那个文件的两份清单只是历史记录，不动。
-- 直接 drop 而不先 revoke：函数没了，EXECUTE 面自然不存在。

drop function if exists public.clear_school_model_tier_binding(text);

-- ══════════════════════════════════════════════════════════════════════════════
-- §3 五个被复合索引完全覆盖的前缀索引
-- ══════════════════════════════════════════════════════════════════════════════
-- 每个都是另一条复合索引的最左前缀，只带来写入放大，没有任何查询只能靠它。
-- 两个 IS NOT NULL 部分索引覆盖前缀索引时，planner 能从 `col = x` 推出 `col IS NOT NULL`，
-- 谓词可证，索引照用。
--
--   idx_audit_auditor(auditor_id)          ⊂ audit_records_auditor_time_idx(auditor_id, updated_at desc) where auditor_id is not null
--   audit_records_class_id_idx(class_id)   ⊂ audit_records_class_time_idx(class_id, updated_at desc) where class_id is not null
--   idx_audit_kind(kind)                   ⊂ audit_records_exportable_idx(kind, status, updated_at desc)
--   idx_practice_project(project_id)       ⊂ practice_records_project_created_idx(project_id, created_at desc)
--   idx_practice_student(student_id)       ⊂ practice_records_student_created_idx(student_id, created_at desc)

drop index if exists public.idx_audit_auditor;
drop index if exists public.audit_records_class_id_idx;
drop index if exists public.idx_audit_kind;
drop index if exists public.idx_practice_project;
drop index if exists public.idx_practice_student;

-- ══════════════════════════════════════════════════════════════════════════════
-- §4 安全修复：org_admin 分支缺公司谓词，能读全平台学校与公司
-- ══════════════════════════════════════════════════════════════════════════════
-- 两条策略从 20260912130000 建好后从未收窄。org_admin 分支只写了 is_org_admin()，
-- 而 is_org_admin() 只回答「你是不是某公司的 org_admin」，不含「是不是**这家**公司」，
-- 于是任一公司的 org_admin 能 SELECT 全平台所有 schools / organizations 行。
--
-- 同文件里 schools_org_admin_all 就写对了（is_org_admin() and org_id in (...我的公司...)），
-- 这两条 select 策略漏了同一句。这里照抄那句谓词，不引入新函数。
--
-- 应用层的 .eq("org_id", ...) 一直掩盖着它，但 RLS 才是唯一防线。
--
-- 注意 PostgreSQL 没有 create or replace policy，只能 drop + create；
-- 这与本仓既有写法一致（见 20260912130000 / 20260916160943）。
-- 两个分支的语义各自保持不变，只是 org_admin 那支多了公司谓词：
--   · admin 支（本校管理员）原样保留，不加 status 判定——那不是本次要改的东西
--   · org_admin 支从「是 org_admin」收紧为「是这所学校的 org_admin」
--
-- 第三条（organizations_org_admin_all）不是顺手加的，是**必需**的：
-- permissive 策略之间按 OR 合并，而它是 `for all`，using (is_org_admin()) 对 SELECT 同样成立。
-- 只改 organizations_admin_read 的话，org_admin 照样读得到全平台公司 —— 读策略那条等于白改。
-- 用 `db query --linked` 的真身份探针实测过（.scratch/ponytail-audit-fixes/verify-org-admin-scope.sql）：
-- 只补两条读策略时 org_admin 仍可见 2 家公司，补上这条才掉到 1。
--
-- 只收 USING、不动 WITH CHECK：USING 管 SELECT/UPDATE/DELETE 的行可见性，
-- INSERT 只看 WITH CHECK，而新公司那一行还不存在、不可能满足「属于我」，
-- 把谓词写进 WITH CHECK 会让「建公司」直接失败。

drop policy if exists "schools_admin_read" on public.schools;
create policy "schools_admin_read" on public.schools for select
  using (
    (
      public.is_org_admin()
      and schools.org_id in (
        select organization_id from public.profiles where id = public.current_app_user_id()
      )
    )
    or exists (
      select 1 from public.profiles me
      where me.id = public.current_app_user_id()
        and me.role = 'admin' and me.school_id = schools.id
    )
  );

drop policy if exists "organizations_admin_read" on public.organizations;
create policy "organizations_admin_read" on public.organizations for select
  using (
    (
      public.is_org_admin()
      and organizations.id in (
        select organization_id from public.profiles where id = public.current_app_user_id()
      )
    )
    or exists (
      select 1 from public.profiles me
      join public.schools s on s.id = me.school_id
      where me.id = public.current_app_user_id()
        and me.role = 'admin' and s.org_id = organizations.id
    )
  );

drop policy if exists "organizations_org_admin_all" on public.organizations;
create policy "organizations_org_admin_all" on public.organizations
  using (
    public.is_org_admin()
    and organizations.id in (
      select organization_id from public.profiles where id = public.current_app_user_id()
    )
  )
  with check (public.is_org_admin());

-- ══════════════════════════════════════════════════════════════════════════════
-- §5 classes(school_id, name) 唯一约束
-- ══════════════════════════════════════════════════════════════════════════════
-- baseline 只有 classes_pkey，所以 src/lib/data/admin.ts 的 upsert(..., {onConflict:"name"})
-- 恒 42P10（no unique or exclusion constraint matching the ON CONFLICT specification），
-- 整批名册导入在该行中断。约束落地后 onConflict 用 "school_id,name" 才有落点
-- （代码侧改动不在这条迁移里）。
--
-- 存在性用 pg_constraint 判，不用 exception 兜：真出现重复 (school_id, name) 数据时
-- 要如实报错，不能被 when duplicate_object 静默吞掉。加约束前已确认云端 0 重复。

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.classes'::regclass
       and conname = 'classes_school_name_key'
  ) then
    alter table public.classes
      add constraint classes_school_name_key unique (school_id, name);
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- §6 match_document_chunks：项目级 RAG 链路已删，留下的 EXECUTE 是孤儿授权
-- ══════════════════════════════════════════════════════════════════════════════
-- 这是**项目级**检索 RPC。它跟会话级的 match_conversation_document_chunks 是两套独立实现
-- （baseline 里各建各的函数体，没有互相调用），那条链仍在用，动不得；这条已死。
--
-- src/lib/data/retrieval.ts 里项目级那一整条（retrieveDocumentChunks / matchDocumentChunks）
-- 随本次清理删除，全仓再无调用方。而 20260916160943 把它的 anon EXECUTE 列进了保留白名单
-- （当时它还有调用方，那份判断没问题），于是现在权限开着、没人调。
--
-- 只 revoke 不 drop：关掉执行面是这里唯一需要做的事，drop 是更大且不可逆的一步。
-- 不是不能 drop —— conversation-read-contract.test.ts 的 newestFunctionBody 只扫**迁移文件文本**
-- （migration-source.ts 按 `create or replace function public.<name>(` 定位），在新迁移里 drop 它，
-- 旧迁移里的函数体文本仍在，那条断言照旧通过。真要 drop 得先确认没有 SQL 侧引用，本轮没做那个确认。
--
-- 注：.scratch/multi-space-tenancy/ 下三份探针把 match_document_chunks 列在「必须有 anon EXECUTE」
-- 的 KEEP 集合里，本段落地后重跑它们会误报违规。那三份是上一轮的验证脚本，要用时先按本段更新集合。
--
-- 保留 service_role：它不是应用层调用方，是运维兜底身份，收掉只会让以后想从后台重跑
-- 检索时凭空多一道坎。同样收掉 PUBLIC 的默认 EXECUTE —— PostgreSQL 默认给 PUBLIC 授权，
-- 只 revoke anon 而留着 PUBLIC，anon 照样通过 PUBLIC 继承拿到执行权（见 20260916160943 开头）。
--
-- 走存在性循环而不是写死签名：revoke 没有 IF EXISTS，而本仓有过
-- 「写死的 revoke 撞上已 drop / 已改签名的函数、整条迁移失败」的先例。

do $$
declare
  v_rec record;
  v_revoked integer := 0;
begin
  for v_rec in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'match_document_chunks'
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated', v_rec.proname, v_rec.args);
    v_revoked := v_revoked + 1;
  end loop;
  raise notice 'match_document_chunks 的 EXECUTE 面已收敛，收回 % 个函数签名', v_revoked;
end $$;
