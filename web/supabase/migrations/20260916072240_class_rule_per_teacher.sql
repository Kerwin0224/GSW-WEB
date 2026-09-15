-- 归类规则改为「每师每班一条」。
--
-- 产品裁定（2026-09-16）：一个老师可以配多个班，一个班也可以有多位任课教师
-- （语文/数学/英语各一位）。上一条迁移把唯一性定成 (class_id)，等于「一个班只能有一条规则」，
-- 会把同班其他学科教师的规则顶掉——这是错的。
--
-- 本迁移只改唯一性口径，不动其他结构。

-- 一个班的每条教师规则独立：唯一键加上作者维度。
drop index if exists "prompt_presets_class_rule_key";

create unique index if not exists "prompt_presets_class_rule_key"
  on public.prompt_presets (class_id, created_by)
  where purpose = 'project_classification' and status = 'published';

-- 归类规则必须有作者：否则 created_by 为 NULL 时可以绕过上面的唯一索引无限插。
alter table public.prompt_presets
  drop constraint if exists "prompt_presets_class_rule_author_check";
alter table public.prompt_presets
  add constraint "prompt_presets_class_rule_author_check"
  check (purpose <> 'project_classification' or created_by is not null);

do $$
begin
  raise notice 'prompt_presets: 归类规则唯一性已改为 (class_id, created_by)';
end $$;
