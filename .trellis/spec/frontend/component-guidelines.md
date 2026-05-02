# Component Guidelines

> Component contracts for the Next.js + Tailwind CSS + shadcn/ui refactor.

---

## Scenario: shadcn/ui-Owned Component System

### 1. Scope / Trigger

- Trigger: creating or modifying React components in `frontend-new/src/components/**` or route-local components in `frontend-new/src/app/**`.
- Applies to shadcn primitives, app shell components, workbench components, AI message renderers, forms, tables, dialogs, and state components.

### 2. Signatures

Directory signatures:

```text
frontend-new/src/components/ui/**          copied shadcn primitives
frontend-new/src/components/workbench/**   domain/product components
frontend-new/src/components/app-shell.tsx  protected workspace shell
frontend-new/src/components/app-sidebar.tsx role navigation
frontend-new/src/lib/utils.ts              cn/class utilities
```

Component prop signatures:

```ts
type ComponentProps = {
  className?: string;
};

type StatefulSurfaceProps = {
  empty?: React.ReactNode;
  loading?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
};
```

### 3. Contracts

- shadcn primitives under `components/ui` are project-owned. Modify them only to support global design-system needs, not page-specific hacks.
- Product/domain components belong under `components/workbench` or a feature subfolder; do not place product logic inside `components/ui`.
- Prefer Server Components by default. Add `'use client'` only for browser interactivity, hooks, state, event handlers, or AI SDK UI hooks.
- Components must accept `className` when they render a reusable visual primitive.
- Styling uses Tailwind utilities and design tokens from `globals.css`.
- Use `cn()` for conditional classes.
- Role-specific components must receive verified role/profile data from server-side boundaries when authorization matters.
- Every reusable component must support empty/loading/error/disabled states when it owns data or async behavior.

### 4. Validation & Error Matrix

| Condition | Required behavior | Assertion |
| --- | --- | --- |
| Component needs click/input/state | mark file `'use client'` | no client hooks in Server Component |
| Component only formats server data | keep Server Component | no unnecessary client bundle |
| Component wraps form control | visible label or `aria-label` | accessibility smoke passes |
| Reusable visual component | accepts `className` | callers can compose layout safely |
| Page-specific state added to `ui/` primitive | reject/refactor | primitives remain generic |
| Brand color needed | use CSS variable/Tailwind token | no scattered hardcoded brand colors |

### 5. Good/Base/Bad Cases

- Good: `BloomBadge` lives in `components/workbench`, uses `--bloom-*`, and shows level + label.
- Good: `AppSidebar` filters nav by role before rendering.
- Base: route-local component is kept near the page until reused.
- Bad: adding `studentId`/`teacherId` business logic inside `components/ui/table.tsx`.
- Bad: marking every component `'use client'` by default.

### 6. Tests Required

- Typecheck for component prop contracts.
- Component smoke for role nav, Bloom badge/ladder, empty/error/blocked states, and AI message rendering.
- Accessibility smoke for dialogs, forms, sidebar, tabs, tables, and chat composer.

### 7. Wrong vs Correct

#### Wrong

```tsx
// components/ui/button.tsx
export function Button({ studentLevel }: { studentLevel: number }) {
  return <button>L{studentLevel}</button>;
}
```

#### Correct

```tsx
// components/workbench/bloom-badge.tsx
export function BloomBadge({ level, label, className }: BloomBadgeProps) {
  return <Badge className={cn('font-heading', className)}>L{level} {label}</Badge>;
}
```

---

## Scenario: Shared State Components

### 1. Scope / Trigger

- Trigger: any page that needs empty, loading, error, permission-denied, blocked, or validation-summary UI.

### 2. Signatures

```ts
type EmptyStateProps = {
  title: string;
  description: string;
  icon?: React.ReactNode;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
};

type BlockedStateProps = {
  title: string;
  reason: string;
  resolution: string;
  action?: { label: string; href?: string };
};
```

### 3. Contracts

- Do not hand-roll different empty/error blocks on every page once shared state components exist.
- Empty state copy must say why the state exists and what the user can do next.
- Blocked states are mandatory for missing auth/profile/provider/Supabase/preset/class assignment.
- Error states use shadcn `Alert` with `role="alert"`.
- Loading states use `Skeleton` or layout-preserving placeholders.

### 4. Validation & Error Matrix

| Condition | UI behavior |
| --- | --- |
| No data | `EmptyState` with one primary next action |
| Missing setup/config | `BlockedState` with resolution path |
| Fetch/model error | `ErrorState` with retry when safe |
| Form validation errors | field-level errors plus summary for multi-field forms |

### 5. Good/Base/Bad Cases

- Good: admin provider page empty state links to add provider and explains AI actions are blocked.
- Base: simple empty table row with clear CTA.
- Bad: rendering demo rows to avoid an empty table.

### 6. Tests Required

- Each primary page renders its empty and blocked state in test fixtures/story smoke.

### 7. Wrong vs Correct

#### Wrong

```tsx
{rows.length === 0 ? <p>暂无数据</p> : <Table rows={rows} />}
```

#### Correct

```tsx
{rows.length === 0 ? (
  <EmptyState
    title="暂无审计记录"
    description="学生或教师产生真实 AI 互动后，符合条件的记录会进入审计队列。"
  />
) : (
  <AuditTable rows={rows} />
)}
```
