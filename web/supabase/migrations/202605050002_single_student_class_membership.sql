begin;

create unique index if not exists class_memberships_one_student_class_idx
  on public.class_memberships (profile_id)
  where role = 'student'::public.app_role;

notify pgrst, 'reload schema';
commit;
