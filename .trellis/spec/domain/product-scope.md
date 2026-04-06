# Product Scope

> This file is the Trellis-aligned summary of the current PRD direction.
> It is intentionally shorter than the decision draft in `/docs`, but it should never contradict it.

## Product Identity

- The product is a school-facing AI workbench for classical poetry and classical Chinese learning.
- It is not a course-platform-first product.
- It is not a generic chat application.
- It is not a generic LMS shell.

The product has three primary surfaces:

- Student
- Teacher
- Admin

It also has a fourth responsibility behind the scenes:

- Data factory for future post-training and reward-oriented model improvement

## Product Development Approach

The project should evolve by module-level reuse, not by adopting a full external shell.

Rules:

- Reuse strong external modules when they materially improve quality or speed
- Prefer borrowing page skeletons, panel layouts, state expressions, and interaction patterns
- Allow targeted fork-and-modify for small frontend modules when the result will be reshaped into the product's own language
- Do not adopt a complete external product identity for student, teacher, or admin
- Do not let borrowed modules pull the product back toward LMS-first or generic-chat-first positioning

This means:

- Student should feel like a poetry learning workbench
- Teacher should feel like an intervention and review workbench
- Admin should feel like a governance and operations console

Not like:

- A generic AI chat platform
- A course catalog or LMS shell
- A stitched-together collection of unrelated open-source screens

## Core Business Axis

The core product axis is Bloom cognitive level progression.

The system revolves around:

1. Identifying whether a user input belongs to normal chat or a poem project
2. Maintaining a per-student, per-poem learning context
3. Showing and updating Bloom cognitive level
4. Letting students challenge upward
5. Letting teachers review, correct, and override
6. Letting admins audit and govern the whole system
7. Capturing reward-bearing events for future training

## Student Scope

Student home is a question-first workbench.

Student information architecture:

- Left side:
  - Normal chat
  - Poem projects
- Right side:
  - Main conversation area

Rules:

- Non-poetry content goes to normal chat
- Poetry-related content goes to poem projects
- A poem project is anchored by the poem itself
- Student poem project items show:
  - Poem title
  - Current Bloom level
  - Recommended Bloom level
- Project top bar shows:
  - Project title
  - Current Bloom level
  - Recommended Bloom level
  - Challenge entry

Student capabilities:

- Ask questions
- Upload files
- Use web search
- View current and recommended Bloom level
- Start a challenge
- Receive teacher feedback
- Export a single poem project

Student design and reuse direction:

- Prefer workbench-style layouts over chat-only layouts
- Borrow module patterns from strong AI learning and RAG products
- It is acceptable to fork small UI modules such as resource docks, citation cards, upload states, or side panels and then rewrite them into the current product style
- Do not import a full third-party homepage, workspace shell, or model-platform identity

Out of scope for the student surface:

- School-level management
- System settings
- Full audit views

## Teacher Scope

Teacher home is also a question-first workbench, but for teaching and intervention.

Teacher information architecture:

- School-wide / class learning-status
- Normal chat
- My poem projects
- Student poem projects

Teacher responsibilities:

- Ask and prepare content in teacher-owned poem projects
- Review school-wide and class-level learning status
- Review student poem projects
- Write comments
- Write review conclusions
- Correct AI answers
- Adjust Bloom levels
- Process challenge-review queue items
- View student learning trajectory
- Export student-level and teacher-level summaries

Teacher work queues:

- New activity
- Action required

Teacher design and reuse direction:

- Prefer review queues, split-pane detail views, and intervention-first layouts
- Borrow workflow and information architecture from assessment and educator products
- Rebuild teacher pages in the project's own frontend system instead of dragging in a third-party course shell

Teacher can view:

- Their own chats and projects
- School-wide and class-level learning-status views
- Student poem projects across the school scope granted to the teacher role

Teacher cannot view:

- Student normal chat
- Global system configuration
- Full admin audit scope

## Admin Scope

Admin is the highest-privilege school-level role.

Admin home is a school dashboard, not a technical control panel.

Admin responsibilities:

- View school-wide Bloom distribution and changes
- Filter by teacher
- Audit teacher and student activity
- Inspect reward-bearing events
- Govern settings, model switches, skills, and MCP
- Run data production and labeling workflows
- Export reports, audit data, and training datasets

Admin design and reuse direction:

- Prefer operations-console patterns for traces, capability control, and data-factory flows
- It is acceptable to fork small modules for trace views, registry tables, list-detail panes, and annotation work areas
- Admin may borrow more directly from strong open-source tooling than student or teacher, but still should not become a generic external platform shell

Admin can see:

- All chats
- All poem projects
- Audit records
- Think records for audit purposes

Admin cannot:

- Directly edit teacher or student chat content

## Normal Chat Vs Poem Project

These are distinct objects.

Normal chat:

- General-purpose
- Title auto-summarized from chat content
- Has its own archive/history lifecycle

Poem project:

- Anchored to a poem
- Owns Bloom level, challenge history, student files, teacher intervention, and export record

## Challenge Scope

Challenge is not a side feature.
It is the main upgrade path for Bloom progression.

Rules:

- Student can actively launch a challenge
- The system generates challenge prompts from current level, recommended level, and grade-related signals
- Challenges happen inline in the conversation flow
- System can upgrade immediately
- Teacher can later confirm or override

## Audit And Data Factory Scope

The system must preserve a clear audit chain for:

- Original user request
- Original AI answer
- Teacher correction
- Review conclusion
- Bloom overrides
- Challenge outcomes
- Think traces for audit

The system is also a data factory.

It must support:

- Sample typing
- Reward labeling
- Review state management
- JSONL export
- Filtering by teacher confirmation

## Explicit Out-Of-Scope Product Directions

The following directions are intentionally excluded from the active product scope:

- LearnHouse-style course catalog shell
- LMS-first navigation
- Generic multi-tool AI platform positioning
- Template-heavy marketing or demo-course experience
- Bloated educational dashboards with long explanatory copy
- Full-page or full-product cloning of external open-source products
