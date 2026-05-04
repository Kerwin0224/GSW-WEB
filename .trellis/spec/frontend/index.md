# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory contains guidelines for frontend development. Fill in each file with your project's specific conventions.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | `web` App Router ownership, route/component/lib layout, no legacy API dependency | Active |
| [Component Guidelines](./component-guidelines.md) | shadcn/ui ownership, component composition, state components, accessibility | Active |
| [Hook Guidelines](./hook-guidelines.md) | Client hook boundaries, AI SDK `useChat`, SSR-safe responsive hooks, data hook state contracts | Active |
| [State Management](./state-management.md) | Explicit empty/loading/error/blocked/permission/success/streaming states and state boundaries | Active |
| [Quality Guidelines](./quality-guidelines.md) | Lint/build gate, forbidden legacy/scaffold patterns, no-fallback review checklist | Active |
| [Type Safety](./type-safety.md) | Zod, Supabase generated types, AI SDK UIMessage parts, no-fallback typed states | Active |
| [Next.js AI SDK Guidelines](./next-ai-sdk-guidelines.md) | App Router route handlers, AI SDK streaming/tools, frontend AI boundaries | Active |
| [Design Tokens](./design-tokens.md) | Tailwind v4 + shadcn CSS variable contract, Bloom six-color tokens, fonts, radius, shadows, dark mode | Active |
| [UI/UX Guidelines](./ui-ux-guidelines.md) | UI/UX-first role workspaces, shadcn design system, AI states, Bloom, accessibility, no-fallback UX | Active |
| [Student Workspace](./student-workspace.md) | Student three-pane chat, Bloom realtime guidance, project cards, profile radar, challenge route contracts | Active |
| [Admin Workspace](./admin-workspace.md) | Three-question admin cockpit, provider capability broken-link alerts, secret lifecycle, log explorer, CSV import, export preview | Active |
| [Teacher Workspace](./teacher-workspace.md) | Teacher three-pane audit, SFT/DPO form contracts, prompt preset editor, actionable analytics, and audit status chips | Active |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
