-- Apply only after the web application has switched to authenticate_school_account_v2.
revoke all on function public.authenticate_user(text) from public, anon, authenticated;
grant execute on function public.authenticate_user(text) to service_role;

revoke all on function public.authenticate_school_account(text, text) from public, anon, authenticated;
grant execute on function public.authenticate_school_account(text, text) to service_role;
