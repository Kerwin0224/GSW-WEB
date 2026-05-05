# Research: Next.js 16 App Router 真实能力和约定

- **Query**: 验证 PRD 中的 Next.js 16 App Router 架构设计是否符合最佳实践
- **Scope**: Internal (PRD + spec files) + External (Next.js documentation needed)
- **Date**: 2026-05-03

---

## Executive Summary

**Critical Finding**: The project spec references `proxy.ts` as a Next.js 16 feature that "replaced middleware", but this claim requires verification against official Next.js documentation. The PRD uses standard `middleware.ts`, which conflicts with the spec's `proxy.ts` guidance.

---

## Findings

### 1. PRD Architecture (Section 5.2 & 5.3)

#### Directory Structure Claims

The PRD (lines 494-677) proposes this Next.js App Router structure:

```
src/
  app/
    layout.tsx                # Root layout
    page.tsx                  # Home page
    globals.css               # Tailwind + shadcn theme
    (auth)/                   # Route group for auth
      login/page.tsx
      layout.tsx
    (student)/                # Route group for student
      layout.tsx
      chat/page.tsx
      chat/[id]/page.tsx
      cognitive-path/[projectId]/page.tsx
      challenge/[projectId]/page.tsx
      profile/page.tsx
    (teacher)/                # Route group for teacher
      layout.tsx
      audit/page.tsx
      dashboard/page.tsx
      instructions/page.tsx
    (admin)/                  # Route group for admin
      layout.tsx
      providers/page.tsx
      mcp/page.tsx
      users/page.tsx
      datasets/page.tsx
    api/                      # API Routes
      chat/route.ts
      challenge/generate/route.ts
      challenge/evaluate/route.ts
      audit/route.ts
      admin/providers/route.ts
      admin/datasets/route.ts
      webhooks/supabase/route.ts
```

**Conventions Used**:
- Route groups: `(auth)`, `(student)`, `(teacher)`, `(admin)`
- File conventions: `layout.tsx`, `page.tsx`
- API routes: `route.ts`
- Dynamic routes: `[id]`, `[projectId]`

#### Architecture Diagram Claims (Section 5.3, lines 692-746)

The PRD's Mermaid diagram shows:

1. **Server Components**: Layouts + Suspense, Pages (default Server)
2. **Client Components**: ChatUI, CognitivePath, Challenge
3. **API Routes**: `/api/chat` using `streamText()`, `/api/challenge`, `/api/audit`, `/api/admin`
4. **Middleware**: Supabase Auth Session refresh + Role checking for route group protection

**Key Claims**:
- "Server Component 优先：默认使用 Server Component，仅在需要交互时添加 'use client'" (line 686)
- Middleware handles session refresh and role-based route protection (lines 717-720)

#### Middleware Implementation (PRD lines 973-1045)

```typescript
// middleware.ts - 项目根目录
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // ... session refresh logic
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

---

### 2. Spec File Guidance (`.trellis/spec/frontend/directory-structure.md`)

#### Conflicting Guidance: `proxy.ts` vs `middleware.ts`

**Lines 111-112**:
> "Applies to Next.js 16 `proxy.ts` in `web`; use the local Next docs before editing because **proxy replaced middleware in this version**."

**Lines 119-127** show `proxy.ts` signature:
```typescript
// web/src/proxy.ts
export default async function proxy(request: NextRequest) {
  // auth and redirect logic
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
};
```

**Critical Discrepancy**:
- PRD uses `middleware.ts` in project root
- Spec claims `proxy.ts` replaced middleware in Next.js 16
- Spec places it at `web/src/proxy.ts` (inside src directory)

---

### 3. Verification Needed Against Official Next.js Documentation

#### Questions Requiring Official Docs:

1. **Does Next.js 16 have a `proxy.ts` convention that replaced `middleware.ts`?**
   - Status: **UNVERIFIED** - No official documentation accessed yet
   - Risk: High - This is a fundamental routing/auth boundary pattern

2. **Server Components vs Client Components boundary rules**
   - PRD claims: "默认使用 Server Component，仅在需要交互时添加 'use client'"
   - Status: **NEEDS VERIFICATION** - Standard pattern but needs confirmation for Next.js 16

3. **API Routes convention: `route.ts`**
   - PRD uses: `/api/chat/route.ts`, `/api/challenge/generate/route.ts`
   - Status: **LIKELY CORRECT** - Standard App Router pattern, but needs confirmation

4. **File conventions: `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`**
   - PRD uses: `layout.tsx`, `page.tsx`
   - PRD does NOT use: `loading.tsx`, `error.tsx` (mentioned in task requirements)
   - Status: **INCOMPLETE** - PRD missing loading/error boundaries

5. **Data fetching in Server Components: async/await**
   - PRD implies this (line 686: "Server Component 优先")
   - Status: **NEEDS VERIFICATION** - Need to confirm async Server Component pattern

6. **Streaming with Suspense**
   - PRD mentions: "Layouts + Suspense" (line 700)
   - Status: **NEEDS VERIFICATION** - Need to confirm Suspense boundaries and streaming patterns

7. **Middleware capabilities and limitations**
   - PRD uses middleware for: session refresh + role checking
   - Status: **NEEDS VERIFICATION** - Need to confirm what middleware can/cannot do in Next.js 16

---

### 4. Code Patterns Found in Spec

#### Good Pattern: Matcher Configuration

```typescript
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)'],
};
```

**Contracts** (from spec lines 144-149):
- Must exclude: `api`, `_next/static`, `_next/image`, favicon, metadata files, file-extension assets
- Must be named `config` (not `proxyConfig` or other names)
- Wrong export name causes static assets to redirect to login HTML

#### Good Pattern: Public Route Allowlist

```typescript
const publicPaths = ['/login', '/auth/callback', '/api/auth'];
```

#### Good Pattern: Supabase SSR Session Check

```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user && !isPublic(pathname)) redirect('/login');
```

---

### 5. Missing Patterns in PRD

Based on task requirements, the PRD should address but doesn't:

1. **`loading.tsx`**: No loading states defined in directory structure
2. **`error.tsx`**: No error boundaries defined in directory structure
3. **Streaming patterns**: Mentioned in architecture diagram but no implementation details
4. **Suspense boundaries**: Where to place `<Suspense>` components?

---

## Caveats / Not Found

### Cannot Verify Without Official Docs:

1. **`proxy.ts` vs `middleware.ts`**: This is the most critical finding. The spec claims proxy replaced middleware in Next.js 16, but:
   - No official Next.js documentation accessed
   - PRD uses `middleware.ts`, spec uses `proxy.ts`
   - Placement differs: root vs `src/`

2. **Next.js 16 specific features**: Cannot confirm if patterns are Next.js 16-specific or general App Router patterns

3. **Middleware limitations**: Cannot verify what middleware can/cannot do (e.g., can it access database? can it modify response body?)

4. **Streaming implementation**: PRD mentions streaming but lacks implementation details

### Internal Consistency Issues:

1. **PRD vs Spec conflict**: `middleware.ts` (PRD) vs `proxy.ts` (spec)
2. **Missing file conventions**: No `loading.tsx` or `error.tsx` in PRD structure
3. **Incomplete Suspense guidance**: Mentioned but not detailed

---

## Next Steps Required

To complete this research, need to:

1. **Access Next.js 16 official documentation** via MCP tools:
   - Search for "Next.js 16 middleware"
   - Search for "Next.js 16 proxy.ts" (verify if this exists)
   - Search for "Next.js 16 App Router file conventions"
   - Search for "Next.js 16 Server Components data fetching"
   - Search for "Next.js 16 Suspense streaming"

2. **Resolve `proxy.ts` vs `middleware.ts` conflict**:
   - If `proxy.ts` doesn't exist in Next.js 16, spec needs correction
   - If it does exist, PRD needs update

3. **Add missing file conventions to PRD**:
   - `loading.tsx` for loading states
   - `error.tsx` for error boundaries
   - Suspense boundary placement guidance

4. **Verify AI SDK integration patterns**:
   - Confirm `streamText()` usage in route handlers
   - Verify `useChat` hook patterns in Client Components

---

## References

### Internal Files Analyzed:

- `/Users/kerwin/Desktop/classical-chinese-workbench/PRD.md` (lines 466-1045)
- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/frontend/directory-structure.md`
- `/Users/kerwin/Desktop/classical-chinese-workbench/.trellis/spec/frontend/index.md`

### External References Needed:

- Next.js 16 official documentation: https://nextjs.org/docs
- Vercel AI SDK v6 documentation: https://sdk.vercel.ai/docs
- Supabase SSR documentation: https://supabase.com/docs/guides/auth/server-side

---

## Conclusion

**Status**: Research incomplete - requires external documentation access.

**Key Finding**: Critical architectural conflict between PRD (`middleware.ts`) and spec (`proxy.ts`) that must be resolved before implementation.

**Recommendation**: Use MCP tools to access Next.js 16 official documentation and verify:
1. Whether `proxy.ts` exists as a Next.js 16 convention
2. Standard file conventions (`layout`, `page`, `loading`, `error`)
3. Middleware capabilities and limitations
4. Server Component async/await patterns
5. Suspense and streaming best practices
