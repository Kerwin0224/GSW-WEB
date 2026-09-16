-- 空间：老师自建、拉学生、带主题的学习容器。
--
-- 产品裁定（2026-09-16）：**空间属于老师**；老师可管多个班，**通过班批量拉学生**；
-- 空间必属一所学校。学生切换自己被拉进去的空间，切到哪个就按哪个空间的主题归类。
--
-- ── 为什么成员关系不落在 class_memberships 上 ────────────────────────────────
-- 空间成员由「班」派生：space_classes 一条边 = 该班全部学生自动在内。
-- 这一个选择同时消掉了四道闸门里的三道：
--   · class_memberships_one_student_class_idx 不用 drop——「一个学生一个行政班」不被破坏
--   · sync_project_contract 不用改
--   · 学习数据四张表（projects / conversations / documents / practice_records）一列不加
-- 更关键的是：**空间所有者必然是该班任课教师**，于是 teacher_can_access_class 天然成立，
-- 9 条教师读策略与 audit_records.class_id NOT NULL 一个字节不改。
--
-- 代价（已与产品确认）：不支持「逐个移出学生」与「只拉班里的部分学生」。
-- 要支持就得引入第二份名册真源（墓碑表），而那份真源不响应班册变化、学生转学后留孤儿行。
-- 移出 = 取消拉班（删 space_classes 一条边）或学生转班。
--
-- ─ 本迁移是纯增量 ───────────────────────────────────────────────────────────
-- 只建新表、新函数、新策略；不改任何既有表结构、不 drop 任何既有策略。
-- 旧主题源（prompt_presets 的 project_classification 行）保持可用，应用层作为回退，
-- 因此新代码上线前老师配的规则照常生效。删除旧路径必须是**另一次**迁移——
-- 迁移先于新代码生效（见 docs/agents/deployment.md），同批推送会让运行中的旧代码读到空规则表。
--
-- ── 策略递归：本文件最容易踩的坑 ─────────────────────────────────────────────
-- classes 与 class_memberships 之间**禁止**在策略里互相内联子查询，会闭合成环
-- （infinite recursion detected in policy），纯 DDL 自检与 db reset 都发现不了。
-- 本文件所有判定一律走 security definer helper，与既有 can_admin_class /
-- teacher_can_access_class 的做法一致。

-- ── 1. 表 ────────────────────────────────────────────────────────────────────

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  -- 空间主题 = 老师写的归类口径（提示词，不是配置）。一列，改了就下次归类生效，不追溯。
  -- 刻意不做草稿态：草稿与生效值同行会被学生读到（RLS 是行级的），要草稿必须拆表。
  theme text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spaces_name_check check (btrim(name) <> '' and char_length(name) <= 40),
  constraint spaces_theme_check check (char_length(theme) <= 4000),
  constraint spaces_status_check check (status in ('active', 'archived'))
);

alter table public.spaces enable row level security;

-- 同一老师、同一学校内不重名（归档后名字可复用）。
-- 必须带 school_id：create_space 的复用查询受 RLS 约束（can_manage_space_row 要求
-- school_id = current_school_id()），老师换校后查不到旧空间 → 走 INSERT → 撞索引 23505，
-- 而那条旧空间他自己既改不了也归档不了，等于永久占着那个名字。
-- 索引口径与查询口径必须一致，否则就是一个查不到又插不进的死角。
create unique index if not exists spaces_owner_school_name_key
  on public.spaces (owner_id, school_id, name) where status = 'active';
create index if not exists spaces_school_idx on public.spaces (school_id);
create index if not exists spaces_owner_idx on public.spaces (owner_id) where status = 'active';

-- 成员关系就是这条边。行数 O(空间 × 班)，不是 O(学生)：
-- 拉一个班 = 插一行，班册变动零维护（新生自动进、退学自动出，全库零同步）。
create table if not exists public.space_classes (
  space_id uuid not null references public.spaces(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (space_id, class_id)
);

alter table public.space_classes enable row level security;
create index if not exists space_classes_class_idx on public.space_classes (class_id);

drop trigger if exists spaces_touch on public.spaces;
create trigger spaces_touch before update on public.spaces
  for each row execute function public.touch_updated_at();

-- ── 2. 空间不变量（写时断言不是不变量，所以钉在表上）──────────────────────────
-- 两条不变量，都是 RLS 表达不了的：
--   a) school_id 不可变 —— 空间换学校会让它连同主题一起进入别校管理员的可见范围。
--      老师调离时的正确动作是转交 owner_id，不是改学校。
--   b) 所有者必须是**同校教师** —— 否则管理员能把一校的空间转交给二校老师。
--      注意这条不能用 RLS 的 WITH CHECK 表达：策略里若写 can_manage_space(id)，
--      它回查表拿到的是**旧行**，转交后学校没变、管理员确实管得着旧行，于是放行。
--      必须按新行的列求值，而「跨列 + 跨表」的约束用触发器表达最直白。

create or replace function public.validate_space_contract() returns trigger
    language plpgsql security definer
    set search_path to 'public'
    as $$
declare
  v_role text;
  v_school uuid;
begin
  if tg_op = 'UPDATE' and new.school_id is distinct from old.school_id then
    raise exception 'space school cannot be changed; transfer owner_id instead'
      using errcode = '42501';
  end if;

  select p.role, p.school_id into v_role, v_school
    from public.profiles p where p.id = new.owner_id;

  if v_role is distinct from 'teacher' then
    raise exception 'space owner % must be a teacher profile', new.owner_id
      using errcode = '42501';
  end if;
  if v_school is distinct from new.school_id then
    raise exception 'space owner % must belong to the space school %', new.owner_id, new.school_id
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists spaces_contract on public.spaces;
create trigger spaces_contract before insert or update on public.spaces
  for each row execute function public.validate_space_contract();

-- ── 3. 判定 helper（全部 security definer——见文件头「策略递归」）──────────────

-- 成员关系的**唯一定义式**。三件事都写在这里，不散到策略的 WITH CHECK 里：
--   · 学生在该空间的某个班里
--   · 该空间仍生效
--   · **所有者仍任教该班**（否则老师调离后空间还在给学生派口径，而所有者名册已空）
--
-- 最后一条必须相对 s.owner_id 而不是 current_app_user_id()：照抄
-- teacher_can_access_class 会在调用者是学生时求值为 false，把全体学生赶出空间。
--
-- 学校等值用 (c.school_id is null or c.school_id = s.school_id)，与既有
-- teacher_can_access_class 的口径逐字一致——NULL 是过渡期状态，全库对它的处理
-- 统一是「放行」，这里不另立第二套。真正的成员判定是「所有者仍任教该班」这一条。
create or replace function public.is_my_space(p_space_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
      select exists (
        select 1
          from public.spaces s
          join public.space_classes sc on sc.space_id = s.id
          join public.classes c on c.id = sc.class_id
                              and (c.school_id is null or c.school_id = s.school_id)
          join public.class_memberships cm on cm.class_id = sc.class_id
         where s.id = p_space_id
           and s.status = 'active'
           and cm.profile_id = public.current_app_user_id()
           and cm.role = 'student'
           and exists (
             select 1 from public.class_memberships mt
              where mt.class_id = sc.class_id
                and mt.profile_id = s.owner_id
                and mt.role = 'teacher'
           )
      )
    $$;

-- 谁能管这个空间：所有者本人（且仍在本校），或该校/该公司的管理员。
-- 管理员这一路是「老师调离后交接」的入口——交接 = update owner_id，一步。
--
-- **按列求值**，不是按 id 回查表。原因是一个已经踩到的坑：
-- INSERT / UPDATE ... RETURNING（Supabase JS 的 .insert().select() 就是这个形状）
-- 会对**新行**求值 SELECT 策略；而这条策略里若用 STABLE 函数回查 spaces 表，
-- 函数用的是语句开始时的快照，**看不到本语句正在插入的那一行**，于是
-- 「新建自己的空间」被误判成越权，报 new row violates row-level security policy。
-- 按列求值不查表，天然正确，也把规则只写了一份（id 形式只是它的包装）。
create or replace function public.can_manage_space_row(p_owner_id uuid, p_school_id uuid)
    returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
      select (p_owner_id = public.current_app_user_id()
              and p_school_id = public.current_school_id())
          or public.can_admin_school_scope(p_school_id)
    $$;

create or replace function public.can_manage_space(p_space_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
      select public.can_manage_space_row(s.owner_id, s.school_id)
        from public.spaces s
       where s.id = p_space_id
    $$;

-- 空间与班是否同校。
--
-- 同样必须走 security definer，不能把裸子查询写进策略：策略的 WITH CHECK 是以
-- **调用者**身份求值的，`select ... from classes` 会受 classes 自己的 RLS 约束。
-- 调用者一旦看不到该班行，子查询返回空集 → 比较结果是 NULL 而不是 false → 策略
-- 静默拒绝，报出来的还是一句难懂的 new row violates row-level security policy。
-- 安全谓词的正确性不该依赖另一张表的策略可见性。
create or replace function public.space_class_same_school(p_space_id uuid, p_class_id uuid)
    returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
      select (select s.school_id from public.spaces s where s.id = p_space_id)
           = (select c.school_id from public.classes c where c.id = p_class_id)
    $$;

-- 判定函数要能被 anon 调用：RLS 策略是以**调用者**身份求值的，调用者没有 EXECUTE
-- 就直接 42501，整张表不可用。基线 GRANT ALL ... TO anon 与既有 helper 的
-- grant execute ... to anon（见 20260912130000 末尾）是同一个口径。
-- 注意：绝不写 revoke from anon —— 那会让策略自己失效。
grant execute on function public.is_my_space(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_space(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_space_row(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.space_class_same_school(uuid, uuid) to anon, authenticated, service_role;
revoke all on function public.validate_space_contract() from public, anon, authenticated;

-- ── 4. 策略（全部只在两张新表上；学习数据 0 条）──────────────────────────────

-- 用按列形式而不是 can_manage_space(id)：见 can_manage_space_row 的注释——
-- 这直接决定了 `insert ... returning` / `.insert().select()` 能不能用。
drop policy if exists "spaces_select" on public.spaces;
create policy "spaces_select" on public.spaces for select
  using (public.can_manage_space_row(owner_id, school_id) or public.is_my_space(id));

-- 只有老师能建空间，且必属本校。org_admin 的 current_school_id() 为 NULL，
-- 因此它建不了空间（公司级不下发空间，空间永远是学校的资产）。
drop policy if exists "spaces_insert" on public.spaces;
create policy "spaces_insert" on public.spaces for insert
  with check (
    owner_id = public.current_app_user_id()
    and school_id = public.current_school_id()
    and public.current_profile_role() = 'teacher'
  );

drop policy if exists "spaces_update" on public.spaces;
create policy "spaces_update" on public.spaces for update
  using (public.can_manage_space(id))
  with check (public.can_manage_space(id));

-- 刻意没有 delete 策略：空间只归档，不硬删。归档后学生侧即刻消失、主题立刻不再生效，
-- 成员边与历史原样保留（可恢复）。

-- 拉班/取消拉班。三个条件缺一不可：
--   我能管这个空间（老师本人或管理员）
--   我能碰这个班（既有 helper，含学校边界）
--   空间与班同校（写时钉住，配合上面的 school_id 不可变，这条边永远合法）
drop policy if exists "space_classes_manage" on public.space_classes;
create policy "space_classes_manage" on public.space_classes for all
  using (public.can_manage_space(space_id))
  with check (
    public.can_manage_space(space_id)
    and public.teacher_can_access_class(class_id)
    and public.space_class_same_school(space_id, class_id)
  );

-- ── 5. 写入入口 ──────────────────────────────────────────────────────────────
-- 两个都是 security **invoker**：RLS 仍是防线，RPC 不绕过它，只负责把多步收敛成一步。
-- 参数与错误码是接口的一部分：调用方按 errcode 区分「无权限」与「参数不合法」。

-- THE 入口：建空间 + 写主题 + 拉一个班，一次调用。幂等（同名活跃空间复用）。
create or replace function public.create_space(
  p_name text,
  p_theme text,
  p_class_id uuid default null
) returns uuid
    language plpgsql security invoker
    set search_path to 'public'
    as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_theme text := nullif(btrim(coalesce(p_theme, '')), '');
  v_space_id uuid;
begin
  if v_name = '' then
    raise exception 'space name cannot be empty' using errcode = '22023';
  end if;
  if public.current_profile_role() is distinct from 'teacher' then
    raise exception 'only a teacher can create a space' using errcode = '42501';
  end if;
  if public.current_school_id() is null then
    raise exception 'teacher has no school; a space must belong to a school' using errcode = '42501';
  end if;

  select id into v_space_id
    from public.spaces
   where owner_id = public.current_app_user_id()
     and name = v_name
     and status = 'active';

  if v_space_id is null then
    insert into public.spaces (school_id, owner_id, name, theme)
    values (public.current_school_id(), public.current_app_user_id(), v_name, coalesce(v_theme, ''))
    returning id into v_space_id;
  elsif v_theme is not null then
    -- 同名复用时不覆盖主题为空：老师只想再拉一个班，不该把已写好的主题清掉。
    update public.spaces set theme = v_theme where id = v_space_id;
  end if;

  if p_class_id is not null then
    perform public.pull_class_into_space(v_space_id, p_class_id);
  end if;
  return v_space_id;
end $$;

-- 再拉一个班。幂等：已在空间里的班返回 0。返回新增边数，调用方可据此区分
-- 「拉进来了」与「本来就在」。
create or replace function public.pull_class_into_space(p_space_id uuid, p_class_id uuid)
returns integer
    language plpgsql security invoker
    set search_path to 'public'
    as $$
declare
  v_added integer;
begin
  insert into public.space_classes (space_id, class_id, created_by)
  values (p_space_id, p_class_id, public.current_app_user_id())
  on conflict (space_id, class_id) do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end $$;

grant execute on function public.create_space(text, text, uuid) to anon, authenticated, service_role;
grant execute on function public.pull_class_into_space(uuid, uuid) to anon, authenticated, service_role;

-- ── 6. classes.school_id 的默认值 ───────────────────────────────────────────
-- createClass 从不写 school_id（src/lib/data/admin.ts:517 只传 name/grade/created_by），
-- 所以即使建班能成功，落库的 school_id 也是 NULL。而 can_admin_class /
-- teacher_can_access_class 对 NULL 全域放行（20260912130000:97/99/138），
-- 于是「本校老师只能管本校班」是个空承诺，space_classes 的同校等值检查
-- 对自家 UI 建的班也永远不成立。
--
-- 修法与 ADR-0003 同构：**给列设默认值**，让尚未更新的旧代码自动落对，
-- 迁移落地瞬间行为就正确，不必等代码部署。org_admin 的 current_school_id() 为 NULL，
-- 但它建不了班（createClass 要 requireRole('admin')），所以不会写出 NULL。
--
-- 注意：**建班此前根本走不通**——classes_app_admin_all 的 WITH CHECK 用
-- can_admin_class(id) 回查表，INSERT 时新行还不在，恒假。那是独立的一条，
-- 已由 20260916160943 修复。本段的默认值要等那条落地才真正开始生效。

alter table public.classes alter column school_id set default public.current_school_id();

-- 回填历史行：按创建者的学校补。创建者已无学校或 created_by 为空的行补不了，
-- 末尾自检会把剩余数量报出来。
update public.classes c
   set school_id = p.school_id
  from public.profiles p
 where p.id = c.created_by
   and c.school_id is null
   and p.school_id is not null;

-- ── 7. 自检 ──────────────────────────────────────────────────────────────────
-- 纯 DDL 自检抓不到策略递归（那是求值期错误），所以这里只断言结构与谓词存在；
-- 递归与隔离由 src/lib/__tests__/space-membership-contract.test.ts 与真库冒烟覆盖。

do $$
declare
  v_null_classes integer;
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'spaces' and table_type = 'BASE TABLE') then
    raise exception 'spaces table missing';
  end if;
  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'space_classes' and table_type = 'BASE TABLE') then
    raise exception 'space_classes table missing';
  end if;

  -- 判定函数必须是 security definer，否则策略内联查询会与 classes/class_memberships 闭合成环。
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('is_my_space', 'can_manage_space')
       and p.prosecdef = false
  ) then
    raise exception 'is_my_space/can_manage_space must be security definer';
  end if;

  if not exists (select 1 from pg_policies where tablename = 'spaces' and policyname = 'spaces_select') then
    raise exception 'spaces_select policy missing';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'space_classes' and policyname = 'space_classes_manage') then
    raise exception 'space_classes_manage policy missing';
  end if;
  -- 空间只归档：出现 delete 策略就是设计漂移。
  if exists (select 1 from pg_policies where tablename = 'spaces' and cmd = 'DELETE') then
    raise exception 'spaces must not have a delete policy (archive only)';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'spaces_contract' and not tgisinternal) then
    raise exception 'spaces_contract trigger missing';
  end if;

  -- 隔离谓词必须在定义式里，不能只在策略的 WITH CHECK 里（写时断言不是不变量）。
  if position('s.school_id' in (select prosrc from pg_proc where proname = 'is_my_space' limit 1)) = 0 then
    raise exception 'is_my_space lost its school predicate';
  end if;
  if position('s.owner_id' in (select prosrc from pg_proc where proname = 'is_my_space' limit 1)) = 0 then
    raise exception 'is_my_space lost the owner-still-teaches predicate';
  end if;

  select count(*) into v_null_classes from public.classes where school_id is null;
  if v_null_classes > 0 then
    raise notice '还有 % 个班级 school_id 仍为 NULL（创建者无学校或 created_by 为空）；这些班无法被拉进空间，需人工补归属', v_null_classes;
  end if;

  raise notice 'spaces / space_classes 就位：成员由班派生，学习数据零改动';
end $$;