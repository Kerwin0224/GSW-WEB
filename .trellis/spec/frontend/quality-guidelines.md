# Quality Guidelines

> Quality gate for the Next.js + Tailwind CSS + shadcn/ui + AI SDK frontend.

---

## Scenario: UI/UX Implementation Quality Gate

### 1. Scope / Trigger

- Trigger: any implementation change in `frontend-new/**`, especially role pages, shared components, AI chat, provider/admin surfaces, or state components.

### 2. Signatures

Required commands:

```bash
cd frontend-new
npm run lint
npm run build
```

Forbidden-pattern grep:

```bash
grep -R "NEXT_PUBLIC_API_BASE_URL\|FastAPI\|SQLite\|Chroma\|To get started\|Deploy Now\|tool-invocation\|message\.content" -n src
```

### 3. Contracts

- `npm run lint` must pass before claiming UI completion.
- `npm run build` must pass; this covers TypeScript and Next.js route compilation.
- No Next.js scaffold copy, old FastAPI API client, SQLite/Chroma UI dependency, legacy AI SDK `message.content`, or `tool-invocation` rendering pattern may remain in `frontend-new/src`.
- Every primary page must expose empty/loading/error/blocked/permission/success/streaming state where applicable.
- Provider secrets are never shown in full; only password inputs or masked values.
- UI must be honest: no mock-success operational rows, no canned AI answers, no fake Bloom labels.

### 4. Validation & Error Matrix

| Failure | Required action |
| --- | --- |
| lint fails | fix before handoff |
| build fails | fix TypeScript/route errors before handoff |
| forbidden grep hit | inspect; remove or document safe mention if in copy explaining forbidden fallback |
| page lacks required state | add shared state surface |
| message renderer uses `message.content` | convert to `message.parts` renderer |
| secret visible in UI | replace with masked/password-only surface |

### 5. Good/Base/Bad Cases

- Good: final evidence includes lint/build output and grep no-hit for forbidden runtime patterns.
- Good: build route summary includes all role pages and student project detail.
- Base: no unit test script exists; report not-tested gap, but lint/build still required.
- Bad: claiming completion based only on visual inspection.
- Bad: hiding build failures because pages are “just UI”.

### 6. Tests Required

- Required every UI implementation pass: `npm run lint`, `npm run build`.
- Required grep/static checks for forbidden legacy/scaffold patterns.
- Manual or automated smoke should inspect role routes when browser tooling is available.
- If a test script is added later, run it before build handoff.

### 7. Wrong vs Correct

#### Wrong

```text
Looks done; I did not run build because it is only UI.
```

#### Correct

```text
Validated:
- npm run lint ✅
- npm run build ✅
- forbidden legacy/scaffold grep ✅ no runtime hits
```

---

## Scenario: No-Fallback Code Review Checklist

### 1. Scope / Trigger

- Trigger: reviewing student, teacher, admin, AI, provider, audit, export, or project UI.

### 2. Signatures

```ts
type ReviewFinding = {
  file: string;
  issue: string;
  requiredFix: string;
};
```

### 3. Contracts

Reviewers must check:

- No scaffold content.
- No old backend dependency for new surfaces.
- No demo operational records.
- No hardcoded fake Bloom classification.
- No provider/model fallback.
- No unverified role fallback.
- No full secret display.
- All state surfaces are role-appropriate and actionable.

### 4. Validation & Error Matrix

| Finding | Severity |
| --- | --- |
| old API fallback | blocking |
| canned AI answer | blocking |
| fake Bloom on live message | blocking |
| missing blocked state for provider | blocking |
| generic empty copy | fix before final unless trivial |
| minor spacing issue | non-blocking if lint/build pass |

### 5. Good/Base/Bad Cases

- Good: login refuses unknown role instead of routing to `/student`.
- Good: student chat shows pending Bloom status until real classification exists.
- Good: admin provider page says real configuration is required.
- Bad: `roleHome[data.role] || '/student'`.
- Bad: `BloomBadge level={2}` on every user message.

### 6. Tests Required

- Grep/static check for known bad patterns.
- Manual code review for user-facing fallback copy.

### 7. Wrong vs Correct

#### Wrong

```ts
window.location.href = roleHome[data.role] || '/student';
```

#### Correct

```ts
if (!data.role || !(data.role in roleHome)) {
  setError('账号缺少有效角色，请联系管理员完成资料配置。');
  return;
}
window.location.href = roleHome[data.role];
```
