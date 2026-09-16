-- 会话读权限收口：修一条跨租户读漏洞，并把「谁能读一个会话」收敛成唯一真源。
--
-- ══════════════════════════════════════════════════════════════════════════════
-- 一、漏洞（多租户审计 S1，本轮读原文核实仍开着）
-- ══════════════════════════════════════════════════════════════════════════════
-- conversation_messages 的读策略用的是裸 is_admin()：
--   messages_conversation_scope
--     using (exists (select 1 from conversations c
--                     where c.id = conversation_messages.conversation_id
--                       and (c.owner_id = current_app_user_id()
--                            or is_admin()                      ← 这里
--                            or (c.class_id is not null and teacher_can_access_class(c.class_id)))))
--
-- 而 is_admin() 在 20260912130000 已从「校内 admin」扩成「admin + org_admin」。
-- 于是**任一公司的 org_admin 能读到全平台所有公司的会话消息**：
--   · 父表 conversations 在 20260912130000 已被改写成
--     `owner_id = me or (class_id is not null and can_admin_class(class_id))`（按校收敛）
--   · 子表这条策略没被同批重写，带着旧的全局 is_admin() 留了下来
--
-- 本仓零 service_role（src/lib/supabase/server.ts 只有 publishable key），RLS 是唯一防线，
-- 所以这是一条实打实的跨租户读通路，不是纵深防御缺一层。
--
-- ── 根因不是「漏写谓词」，是「同一条规则有两个家」────────────────────────────
-- 「谁能读一个会话」这条规则同时写在 conversations 与 conversation_messages 两张表的
-- 策略里，两份必须靠人力保持一致。上一次多租户重写只改了父表，子表就静默漂移成了洞——
-- 没有类型错误、没有测试失败、界面上一切正常（org_admin 多看到的消息看起来就"是那些消息"）。
-- 只要规则还有两个家，同一类漂移就会再发生一次。
--
-- 所以本迁移的处置不是「照抄一份带谓词的」，而是**把规则收成一个函数**，
-- 两张表的读策略都指向它。父表与子表从此不可能不一致——它们读的是同一份定义。
--
-- ── 二、行为变化（只有一处，且正是要修的那处）──────────────────────────────
--   学生（owner）          不变
--   任课教师（按班）        不变
--   校 / 公司管理员        从「全域」收窄为「本校本公司」，与父表 conversations 完全一致
--   class_id 为 NULL 的会话  管理员读不到 —— 与父表一致（父表管理员分支本来就要求
--                          class_id is not null），此前子表能读到而父表读不到，本身就是不一致
--
-- ── 三、顺带的同类项 ────────────────────────────────────────────────────────
-- match_document_chunks 的检索谓词里也有一条裸 is_admin()。它是 security **invoker**，
-- 而 document_chunks 的 RLS 已按 can_admin_profile 收敛，所以今天这段被 RLS 挡在后面、
-- 不是活洞；但它把同一条规则抄了第二份，一旦哪天被改成 definer 就是现成的洞。
-- 一并按策略的口径收敛。这是本文件唯一一处只改谓词、不改变行为的地方。

-- ══════════════════════════════════════════════════════════════════════════════
-- 四、「谁能读这个会话」的唯一定义式
-- ══════════════════════════════════════════════════════════════════════════════
-- 必须是 security definer：它要在 conversations 自己的读策略里被调用。若写成 invoker，
-- 函数体里那句 `select from public.conversations` 会再受 conversations 的 RLS 约束，
-- 与调用它的策略闭合成环，报 infinite recursion detected in policy —— 纯 DDL 自检与
-- db reset 都发现不了，只有真库读过一次才炸。本仓既有 helper 全是 definer，就是这个原因。
create or replace function public.can_read_conversation(p_conversation_id uuid) returns boolean
    language sql stable security definer
    set search_path to 'public'
    as $$
      select exists (
        select 1
          from public.conversations c
         where c.id = p_conversation_id
           and (
             -- 提问者本人
             c.owner_id = public.current_app_user_id()
             -- 校 / 公司管理员：按该会话所属班收敛（can_admin_class 内含学校边界）
             or (c.class_id is not null and public.can_admin_class(c.class_id))
             -- 该班任课教师
             or (c.class_id is not null and public.teacher_can_access_class(c.class_id))
           )
      )
    $$;

-- 策略是以**调用者**身份求值的，调用者没有 EXECUTE 就 42501、整张表不可用。
-- 绝不写 revoke from anon —— 运行角色就是 anon。
grant execute on function public.can_read_conversation(uuid) to anon, authenticated, service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- 五、两张表的读策略改指向同一份定义
-- ══════════════════════════════════════════════════════════════════════════════

drop policy if exists "messages_conversation_scope" on public.conversation_messages;
create policy "messages_conversation_scope" on public.conversation_messages for select
  using (public.can_read_conversation(conversation_id));

-- 父表的教师读策略原本只覆盖教师那一路；改用同一个函数后覆盖 owner / 管理员 / 教师，
-- 而前两路已被 conversations_owner_all 放开，所以**父表可见性不变**。
-- 换掉它是为了让这份规则真的有两个调用点——只有一处调用的话，它又变回「规则藏在某个地方」。
drop policy if exists "conversations_teacher_read" on public.conversations;
drop policy if exists "conversations_read" on public.conversations;
create policy "conversations_read" on public.conversations for select
  using (public.can_read_conversation(id));

-- ══════════════════════════════════════════════════════════════════════════════
-- 六、检索 RPC 里的同一份规则
-- ══════════════════════════════════════════════════════════════════════════════
-- 返回列与基线逐字一致（改返回类型必须先 drop function，见 school-scope-contract.test.ts）。
create or replace function public.match_document_chunks("query_embedding" "extensions"."vector", "match_count" integer DEFAULT 8, "match_threshold" double precision DEFAULT 0.25, "project_id" uuid DEFAULT NULL::uuid) RETURNS TABLE("id" uuid, "document_id" uuid, "owner_id" uuid, "class_id" uuid, "project_id" uuid, "chunk_index" integer, "content" text, "metadata" jsonb, "document_title" text, "source_uri" text, "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select dc.id, dc.document_id, dc.owner_id, dc.class_id, dc.project_id, dc.chunk_index, dc.content, dc.metadata, d.title, d.source_uri, 1 - (dc.embedding <=> query_embedding)
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where public.current_app_user_id() is not null
    and ($4 is null or dc.project_id = $4)
    and (dc.owner_id = public.current_app_user_id() or public.can_admin_profile(dc.owner_id) or (dc.class_id is not null and public.teacher_can_access_class(dc.class_id)))
    and 1 - (dc.embedding <=> query_embedding) >= match_threshold
  order by dc.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50)
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 七、自检
-- ══════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_messages text;
  v_reads text;
  v_helper text;
begin
  select prosrc into v_helper from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_read_conversation';
  if v_helper is null then
    raise exception '自检：can_read_conversation 不存在';
  end if;

  -- 必须是 definer，否则在 conversations 策略里会与自身闭合成环（求值期才炸）。
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'can_read_conversation' and p.prosecdef = false
  ) then
    raise exception '自检：can_read_conversation 必须 security definer（否则策略递归）';
  end if;

  -- 三路授权一个都不能少：少了 owner 学生读不到自己的消息，少了教师/管理员核实链断掉。
  if position('owner_id' in v_helper) = 0
     or position('can_admin_class' in v_helper) = 0
     or position('teacher_can_access_class' in v_helper) = 0 then
    raise exception '自检：can_read_conversation 少了授权分支（owner / 管理员 / 教师）';
  end if;

  select qual into v_messages from pg_policies
   where schemaname = 'public' and tablename = 'conversation_messages' and policyname = 'messages_conversation_scope';
  select qual into v_reads from pg_policies
   where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_read';

  if v_messages is null or position('can_read_conversation' in v_messages) = 0 then
    raise exception '自检：messages_conversation_scope 没有指向 can_read_conversation';
  end if;
  if v_reads is null or position('can_read_conversation' in v_reads) = 0 then
    raise exception '自检：conversations_read 没有指向 can_read_conversation';
  end if;

  -- 本次要灭掉的就是这个子串。它再出现一次，就是同一类漂移又发生了一次。
  if position('is_admin' in v_messages) > 0 then
    raise exception '自检：messages_conversation_scope 又出现了 is_admin（跨租户读回来了）';
  end if;
  if position('is_admin' in v_reads) > 0 then
    raise exception '自检：conversations_read 又出现了 is_admin';
  end if;

  -- 旧策略名不能残留，否则两条策略并存、等于没收窄。
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_teacher_read') then
    raise exception '自检：旧的 conversations_teacher_read 仍在（与 conversations_read 并存）';
  end if;

  -- 策略以 anon 身份求值，函数没有 anon 的 EXECUTE 就是整张表 42501。
  if not has_function_privilege('anon', 'public.can_read_conversation(uuid)', 'execute') then
    raise exception '自检：can_read_conversation 对 anon 不可执行 —— 会话读会整片 42501';
  end if;

  -- 检索 RPC 里那份抄写不能留。
  if position('is_admin' in (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = 'match_document_chunks' limit 1)) > 0 then
    raise exception '自检：match_document_chunks 里仍有 is_admin';
  end if;

  raise notice '会话读权限已收口：父表与子表读同一份定义，org_admin 不再跨公司读消息';
end $$;
