# Build Student Poem Project And Bloom Page

## Goal

Build the core student poem-project page with:

- poem identity
- current Bloom level
- recommended Bloom level
- project history context

## Why This Task Exists

This is the main student learning page.

If this page is weak:

- Bloom progression looks decorative
- poem learning context feels unstable
- challenge and teacher review lose their anchor

## Scope

- Build or strengthen the poem-project page layout
- Show poem title and project identity clearly
- Show current and recommended Bloom state in the top-level page context
- Keep project history legible enough for demo review
- In frontend-demo mode, allow project state to be represented with mock data

## Out Of Scope

- Full challenge generation behavior
- Full teacher queue workflow

## Suggested Work Areas

- `frontend/components/dashboard/StudentWorkspace.tsx`
- `frontend/lib/types.ts`
- `frontend/lib/api.ts`

## Acceptance Criteria

- Poem project is visibly different from normal chat
- The page clearly shows poem title plus current and recommended Bloom level
- Project state feels durable rather than ad hoc
- The page can be reviewed as the core student learning surface

## References

- `docs/PRODUCT_SOURCE_OF_TRUTH.md`
- `docs/prd_decision_v1.md`
- `docs/demo_scope_v1.md`
- `.trellis/spec/domain/product-scope.md`
- `.trellis/spec/frontend/index.md`
