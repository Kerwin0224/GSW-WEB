# Build Login Page

## Goal

Use the login page as the front door for the demo.

The page should make student, teacher, and admin entry immediately understandable and presentable in review.

## Scope

- Present a strong login surface for the demo
- Show clear role switching for student, teacher, and admin
- Make route destinations explicit
- Keep demo-account affordances usable
- Expose account or import entry points only as part of the login-page review story

## Out Of Scope

- Real authentication enforcement
- External SSO integration
- Full account-management workflow depth

## Acceptance Criteria

- The page is strong enough to open the demo
- Role separation is visible before entering the app
- Demo login works without backend dependency
- The page reads as product entry, not generic admin login

## References

- `frontend/app/login/page.tsx`
- `frontend/app/accounts/page.tsx`
- `frontend/components/dashboard/AccountsWorkspace.tsx`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
