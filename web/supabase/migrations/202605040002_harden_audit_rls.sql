begin;

-- Tighten teacher audit writes so RLS matches the server-side class-membership guard.
drop policy if exists audit_app_teacher_insert on public.audit_records;
drop policy if exists audit_app_teacher_update on public.audit_records;

create policy audit_app_teacher_insert on public.audit_records
  for insert
  with check (
    public.is_admin()
    or (
      auditor_id = public.current_app_user_id()
      and class_id is not null
      and public.teacher_can_access_class(class_id)
    )
  );

create policy audit_app_teacher_update on public.audit_records
  for update
  using (
    public.is_admin()
    or (
      auditor_id = public.current_app_user_id()
      and class_id is not null
      and public.teacher_can_access_class(class_id)
    )
  )
  with check (
    public.is_admin()
    or (
      auditor_id = public.current_app_user_id()
      and class_id is not null
      and public.teacher_can_access_class(class_id)
    )
  );

notify pgrst, 'reload schema';
commit;
