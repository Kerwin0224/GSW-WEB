# Child Task Map

## Why This Task Map Was Rebuilt

The previous task set was closer to a product-capability outline than a reviewable frontend plan.

That is not the right shape for the current phase.

Right now the repo is being judged as a frontend demo.
So the task tree should answer:

- which page gets reviewed first
- which surface each task is responsible for
- what order makes the visual and interaction review easiest

## Current Delivery Mode

The current delivery mode is frontend-demo-first.

That means:

- treat mock data as acceptable when it preserves the product flow
- prioritize reviewable surfaces over backend completeness
- make each task end in a screen or page cluster that can be judged directly
- keep product-flow logic in the task PRDs, but keep task naming page-oriented

## Frontend Review Order

Current execution order for the demo-first track:

1. `04-03-account-identity-and-import`
2. `04-03-student-entry-routing`
3. `04-03-poem-project-bloom-core`
4. `04-03-student-resource-workspace`
5. `04-03-challenge-upgrade-flow`
6. `04-03-teacher-intervention-release`
7. `04-03-admin-audit-and-export`
8. `04-03-admin-capability-runtime`
9. `04-03-admin-data-workspace`

## Child Tasks

### 1. `04-03-account-identity-and-import`

Meaning:

- Build the login page and role-entry front door
- Build the account and import surfaces needed for demo review
- Make student, teacher, and admin identity entry visible on the frontend

Why it matters:

- This is the first reviewer touchpoint
- If the front door looks weak, the whole demo looks weak

### 2. `04-03-student-entry-routing`

Meaning:

- Build the student landing page and unified first-question entry
- Show the route outcome between normal chat and poem project

Why it matters:

- This is the first real student page after login
- It proves the product is not a generic chat shell

### 3. `04-03-poem-project-bloom-core`

Meaning:

- Build the student poem-project page
- Make poem identity plus current and recommended Bloom level visible

Why it matters:

- This is the core student learning surface
- It anchors the rest of the student flow

### 4. `04-03-student-resource-workspace`

Meaning:

- Build the resource, upload, and citation area inside the student learning surface

Why it matters:

- Student review should not stop at a blank chat thread
- The workbench needs visible learning materials and source treatment

### 5. `04-03-challenge-upgrade-flow`

Meaning:

- Build the challenge page or challenge state surface
- Show upgrade attempt and post-challenge feedback clearly

Why it matters:

- Challenge is the visible mechanism of Bloom progression
- Without it, Bloom becomes static decoration

### 6. `04-03-teacher-intervention-release`

Meaning:

- Build the teacher workbench and intervention page
- Show queue, review context, correction, Bloom adjustment, and release states

Why it matters:

- Teacher authority is a core product promise
- This page proves the system is a teaching workbench, not only a student chatbot

### 7. `04-03-admin-audit-and-export`

Meaning:

- Build the admin overview page and audit list-detail page
- Surface export entry in the same reviewable flow

Why it matters:

- Admin has to look like a real governance surface
- This is the first proof of the audit and export story

### 8. `04-03-admin-capability-runtime`

Meaning:

- Build the admin settings and capability-control page
- Show provider, tool, and policy state clearly

Why it matters:

- Settings are part of the admin review surface
- This should be judged as a page, not as invisible plumbing

### 9. `04-03-admin-data-workspace`

Meaning:

- Build the admin data-factory workspace page
- Show sample typing, review state, and export interaction shells

Why it matters:

- This is the visual proof of the training-data loop
- It belongs at the end of the frontend review order

## Dependency Logic

- `account-identity-and-import` goes first because the front door is part of the review
- `student-entry-routing` follows because it is the first student page after entry
- `poem-project-bloom-core`, `student-resource-workspace`, and `challenge-upgrade-flow` together complete the student-side review
- `teacher-intervention-release` follows after student state is legible
- `admin-audit-and-export`, `admin-capability-runtime`, and `admin-data-workspace` complete the admin-side review in increasing depth

## Practical Reading Rule

When working from Trellis:

1. Read the reset task
2. Read this task map
3. Pick the page-oriented task that matches the frontend surface being reviewed or rebuilt
4. Use product-flow logic from the child PRD to keep the page from drifting
