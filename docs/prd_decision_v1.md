# PRD Decision Draft v1

This file is the stable ASCII-named working version of the current PRD decision draft.
It consolidates the current product direction without overwriting the original PRD files.

## Product Identity

- The product is a school-facing AI workbench for classical poetry and classical Chinese learning.
- It is not a course-platform-first product.
- It is not a generic chat application.
- The core product axis is Bloom cognitive level progression.
- The system is both:
  - a teaching workbench
  - an audit and governance backend
  - a data factory for future post-training

## Primary Surfaces

### Student

- Question-first workbench
- Unified new conversation entry
- System decides whether the conversation belongs to:
  - normal chat
  - a poem project
- Poem project top bar shows:
  - poem title
  - current Bloom level
  - recommended Bloom level
  - challenge entry
- Student can:
  - ask questions
  - upload files
  - use web search
  - see current Bloom level
  - see recommended Bloom level
  - launch a challenge
  - receive teacher feedback
  - export a single poem project

### Teacher

- Default home is school-wide / class learning-status view
- Unified new conversation entry still exists
- Core responsibility is Bloom-level judgment, progression, and correction
- Main areas:
  - school-wide / class learning-status
  - my poem projects
  - student poem projects
- Teacher can:
  - prepare and ask in teacher-owned poem projects
  - review school-wide and class-level learning status
  - review student poem projects
  - write comments
  - write review conclusions
  - correct AI answers
  - adjust Bloom levels
  - process challenge-review queue items

### Admin

- School-level highest privilege role
- Home is a school dashboard, not a generic technical panel
- Main concerns:
  - school-wide Bloom distribution
  - teacher filtering
  - audit
  - settings
  - data production / labeling mode
- Admin can inspect all chats, projects, audit records, and think records for audit purposes
- Admin cannot directly edit teacher or student chat content

## Account Model

- Unified account system with separate front-end entry points
- Student unique identifier: student number
- Teacher unique identifier: employee number
- Admin uses separate backend accounts
- Admin can create teachers and students
- Teachers can also create students
- Support:
  - single create
  - Excel/CSV import
  - paste-list import
- In v1, one student belongs to one teacher
- If a student changes teacher, historical projects move to the new teacher

## Normal Chat vs Poem Project

- New conversation entry is unified
- The user does not pre-select chat vs poem project
- The system determines ownership after the conversation starts
- Non-poetry content goes to normal chat
- Poetry-related content goes to poem projects
- Student poem projects are unique by `student + poem`
- Teacher also has `teacher + poem` projects

## Bloom Levels

- Use classic 6-level Bloom progression:
  - Remember
  - Understand
  - Apply
  - Analyze
  - Evaluate
  - Create
- Student surface shows the official current level and system-recommended level in poem projects
- Teacher can expand the full ladder and adjust levels
- System judgment uses:
  - recent interaction
  - whole-project history
- Teacher overrides are first-class signals written back to the system
- The system should not lightly auto-downgrade official Bloom level

## Challenge

- Challenge is the main upgrade path for Bloom progression
- Student actively launches challenge
- The system generates the challenge prompt from current level, recommended level, and grade-related signals
- Challenge appears inline in the conversation flow
- The system can upgrade immediately
- Teacher can later confirm or override

## Teacher Intervention

- Teacher can:
  - write comments
  - write review conclusions
  - correct AI answers
  - adjust Bloom levels
- Original AI answer is preserved
- Teacher-corrected version can become the default visible final version for the student
- Teacher actions are part of the audit trail

## Inputs and Context

- Web search is enabled by default
- File upload is enabled by default
- Admin may disable those capabilities
- Supported files in v1:
  - images
  - PDF
  - Word
  - text
  - Markdown
- Files and search results are persisted into the current conversation or poem project context

## Export

- Student, teacher, and admin all support export, but with different scopes
- Student core export target:
  - one poem project
- Student export supports:
  - PDF
  - Word
- Teacher core export target:
  - all students under that teacher, organized by student
- Admin export scope is widest and includes reports, audit, and training-data-related outputs

## Think Mode

- Think is user-controlled via manual switch
- If think is enabled:
  - the user can expand to view the full thinking process
- If think is disabled:
  - do not show full thinking content
- Think traces do not enter the formal project history
- Think traces can enter audit data
- Admin can inspect think traces
- Teachers cannot inspect student think traces

## Lifecycle

- Student poem projects are not hard-deletable in v1
- Old projects move into history/archive
- Archive may be:
  - automatic
  - manual
- New interaction restores archived objects back into active lists
- Normal chat follows the same archive logic

## Data Factory and Reward Signals

- The product must support future post-training
- Data entering training pipelines must be layered:
  - raw samples
  - teacher-confirmed samples
  - high-value preference samples
  - think / reasoning audit samples
- The system must explicitly record reward-bearing events
- Core reward signal families:
  - Bloom judgment accepted vs overridden
  - challenge upgrade confirmed vs reverted
  - answer quality accepted vs edited vs rejected

## Data Production / Labeling Mode

- Main entry lives in admin
- First screen is sample-type entry, not a mixed queue
- First batch of sample types in v1:
  - Bloom judgment samples
  - challenge-upgrade samples
  - answer preference samples
  - think samples
- Support both:
  - batch workbench
  - single-sample detail page
- Batch states in v1:
  - unprocessed
  - confirmed
  - needs review
  - exported
- Admin can manually adjust reward labels
- Training-data export supports JSONL
- Training-data export includes source and audit metadata
- Export must support filtering by teacher-confirmed status
