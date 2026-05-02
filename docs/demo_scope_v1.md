# Demo Scope v2

This file defines the next demo scope after the four-module product reset.
The goal is to prove the narrowed product spine before broader learning analytics or Bloom features return.

## Demo Goals

The demo should prove:

1. Login routes student, teacher, and admin into clearly separated workspaces.
2. Student has only the required `ask` and `practice` flows.
3. Student questions are automatically filed under poem/text-title projects.
4. Teacher has only the required `ask` and `audit` flows.
5. Teacher audit produces DPO and SFT candidate data.
6. Admin manages teachers, classes, students, provider config, MCP config, and audited dataset export.

## Demo Principles

- Build the four-module spine first.
- Avoid broad dashboards unless they directly support the four current modules.
- Avoid resurrecting Bloom/challenge navigation as a demo requirement.
- Keep role boundaries visible and hard to confuse.
- Prefer complete core flows over many shallow pages.

## Login Demo Must-Haves

- Role-aware login entry.
- Student route.
- Teacher route.
- Admin route.
- Clear post-login workspace separation.

## Student Demo Must-Haves

- `Ask` entry.
- `Practice` entry.
- Project list grouped by poem/text title.
- Asking a question creates or selects the correct poem/text project.
- One project can show multiple questions.
- Practice records attach to the selected poem/text project.

## Teacher Demo Must-Haves

- `Ask` entry for teacher-to-LLM interaction.
- `Audit` entry for dataset production.
- Class/student scope visible enough to show teacher ownership.
- Audit detail can mark or prepare:
  - SFT record
  - DPO record
- Audit detail preserves original prompt and model answer.
- Audit detail supports corrected or preferred answer data.

## Admin Demo Must-Haves

- Teacher management.
- Class management.
- Student management.
- Teacher-to-class assignment.
- Class-to-student membership.
- Provider configuration.
- MCP configuration.
- Export audited SFT data.
- Export audited DPO data.

## Required Demo Flows

### Flow A: Login Routing

- User logs in as student, teacher, or admin.
- System routes to the matching workspace.

### Flow B: Student Ask To Project

- Student asks about a poem or classical text.
- System identifies the poem/text title.
- System creates or selects the matching project.
- The question appears under that project.

### Flow C: Student Practice

- Student opens a poem/text project.
- Student starts practice.
- Practice result is stored under the same project.

### Flow D: Teacher Ask

- Teacher asks the LLM for teaching support.
- The interaction is stored in the teacher workspace.

### Flow E: Teacher Audit

- Teacher opens an auditable record.
- Teacher marks it as SFT or DPO data.
- Teacher adds corrected/preferred answer data where needed.
- Record moves into audited state.

### Flow F: Admin Configure And Export

- Admin manages teacher/class/student relationships.
- Admin configures provider and MCP settings.
- Admin exports audited SFT and DPO JSONL batches.

## Explicitly Deferred

- Bloom progression as primary navigation.
- Challenge workflow.
- School-wide learning dashboards.
- Complex teacher intervention queues.
- Full LMS/course shell.
- Mature dataset governance beyond audited SFT/DPO export.
- Complex multi-school tenancy.

## Frontend Design Rules

- Student surface must feel like a learning workbench, not an admin panel.
- Teacher surface must feel like an ask-and-audit workbench, not a generic chat site.
- Admin surface must feel like an operations console, not a student-facing product.
- Avoid long explanatory copy.
- Avoid course-platform shell language.
- Avoid marketing/demo-course framing.
