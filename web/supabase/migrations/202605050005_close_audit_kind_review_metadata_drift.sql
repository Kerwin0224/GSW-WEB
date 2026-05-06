begin;

delete from public.audit_records
where kind::text = 'review_metadata';

delete from public.export_batches
where export_type::text = 'review_metadata';

alter type public.audit_kind rename to audit_kind_old;
create type public.audit_kind as enum ('sft', 'dpo');

alter table public.audit_records
  alter column kind type public.audit_kind
  using kind::text::public.audit_kind;

alter table public.export_batches
  alter column export_type type public.audit_kind
  using export_type::text::public.audit_kind;

drop type public.audit_kind_old;

notify pgrst, 'reload schema';
commit;
