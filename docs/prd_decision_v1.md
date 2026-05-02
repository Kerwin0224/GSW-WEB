# PRD Decision Draft v2

This file is the stable ASCII-named working version of the current PRD decision draft.
It replaces the earlier Bloom-first scope with a narrower four-module product scope.

## Product Identity

- The product is a school-facing AI workbench for classical poetry and classical Chinese learning.
- The current build must be constrained to four modules:
  - login
  - student
  - teacher
  - admin
- It is not a course-platform-first product.
- It is not a generic chat application.
- It is not a broad LMS shell.
- The system is both:
  - a student asking and practice workbench
  - a teacher asking and audit workbench
  - an admin governance and model-configuration console
  - a data factory for DPO and SFT dataset production

## Current Module Boundary

### 1. Login Module

The login module owns identity entry and role routing.

Required responsibilities:

- Support role-aware login for student, teacher, and admin.
- Route each role to its own workspace after login.
- Preserve clear role boundaries in frontend navigation and backend authorization.
- Use school-managed accounts rather than open self-registration for the current scope.

Out of scope for the current spec:

- Public signup.
- Social login.
- Marketplace or multi-tenant commercial onboarding.

### 2. Student Module

The student module only needs two functions in the current scope:

- `ask`
- `practice`

Student ask:

- A student asks questions about classical poetry or classical Chinese text.
- After a student asks a question, the system automatically files it under a project.
- The project level is anchored by the poem or text title.
- One project can contain multiple questions.
- If a matching poem/text-title project already exists for the student, the new question is added under that project.
- If no matching project exists, the system creates one.

Student practice:

- Practice is the student-facing exercise flow for the current poem/text project.
- Practice should use the project context accumulated from prior questions.
- Practice results should be stored under the same poem/text project where they belong.

Student scope rules:

- Student does not manage users, classes, providers, MCP, audit exports, or teacher data.
- Student does not need broad learning dashboards in the current scope.
- Student project structure is `student -> poem/text project -> questions/practice records`.

### 3. Teacher Module

The teacher module only needs two functions in the current scope:

- `ask`
- `audit`

Teacher ask:

- A teacher can interact with the LLM for preparation, explanation, review assistance, and teaching support.
- Teacher questions belong to the teacher workspace, not to a student project unless explicitly attached by later product work.

Teacher audit:

- Audit exists to produce usable DPO and SFT data.
- Teacher audit reviews student/LLM interaction records and teacher/LLM interaction records when they are eligible for data production.
- Audit should preserve:
  - original prompt
  - original model answer
  - teacher judgment
  - corrected or preferred answer when present
  - dataset type: DPO or SFT
  - audit status
  - source metadata

Teacher relationship model:

- One teacher can own multiple classes.
- One class can contain multiple students.
- A teacher audits data within the classes and students assigned to that teacher unless admin policy expands access.

### 4. Admin Module

The admin module owns governance, configuration, and export.

Admin user management:

- Manage teacher accounts.
- Manage student accounts.
- Manage class membership.
- Assign one teacher to multiple classes.
- Assign multiple students to one class.

Admin provider and MCP configuration:

- Configure model providers.
- Configure provider credentials and endpoints where applicable.
- Configure default provider/model selection.
- Configure MCP servers and capability availability.
- These settings are admin-only and must not leak into student or teacher workspaces.

Admin audit export:

- Export teacher-audited DPO data.
- Export teacher-audited SFT data.
- Export only records that pass the required audit status.
- Preserve enough metadata for later training and traceability.

Admin scope rules:

- Admin can inspect governance and audit data needed for operations.
- Admin does not directly rewrite student or teacher conversations as ordinary content.
- Admin is responsible for operational configuration, not daily teaching workflow.

## Organization Model

The current organization hierarchy is:

`admin -> teachers -> classes -> students`

Rules:

- One teacher has many classes.
- One class has many students.
- A student belongs to a class for the current scope.
- Teacher permissions are class-scoped by default.
- Admin can manage all teachers, classes, and students.

## Project Model

The current student learning object hierarchy is:

`student -> poem/text project -> questions/practice records`

Rules:

- A project is anchored by the poem or classical text title.
- A project can contain many questions.
- A project can contain many practice records.
- Student ask flow automatically creates or selects the correct project.
- Project history is not a generic chat archive; it is a learning and data-production source.

## Audit And Dataset Model

The current data factory target is DPO and SFT.

SFT candidate records should preserve:

- source role
- source project or teacher workspace
- prompt
- accepted/corrected answer
- audit status
- teacher auditor
- timestamps and source metadata

DPO candidate records should preserve:

- source role
- source project or teacher workspace
- prompt
- chosen answer
- rejected answer
- preference rationale or label when present
- audit status
- teacher auditor
- timestamps and source metadata

Only audited records should be available for admin export.

## Legacy Scope Treatment

Earlier specs used Bloom progression, challenge, school-wide learning dashboards, and complex intervention queues as the main product axis.
Those concepts are no longer the current scope driver.

They may return later as implementation details inside practice, audit, or teacher review, but current work must not depend on them as primary navigation, data model, or demo requirements.
