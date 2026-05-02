# UI/UX Guidelines

> Product interaction and visual design contracts for 文韵智途, the Classical Chinese AI Workbench.

---

## Scenario: UI/UX-First Next.js + shadcn Refactor

### 1. Scope / Trigger

- Trigger: any route, layout, navigation, page, state component, or design-system component in the Next.js + Tailwind CSS + shadcn/ui refactor.
- Applies to `web/src/app/**`, `web/src/components/**`, `web/src/lib/**`, and any future UI package replacing the legacy `frontend/` surface.
- This is a product contract: UI/UX quality is required before feature implementation is considered complete.

### 2. Signatures

Role routes:

```text
/login
/auth/callback
/student/**
/teacher/**
/admin/**
```

Workspace role and navigation types:

```ts
type WorkspaceRole = 'student' | 'teacher' | 'admin';

type NavItem = {
  label: string;
  href: string;
  icon?: React.ComponentType;
  description: string;
  requiredRole: WorkspaceRole;
};
```

Design-token contract:

```css
:root {
  --background: <rice-paper>;
  --foreground: <ink>;
  --primary: <dai-blue>;
  --destructive: <cinnabar>;
  --accent: <zijin-gold>;
  --bloom-1: <memory>;
  --bloom-2: <understand>;
  --bloom-3: <apply>;
  --bloom-4: <analyze>;
  --bloom-5: <evaluate>;
  --bloom-6: <create>;
  --radius: 0.75rem;
}
```

### 3. Contracts

First-principles product contract:

- The product is a school-facing AI education workbench, not a generic chatbot and not a broad LMS shell.
- The core object is `role -> workspace -> task -> educational artifact`.
- AI output is visible, inspectable, and reviewable; it is not hidden magic.
- No fallback means no fake success: missing provider, Supabase, profile, or permission must produce an actionable blocked state.

Role workspace contracts:

- Student workspace focuses on ask, poem/text projects, Bloom guidance, and practice.
- Teacher workspace focuses on prompt-preset teaching ask, class/student scope, and SFT/DPO audit.
- Admin workspace focuses on users/classes, provider/MCP capability configuration, prompt preset governance, and audited export.
- Navigation must be role-filtered before render. Never show cross-role actions as disabled decoration.
- Layout must be stable across loading, streaming, error, and empty states.

Design-system contracts:

- Use shadcn/ui primitives as project-owned components, composed into product components.
- Use Tailwind utilities plus CSS variables; do not scatter hardcoded brand colors through pages.
- Bloom colors are never the only signal. Always show level number + Chinese label + accessible description.
- Chinese labels are required for student-facing Bloom and learning guidance.
- Use calm academic visual language: rice-paper background, ink text, Dai blue primary, cinnabar warning/emphasis, Zijin achievement accent.

### 4. Validation & Error Matrix

| Condition | UI behavior | Assertion |
| --- | --- | --- |
| User not authenticated | redirect to `/login` or show login-required state | no workspace data rendered |
| Authenticated user lacks profile/role | show setup error with admin contact/setup CTA | no guessed role routing |
| Role tries another role route | permission-denied or redirect | no cross-role navigation leak |
| Supabase unavailable/misconfigured | blocked state names Supabase/auth issue | no mock data shown |
| AI provider missing | AI actions disabled with admin provider CTA | no canned AI response |
| Student has no projects | ask-first empty state | one primary CTA to ask |
| Bloom classification pending | pending badge/state | no hardcoded fake level |
| Bloom classification failed | unclassified state with retry/investigate path | message remains visible |
| Teacher has no audit records | empty queue explaining eligible source records | no demo records |
| Audit form invalid | field-level validation and summary | no approved status written |
| Admin has no providers | setup checklist + provider CTA | student/teacher AI blocked |
| CSV/import rows invalid | row-level preview errors | no commit until valid/confirmed |
| AI stream in progress | live streaming indicator; duplicate submit guarded | layout does not jump |

### 5. Good/Base/Bad Cases

- Good: admin first sees a setup checklist showing provider, users/classes, presets, MCP, and export readiness.
- Good: student ask page has prompt suggestions, AI streaming state, Bloom/project pending states, and no fake badges.
- Good: project detail shows poem/text context, question history, Bloom ladder, practice records, and next learning action.
- Good: teacher audit queue is class-scoped and lets the teacher inspect source conversation before SFT/DPO labeling.
- Base: empty pages explain why they are empty and show the next valid action.
- Bad: one generic dashboard with mixed student/teacher/admin modules.
- Bad: demo arrays or scaffold content presented as product state.
- Bad: route pages rely on old FastAPI/SQLite/Chroma data paths for new MVP surfaces.

### 6. Tests Required

- Route smoke: each role can only reach its own workspace routes.
- Component smoke: empty/loading/error/blocked states render for student ask/project, teacher audit, and admin setup/provider pages.
- Accessibility: login, chat composer, preset selector, audit forms, dialogs, and admin tables have labels and keyboard paths.
- AI UI: streaming state disables duplicate submit and renders `message.parts` safely.
- Visual state: all six Bloom levels render with label, number, and non-color semantic text.
- No-fallback static check: no new UI page imports legacy FastAPI API client or renders demo/mock records as real operational data.

### 7. Wrong vs Correct

#### Wrong

```tsx
<nav>
  <a href="/admin/providers">Provider Config</a>
  <a href="/teacher/audit">Audit</a>
  <a href="/student">Ask</a>
</nav>
```

#### Correct

```tsx
function WorkspaceNav({ role, items }: { role: WorkspaceRole; items: NavItem[] }) {
  return (
    <nav aria-label={`${role} workspace navigation`}>
      {items
        .filter(item => item.requiredRole === role)
        .map(item => (
          <a key={item.href} href={item.href} aria-label={item.description}>
            {item.label}
          </a>
        ))}
    </nav>
  );
}
```

---

## Scenario: Role Information Architecture

### 1. Scope / Trigger

- Trigger: route creation, sidebar/breadcrumb changes, or page-level navigation for protected workspaces.

### 2. Signatures

Required user-facing IA:

```text
Public/auth
  /                 product entry or redirect
  /login            school-managed account login
  /auth/callback    Supabase callback

Student
  /student                      ask workspace
  /student/projects             project grid/list
  /student/projects/[projectId] project detail
  /student/challenge            practice/challenge entry
  /student/me                   learning profile

Teacher
  /teacher                      preset-first teaching ask
  /teacher/audit                audit queue
  /teacher/audit/[recordId]     audit detail
  /teacher/analytics            class/student summaries

Admin
  /admin                        setup/users dashboard
  /admin/classes                class membership and teacher assignment
  /admin/providers              model provider capabilities
  /admin/mcp                    MCP capabilities
  /admin/presets                prompt preset governance
  /admin/exports                audited dataset export
```

---

## Scenario: Public Entry Product Promise

### 1. Scope / Trigger

- Trigger: `/`, `/login`, or any unauthenticated public entry page.
- Applies before role-specific workspaces are visible.

### 2. Signatures

Public entry copy hierarchy:

```text
Primary promise: 学好古诗文，教好古诗文。
Student promise: 把古诗文真正读懂
Teacher promise: 把古诗文真正教好
Auth action: 开始学习或教学
```

### 3. Contracts

- The public entry is a product promise, not a system architecture dashboard.
- The unauthenticated user should understand exactly two main lines:
  - students come here to learn classical Chinese texts better;
  - teachers come here to teach classical Chinese texts better.
- Do not show admin governance, provider setup, MCP, audit/export, database, or internal capability language as homepage selling points.
- Keep operational no-fallback details in login errors and authenticated workspaces, not in the public hero.
- Root `/` may redirect to `/login` when unauthenticated; keep one public entry surface instead of duplicating marketing pages.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unauthenticated user opens `/login` | sees learning/teaching promise first |
| Unauthenticated user opens `/` | reaches the same public entry or login |
| Authenticated user opens `/` | redirects to verified role workspace |
| Missing role/profile on login | explicit blocked/error state; no fake success |
| Public copy mentions admin/provider/MCP/export as primary value | reject as too information-dense |

### 5. Good/Base/Bad Cases

- Good: “学好古诗文，教好古诗文。” plus one student card and one teacher card.
- Base: concise login card with school account fields and honest role verification copy.
- Bad: homepage card grid listing student, teacher, admin, provider, MCP, export, Bloom, audit, and Supabase before login.

### 6. Tests Required

- Browser/curl smoke confirms public entry includes the primary promise and student/teacher promise.
- Root unauthenticated redirect is verified when `/` no longer renders separate public content.
- Login form keeps visible labels, `autocomplete`, and `role="alert"` for errors.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Hero>
  <Card>管理员治理 Provider / MCP / 数据导出</Card>
  <Card>Bloom 审计与 SFT/DPO</Card>
</Hero>
```

#### Correct

```tsx
<Hero>
  <h1>学好古诗文，教好古诗文。</h1>
  <StudentPromise />
  <TeacherPromise />
</Hero>
```

### 3. Contracts

- Role identity must be visible in the shell.
- Sidebar items must use action-oriented labels, not internal database names.
- Breadcrumbs are required for nested detail surfaces.
- URLs must remain role-obvious even if route groups are used internally.
- Avoid course-platform shell language unless a page actually manages courses.

### 4. Validation & Error Matrix

| Condition | UI behavior |
| --- | --- |
| Route not yet implemented | do not link it, or show explicit not-ready state only in admin/dev contexts |
| Nested record missing | show not-found state with back-to-list CTA |
| Role cannot access record | show permission denied without leaking record content |

### 5. Good/Base/Bad Cases

- Good: `/teacher/audit/abc` clearly belongs to teacher audit and has breadcrumb `教师工作台 > 审计标注 > 记录`.
- Base: `/teacher/audit` master/detail without deep-link until backend is ready.
- Bad: `/dashboard` changes meaning by role without visible role identity.

### 6. Tests Required

- Route map snapshot or smoke test for protected route groups.
- Sidebar renders only current-role items.

### 7. Wrong vs Correct

#### Wrong

```ts
const nav = allNavItems;
```

#### Correct

```ts
const nav = allNavItems.filter(item => item.requiredRole === profile.role);
```

---

## Scenario: Bloom-Centered Student UX

### 1. Scope / Trigger

- Trigger: student ask, project detail, Bloom visualization, practice/challenge UI, or student learning profile.

### 2. Signatures

```ts
type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;

type BloomAnnotation = {
  level: BloomLevel;
  label: '记忆' | '理解' | '应用' | '分析' | '评价' | '创造';
  description: string;
  confidence?: number;
  status: 'pending' | 'classified' | 'failed';
};
```

### 3. Contracts

- Bloom level is learning guidance, not punishment or ranking.
- Student-facing labels must be Chinese.
- Project cards show poem/text title, author/source where available, recent activity, question count, highest Bloom level, and practice progress.
- Project detail connects questions and practice records to Bloom progression.
- Practice states target Bloom level and explains what the student is practicing.
- Pending and failed classification states must preserve the original message.

### 4. Validation & Error Matrix

| Condition | UI behavior |
| --- | --- |
| Bloom annotation pending | subtle pending badge (`待标注`) |
| Bloom annotation failed | `未分类` state; no layout break |
| Project classification pending | temporary conversation state |
| Project classification failed | keep chat visible; offer manual/project retry path |
| Practice evaluation failed | preserve answer and show retry/feedback |
| No projects | ask-first empty state |

### 5. Good/Base/Bad Cases

- Good: “当前练习目标：L4 分析” plus a short explanation such as “比较、分解、找关系”.
- Good: Bloom ladder uses label + level + tooltip, not color alone.
- Base: project list with highest-level badges and counts.
- Bad: hardcoded `L2 理解` badge on every user message.

### 6. Tests Required

- Render all six Bloom levels.
- Pending/failure annotation states do not break chat/project layout.
- Student practice preserves answer on failed evaluation.

### 7. Wrong vs Correct

#### Wrong

```tsx
<BloomBadge level={2} />
```

on every message before real classification exists.

#### Correct

```tsx
{annotation.status === 'classified' ? (
  <BloomBadge level={annotation.level} label={annotation.label} description={annotation.description} />
) : (
  <BloomStatusBadge status={annotation.status} />
)}
```

---

## Scenario: Teacher Ask And Audit UX

### 1. Scope / Trigger

- Trigger: teacher prompt-preset ask, class/student scope display, audit queues, SFT/DPO labeling, or teacher analytics.

### 2. Signatures

```ts
type PromptPresetSummary = {
  id: string;
  title: string;
  scenario: string;
  version: number;
  status: 'published' | 'disabled';
  variables: Array<{ name: string; required: boolean }>;
};

type AuditCandidateType = 'sft' | 'dpo';

type AuditStatus = 'eligible' | 'in_review' | 'approved' | 'rejected' | 'exported';
```

### 3. Contracts

- Teacher ask must be preset-first. Presets show scenario, version, and required variables.
- Teacher AI outputs must be inspectable and editable/copiable/savable where supported.
- Audit queue is class/student scoped.
- Audit detail must show source prompt, model answer, source metadata, and current audit status before labels are submitted.
- SFT and DPO forms must use explicit export-contract labels.
- Teacher cannot approve records with missing required fields.

### 4. Validation & Error Matrix

| Condition | UI behavior |
| --- | --- |
| No prompt presets enabled | blocked state asking admin to publish presets |
| Missing provider | blocked state asking admin to configure provider |
| No assigned classes | assignment-needed state |
| No audit records | empty queue with explanation of eligible records |
| SFT corrected answer required but empty | field error and no submit |
| DPO chosen/rejected missing | field error and no submit |
| Record already exported | read-only state unless admin creates new version |

### 5. Good/Base/Bad Cases

- Good: teacher selects “苏格拉底式引导 v3”, sees variables, asks, then saves output as a teaching artifact.
- Good: audit detail shows source conversation beside SFT/DPO annotation tabs.
- Base: audit queue table with status filters and detail panel.
- Bad: teacher labels a record without seeing the original AI response.

### 6. Tests Required

- Preset selector empty/loaded/disabled states.
- Audit form validation for SFT and DPO required fields.
- Permission smoke: teacher cannot inspect another teacher's class records.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Button>提交标注</Button>
```

without validation or source context.

#### Correct

```tsx
<AuditDetail sourceRecord={record}>
  <SftForm onSubmit={validateAndSubmitSft} />
  <DpoForm onSubmit={validateAndSubmitDpo} />
</AuditDetail>
```

---

## Scenario: Admin Setup And Governance UX

### 1. Scope / Trigger

- Trigger: admin home, user/class management, provider settings, MCP settings, prompt preset governance, dataset export.

### 2. Signatures

```ts
type ProviderCapability =
  | 'student_chat'
  | 'teacher_chat'
  | 'bloom_classification'
  | 'project_classification'
  | 'practice_generation'
  | 'practice_evaluation'
  | 'embedding';

type SetupStatus = 'ready' | 'missing' | 'invalid' | 'blocked';
```

### 3. Contracts

- Admin home is a setup/status console.
- Provider configuration is capability-based, not only raw provider rows.
- Secrets are server-only; after save, never display full API keys.
- MCP tools are disabled until explicitly configured and assigned to safe capabilities.
- Prompt presets use lifecycle: draft -> published -> disabled.
- Exports are generated only from audited/approved real records.

### 4. Validation & Error Matrix

| Condition | UI behavior |
| --- | --- |
| No users/classes | show create/import CTA |
| CSV invalid | row-level errors and no commit |
| Provider key missing | field error; provider remains unavailable |
| Provider saved | mask secret; show capability readiness |
| MCP server unavailable | show failed health/status, not enabled |
| No approved audit records | export disabled with explanation |
| Export requested | show type, filters, record count, and confirmation |

### 5. Good/Base/Bad Cases

- Good: admin sees “Student chat blocked: no provider assigned to `student_chat`”.
- Good: provider setup uses a capability matrix and health check status.
- Base: empty provider page clearly blocks AI actions until setup.
- Bad: storing/displaying API keys in client state after save.

### 6. Tests Required

- Setup checklist status rendering.
- Provider form validation and secret masking.
- Export button disabled when no approved records.
- Static check that service-role/provider secrets do not enter client components.

### 7. Wrong vs Correct

#### Wrong

```tsx
<Input value={provider.apiKey} />
```

#### Correct

```tsx
<SecretField maskedValue="••••••••" onReplace={replaceProviderSecret} />
```

---

## Scenario: AI Streaming UI States

### 1. Scope / Trigger

- Trigger: any UI that calls Vercel AI SDK chat/streaming routes or renders AI SDK `UIMessage` parts.

### 2. Signatures

```ts
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';

type AiUiState = 'idle' | 'submitted' | 'streaming' | 'error';
```

### 3. Contracts

- Render `message.parts`, not legacy `message.content`.
- Handle known part types explicitly and ignore unknown safe parts without crashing.
- Disable or guard duplicate submit during submitted/streaming states.
- Provide visible streaming status and `aria-live="polite"` for streamed content.
- Keep user input/history visible after errors.
- Tool/citation/retrieval parts must not leak private metadata.

### 4. Validation & Error Matrix

| Condition | UI behavior |
| --- | --- |
| Empty input | submit disabled |
| Streaming | submit disabled or cancel available |
| Route returns 401 | login-required state |
| Route returns provider config error | blocked provider state |
| Unknown message part | safe ignore or diagnostic in dev only |
| Tool result private metadata | never rendered client-side |

### 5. Good/Base/Bad Cases

- Good: AI message streams in a live region while the composer is guarded.
- Base: spinner/skeleton while awaiting first token.
- Bad: duplicate messages caused by repeated submit during streaming.

### 6. Tests Required

- Component test for text-only messages.
- Component test for unknown part type.
- Interaction test for duplicate-submit guard.
- Accessibility check for live region and error alert.

### 7. Wrong vs Correct

#### Wrong

```tsx
<div>{message.content}</div>
```

#### Correct

```tsx
<div aria-live="polite">
  {message.parts.map((part, index) => {
    switch (part.type) {
      case 'text':
        return <span key={index}>{part.text}</span>;
      default:
        return null;
    }
  })}
</div>
```

---

## Scenario: Accessibility And State Completeness

### 1. Scope / Trigger

- Trigger: any interactive component, form, modal/dialog/sheet, table, chat, or streaming state.

### 2. Signatures

State component props:

```ts
type EmptyStateProps = {
  title: string;
  description: string;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
};

type BlockedStateProps = {
  reason: string;
  resolution: string;
  action?: { label: string; href?: string };
};
```

### 3. Contracts

- Semantic HTML first; ARIA only enhances semantics.
- Each primary page must design empty, loading, error, permission-denied, validation-failure, and success states.
- Form controls need visible labels or deliberate `aria-label`.
- Error messages use `role="alert"`.
- Streaming updates use `aria-live="polite"`.
- Dialog and sheet focus management must rely on accessible primitives and be tested by keyboard.
- Core flows must work at desktop and tablet widths; login/student ask must not be broken on mobile.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Keyboard-only user | can login, ask, select preset, audit, configure provider |
| Screen reader user | hears errors and streaming status without duplicate spam |
| Color-blind user | Bloom level understandable from text, not color alone |
| Narrow viewport | content reflows; no inaccessible horizontal-only action path |

### 5. Good/Base/Bad Cases

- Good: empty admin provider page says what is missing and links to add provider.
- Good: audit form field errors are next to fields and summarized at submit.
- Base: skeleton loading preserves page structure.
- Bad: spinner-only full page with no status text.

### 6. Tests Required

- Automated lint/accessibility checks where available.
- Manual keyboard smoke for login, chat, audit, provider setup.
- Responsive smoke at mobile, tablet, desktop widths.

### 7. Wrong vs Correct

#### Wrong

```tsx
<div className="text-red-500">Error</div>
```

#### Correct

```tsx
<Alert variant="destructive" role="alert">
  <AlertDescription>{message}</AlertDescription>
</Alert>
```
