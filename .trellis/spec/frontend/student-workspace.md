# Student Workspace Frontend Spec

> Executable frontend contracts for the student core loop: ask -> see Bloom level -> receive ascension prompt -> take challenge -> review cognitive profile.

---

## Evidence And Tool Notes

- GitNexus was targeted at `GSW-WEB`; `list_repos` succeeded, `query` returned no student flow matches, and `context` / `impact` failed with a corrupted WAL error. Do not infer code contracts from GitNexus for this task without re-running it after the index is repaired.
- ABCoder currently exposes `GSW-EDU`, not the active `GSW-WEB` workspace. `get_file_structure` could not resolve `web/src/**`, so AST-level contracts below are grounded in read-only current source excerpts.
- Context7 confirmed AI SDK v6 UI messages render via `message.parts`; persistent custom data is represented as `data-*` parts, while transient stream events can be handled with `onData`.
- Context7 confirmed Next.js App Router pages are Server Components by default and should fetch server data directly, then pass serializable props into interactive Client Components.
- Context7 confirmed Recharts radar composition with `RadarChart`, `PolarGrid`, `PolarAngleAxis`, `PolarRadiusAxis`, `Radar`, `Tooltip`, and `ResponsiveContainer`.
- Tavily research reinforced three product constraints: keep chat controls obvious, keep context adjacent to generated answers, and use Bloom as a progressive ladder rather than a decorative badge.

---

## Scenario: Three-Pane Chat Layout

### 1. Scope / Trigger

- Trigger: changing `/student`, `StudentChatClient`, project sidebar behavior, or the right-side Bloom realtime panel.
- The first viewport of `/student` must be the workbench, not a marketing or introduction page.
- Desktop contract: left project rail, center chat, right session Bloom panel.
- Mobile contract: center chat first, project rail and Bloom panel available as stacked sections or sheets without hiding the composer.

Current code anchor:

```tsx
// web/src/app/student/page.tsx
export default async function StudentChatPage() {
  const [workspace, projectsResult, profileResult] = await Promise.all([
    getStudentWorkspace(),
    getStudentProjects(),
    getStudentProfileSummary(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        eyebrow="学生主线"
        title="把一首诗、一篇文，读到真正懂。"
        primaryAction={{ label: '开始提问', href: '#student-chat' }}
      />
      <section id="student-chat" className="space-y-4 scroll-mt-20">
        <StudentChatClient
          providerBlocked={workspace.data.providerBlocked}
          classificationBlocked={workspace.data.classificationBlocked}
        />
      </section>
    </div>
  );
}
```

### 2. Signatures

Target route split:

```tsx
// web/src/app/student/page.tsx
export default async function StudentChatPage() {
  const [workspace, projectsResult, profileResult] = await Promise.all([
    getStudentWorkspace(),
    getStudentProjects(),
    getStudentProfileSummary(),
  ]);

  if (!workspace.ok) return <StudentWorkspaceError message={workspace.message} />;

  return (
    <StudentWorkspaceClient
      providerBlocked={workspace.data.providerBlocked}
      classificationBlocked={workspace.data.classificationBlocked}
      initialProjects={projectsResult.ok ? projectsResult.data : []}
      initialProfile={profileResult.ok ? profileResult.data : null}
    />
  );
}
```

```tsx
// web/src/components/workbench/student-workspace-client.tsx
'use client';

type StudentWorkspaceClientProps = {
  providerBlocked?: string;
  classificationBlocked?: string;
  initialProjects: ProjectCardData[];
  initialProfile: StudentProfileSummary | null;
};
```

Target layout tracks:

```text
desktop: grid-cols-[18rem_minmax(0,1fr)_20rem]
tablet:  grid-cols-[16rem_minmax(0,1fr)]
mobile:  chat first, projects and Bloom summary below or in sheets
```

### 3. Contracts

- `/student/page.tsx` remains a Server Component and owns server data loading.
- Browser state, `useChat`, scrolling, copy, retry, and panel toggles live in Client Components.
- The center chat must be visible in the first viewport without scrolling past `WorkspaceHero`, `PrincipleCard`, or metrics.
- The left rail shows real projects from `getStudentProjects()`, with an empty ask-first state when no projects exist.
- The right rail shows session-level Bloom state, not global profile statistics.
- Blocked provider or classification states must remain visible near the composer and in the right rail; do not replace them with sample records.
- The composer must remain reachable during streaming and error states.

### 4. Validation & Error Matrix

| Condition | UI behavior | Assertion |
| --- | --- | --- |
| Provider unavailable | center chat and right rail show blocked reason | submit disabled, no fake assistant response |
| Classification unavailable | chat remains readable with blocked classification notice | no hardcoded Bloom badge |
| No projects | left rail shows ask-first empty state | no demo project |
| Desktop first paint | three-pane workspace visible | no hero section above chat |
| Mobile first paint | chat and composer visible before secondary panels | no hidden composer |
| Server load fails | route-level error state | Client Component not mounted with guessed data |

### 5. Good/Base/Bad Cases

- Good: student opens `/student` and immediately sees project rail, chat transcript/composer, and Bloom session panel.
- Good: project rail lets the student jump back to a poem project without leaving the active chat context.
- Base: mobile stacks the project summary below chat when a sheet is not implemented.
- Bad: `WorkspaceHero` and principle cards push the chat below the fold.
- Bad: the right panel shows all-time profile numbers and calls them current session progress.

### 6. Tests Required

- Route smoke: `/student` renders the chat workspace without a hero-first layout.
- Component test: blocked provider and blocked classification disable submit while preserving transcript layout.
- Responsive test: desktop has three visible panes; mobile shows composer before project/profile secondary content.
- Static check: `/student/page.tsx` remains a Server Component and does not import `useChat`.
- Accessibility: panes have labels such as `aria-label="篇目项目"`, `aria-label="古诗文学习对话"`, and `aria-label="本次会话布鲁姆状态"`.

### 7. Wrong vs Correct

#### Wrong

```tsx
// web/src/app/student/page.tsx
<WorkspaceHero title="把一首诗、一篇文，读到真正懂。" />
<PrincipleCard index="1" title="先问明白" />
<section id="student-chat">
  <StudentChatClient />
</section>
```

#### Correct

```tsx
// web/src/app/student/page.tsx
<StudentWorkspaceClient
  initialProjects={projects}
  initialProfile={profile}
  providerBlocked={workspace.data.providerBlocked}
  classificationBlocked={workspace.data.classificationBlocked}
/>
```

---

## Scenario: Per-Message Bloom Badge And Ascension Suggestion Card

### 1. Scope / Trigger

- Trigger: changing `AIMessageList`, `AIMessagePart`, `/api/student/chat`, or assistant message rendering.
- Every student user message can show a pending, classified, failed, or unclassified Bloom state.
- Every assistant answer may end with an ascension suggestion card supplied by the backend; the frontend only renders it.

Current code anchor:

```tsx
// web/src/components/workbench/ai-message-list.tsx
export function AIMessagePart({ part }: { part: unknown }) {
  const text = partText(part);
  if (text !== null) {
    return <div className="whitespace-pre-wrap leading-7" aria-live="polite">{text}</div>;
  }

  const type = partType(part);
  if (type.includes('classification')) {
    return <Badge variant="outline">分类状态更新</Badge>;
  }
  return null;
}
```

```ts
// web/src/app/api/student/chat/route.ts
const result = streamText({
  model: languageModel,
  system: '你是文韵智途的古诗文 AI 教学助手。必须基于古诗文学习语境回答...',
  messages: await convertToModelMessages(messages),
  onFinish: async ({ text }) => {
    const { data: assistant } = await supabase.from('conversation_messages').insert({
      conversation_id: conversation.id,
      role: 'assistant',
      content: text,
      model_id: modelId,
      bloom_state: 'unclassified',
    }).select('id').single();
  },
});
```

### 2. Signatures

AI SDK v6 UI message type:

```ts
import type { UIMessage } from 'ai';
import type { BloomLevel } from '@/components/workbench/bloom-badge';

type AscensionSuggestion = {
  sourceMessageId: string;
  currentLevel: BloomLevel;
  targetLevel: BloomLevel;
  title: string;
  prompt: string;
  reason: string;
  challengeHref?: string;
};

type StudentChatMessage = UIMessage<
  never,
  {
    bloom: {
      messageId: string;
      state: 'pending' | 'classified' | 'failed' | 'unclassified';
      level?: BloomLevel;
      reason?: string;
    };
    ascension: AscensionSuggestion;
  }
>;
```

Persistent parts expected by the renderer:

```ts
type StudentMessagePart =
  | { type: 'text'; text: string }
  | { type: 'data-bloom'; id: string; data: StudentChatMessage['parts'][number] }
  | { type: 'data-ascension'; id: string; data: AscensionSuggestion };
```

### 3. Contracts

- The frontend must not create the ascension prompt from local strings, Bloom labels, or heuristics.
- The backend route is responsible for classification and ascension data. It may stream persistent `data-ascension` parts and must persist the final server decision in `onFinish` or the same server flow.
- `AIMessagePart` must render unknown parts as `null`, not as raw JSON.
- Text, classification, citation, retrieval, tool, and ascension parts must be handled independently so a failed classification does not hide answer text.
- Assistant message actions should include copy and retry/regenerate controls where an API path exists; absent APIs must show disabled/actionable states rather than fake retries.
- User Bloom badges must be keyed by real message id, not by a placeholder key such as `pending`.

### 4. Validation & Error Matrix

| Condition | UI behavior | Assertion |
| --- | --- | --- |
| `part.type === 'text'` | render answer text with preserved whitespace | text remains visible during metadata failures |
| `part.type === 'data-ascension'` | render suggestion card | no frontend prompt generation |
| `part.type === 'data-bloom'` classified | render `BloomBadge` with label and level | no color-only signal |
| Bloom part failed | render failed status with reason | message remains visible |
| Unknown custom part | render nothing or a safe diagnostic badge | no raw object dump |
| Copy succeeds | non-blocking feedback | transcript does not reflow |
| Retry unavailable | disabled button with reason | no fake regenerate |

### 5. Good/Base/Bad Cases

- Good: assistant answer ends with “你可以尝试...” card only when `message.parts` contains `data-ascension`.
- Good: copy action copies the visible assistant answer and excludes hidden metadata.
- Base: if no ascension part exists, render only the answer text and known status badges.
- Bad: every assistant answer gets a hardcoded “try L4 analysis” card.
- Bad: frontend asks the model for a second prompt only to create a suggestion card.

### 6. Tests Required

- Unit render: `AIMessagePart` renders text, `data-bloom`, `data-ascension`, tool, and unknown parts.
- Unit render: `AscensionSuggestionCard` requires `currentLevel`, `targetLevel`, `title`, `prompt`, and `reason`.
- Chat integration: pending, classified, failed, and unclassified user badges preserve message text.
- Static check: no ascension card component contains prompt-engineering strings for generating advice.
- Accessibility: card announces target level as text, for example `L4 分析`, not only color.

### 7. Wrong vs Correct

#### Wrong

```tsx
// web/src/components/workbench/ai-message-list.tsx
function LocalAscensionCard() {
  return <Card>你可以尝试从分析角度继续追问。</Card>;
}
```

#### Correct

```tsx
// web/src/components/workbench/ai-message-list.tsx
if (part.type === 'data-ascension') {
  return <AscensionSuggestionCard suggestion={part.data} />;
}
```

---

## Scenario: Session-Level Bloom Stats Bar

### 1. Scope / Trigger

- Trigger: adding session stats to chat header, right rail, or `StudentChatClient` state.
- The stats bar summarizes only the current chat session, not all projects and not the profile page.
- It must stay visible while messages stream.

Current code anchor:

```tsx
// web/src/components/workbench/student-chat-client.tsx
const [bloomStatus, setBloomStatus] = useState<Record<string, BloomStatus>>({});
const { messages, sendMessage, status, error } = useChat({
  transport: new DefaultChatTransport({ api: '/api/student/chat' }),
});

const submit = () => {
  const text = input.trim();
  if (!text || busy || providerBlocked || classificationBlocked || !projectTitle.trim()) return;

  sendMessage({ parts: [{ type: 'text', text }] }, { body: { projectTitle: projectTitle.trim() } });
  setBloomStatus((current) => ({ ...current, pending: { state: 'pending' } }));
  setInput('');
};
```

### 2. Signatures

```ts
import type { BloomLevel } from '@/components/workbench/bloom-badge';
import type { BloomStatus } from '@/components/workbench/bloom-status-badge';

type SessionBloomStats = {
  levels: Array<{
    level: BloomLevel;
    label: string;
    count: number;
    latestMessageId?: string;
  }>;
  pendingCount: number;
  failedCount: number;
  highestLevel?: BloomLevel;
};

type SessionBloomStatsBarProps = {
  messages: StudentChatMessage[];
  userBloomStatus: Record<string, BloomStatus>;
};
```

### 3. Contracts

- Compute stats from the current `messages` array and server-supplied `data-bloom` parts or message-id keyed `userBloomStatus`.
- Render all six Bloom levels every time, even when count is zero.
- Pending and failed counts are separate from classified level counts.
- The bar must be compact enough for the chat header or right rail; do not use dashboard-sized cards.
- Clicking a level filters or scrolls to matching current-session messages only when the target message id exists.
- If classification is blocked, show the blocked reason and keep all counts neutral.

### 4. Validation & Error Matrix

| Condition | UI behavior | Assertion |
| --- | --- | --- |
| No messages | six zero levels and ask-first copy | no fake L1/L2 count |
| One pending user message | pending count increments | no classified count |
| Classified messages across levels | counts match current session | no all-time project data mixed in |
| Failed classification | failed count visible | original question remains visible |
| Right rail collapsed | stats still reachable through label/button | no information loss |
| Message id missing | level click disabled | no scroll error |

### 5. Good/Base/Bad Cases

- Good: “本次会话：L2 理解 x2, L4 分析 x1, 待分类 x1” appears beside the chat.
- Good: selecting L4 scrolls to the matching current-session question if present.
- Base: static bar with counts and no click behavior.
- Bad: reusing `/student/me` global distribution as session stats.
- Bad: `setBloomStatus({ pending: ... })` and then looking up status by `message.id`.

### 6. Tests Required

- Unit: stats reducer returns six level rows for empty, pending, classified, failed, and mixed sessions.
- Unit: status lookup uses real message ids.
- Component: right rail and compact header variants render the same counts.
- Accessibility: each level includes text such as `L3 应用，0 条`.
- Regression: streaming a new assistant message does not reset existing user Bloom counts.

### 7. Wrong vs Correct

#### Wrong

```tsx
// web/src/components/workbench/student-chat-client.tsx
setBloomStatus((current) => ({ ...current, pending: { state: 'pending' } }));
```

#### Correct

```tsx
// web/src/components/workbench/student-chat-client.tsx
setBloomStatus((current) => ({
  ...current,
  [submittedMessageId]: { state: 'pending' },
}));
```

---

## Scenario: Project Card v2

### 1. Scope / Trigger

- Trigger: changing `ProjectCard`, `/student/projects`, `/student/me` project cards, or project summaries in the student rail.
- Project cards must show the poem/text object, current Bloom depth, six-level thumbnail, and challenge progress.

Current code anchor:

```tsx
// web/src/components/workbench/project-card.tsx
export interface ProjectCardData {
  id: string;
  title: string;
  author?: string;
  highestLevel?: BloomLevel;
  questionCount: number;
  practiceCount: number;
  updatedLabel?: string;
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const progress = project.highestLevel ? (project.highestLevel / 6) * 100 : 0;
  return (
    <Card className="transition hover:-translate-y-0.5 hover:shadow-md">
      {project.highestLevel ? <BloomBadge level={project.highestLevel} /> : null}
      <Progress value={progress} aria-label="布鲁姆认知路径进度" />
    </Card>
  );
}
```

### 2. Signatures

```ts
import type { BloomLevel } from '@/components/workbench/bloom-badge';

type ProjectLevelSummary = {
  level: BloomLevel;
  questionCount: number;
  achievedChallengeCount: number;
};

type ProjectChallengeProgress = {
  latestTargetLevel?: BloomLevel;
  attemptedCount: number;
  achievedCount: number;
  latestState?: 'pending' | 'evaluated' | 'failed';
};

export interface ProjectCardData {
  id: string;
  title: string;
  author?: string;
  highestLevel?: BloomLevel;
  levelSummary: ProjectLevelSummary[];
  questionCount: number;
  practiceCount: number;
  challengeProgress: ProjectChallengeProgress;
  updatedLabel?: string;
}
```

### 3. Contracts

- Keep `title`, `author`, `questionCount`, `practiceCount`, and `highestLevel`; they already exist and must not regress.
- Add a six-segment Bloom thumbnail where each segment is text-addressable and not color-only.
- Highest level badge is shown only when real data exists.
- Challenge progress uses real `practice_records` counts and evaluation states; do not infer achievement from `highestLevel`.
- The primary card action remains “继续学习” to `/student/projects/[projectId]`.
- A secondary challenge action may link to `/student/challenge/[projectId]` when a project id exists.
- Empty level summaries render neutral segments, not a fake L1 baseline.

### 4. Validation & Error Matrix

| Condition | UI behavior | Assertion |
| --- | --- | --- |
| No Bloom data | neutral six-segment bar | no highest badge |
| Highest level present | show `BloomBadge` and fill through highest level | label includes level text |
| Some levels have questions | segment count shown in tooltip or sr text | no color-only meaning |
| No practices | challenge progress says no challenge yet | no 0 percent punishment copy |
| Evaluated practices exist | achieved/attempted visible | does not claim mastery without `achieved` |
| Project missing author | title still formats cleanly | no dangling punctuation |

### 5. Good/Base/Bad Cases

- Good: card shows `《岳阳楼记》 · 范仲淹`, highest `L4 分析`, six small level segments, `挑战 2/3`.
- Good: card with no records shows “尚无分类记录” and an ask CTA.
- Base: highest badge plus six neutral segments before challenge progress is available.
- Bad: a single horizontal progress bar is the only Bloom signal.
- Bad: practice count is displayed as challenge success count.

### 6. Tests Required

- Component: renders with no Bloom data, partial level summary, full level summary, and missing author.
- Component: segment labels include `L1 记忆` through `L6 创造`.
- Component: challenge progress distinguishes attempted and achieved counts.
- Route smoke: `/student/projects` and `/student/me` project cards share the same `ProjectCard` contract.
- Accessibility: card link and challenge action have distinct labels.

### 7. Wrong vs Correct

#### Wrong

```tsx
// web/src/components/workbench/project-card.tsx
<Progress value={(project.highestLevel / 6) * 100} aria-label="布鲁姆认知路径进度" />
```

#### Correct

```tsx
// web/src/components/workbench/project-card.tsx
<BloomMiniBar
  levels={project.levelSummary}
  highestLevel={project.highestLevel}
  aria-label={`《${project.title}》布鲁姆六层缩略进度`}
/>
```

---

## Scenario: Cognitive Profile Radar

### 1. Scope / Trigger

- Trigger: changing `/student/me`, profile summary data, or cognitive profile visualization.
- `/student/me` must show a real six-axis radar chart for Bloom dimensions when records exist.
- The chart is explanatory, not a score ranking.

Current code anchor:

```tsx
// web/src/app/student/me/page.tsx
<Card>
  <CardHeader><CardTitle>布鲁姆认知分布</CardTitle></CardHeader>
  <CardContent>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
      {distribution.map((item) => (
        <div key={item.level} className="rounded-xl border bg-background/60 p-3 text-center">
          <BloomBadge level={item.level} />
          <p className="mt-2 text-2xl font-semibold">{item.count}</p>
          <p className="text-xs text-muted-foreground">真实记录</p>
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

```ts
// web/src/lib/bloom-engine.ts
export type CognitiveProfile = {
  userId: string;
  dimensions: [number, number, number, number, number, number]; // L1-L6 counts
  strengths: BloomLevel[];
  weaknesses: BloomLevel[];
  suggestion: string;
};
```

### 2. Signatures

```ts
import type { BloomLevel } from '@/components/workbench/bloom-badge';

type CognitiveRadarPoint = {
  level: BloomLevel;
  label: '记忆' | '理解' | '应用' | '分析' | '评价' | '创造';
  count: number;
  fullMark: number;
};

type CognitiveProfileRadarProps = {
  data: CognitiveRadarPoint[];
  suggestion: string;
  strengths: BloomLevel[];
  weaknesses: BloomLevel[];
};
```

Recharts contract verified through Context7:

```tsx
// web/src/app/student/me/page.tsx or a client chart component
<ResponsiveContainer width="100%" height={320}>
  <RadarChart data={data} outerRadius="75%">
    <PolarGrid />
    <PolarAngleAxis dataKey="label" />
    <PolarRadiusAxis angle={30} domain={[0, fullMark]} />
    <Radar
      name="认知记录"
      dataKey="count"
      stroke="var(--primary)"
      fill="var(--primary)"
      fillOpacity={0.28}
    />
    <Tooltip />
  </RadarChart>
</ResponsiveContainer>
```

### 3. Contracts

- Use real six-dimension data from message Bloom records, preferably `getCognitiveProfile(userId)` or an equivalent helper with the same semantics.
- Do not compute the radar from project `highestLevel` counts if the label says personal cognitive dimensions.
- The page remains a Server Component for data loading; the chart can be a Client Component because Recharts is interactive.
- `ResponsiveContainer` must wrap `RadarChart` so the chart does not overflow mobile width.
- The chart must have a text fallback or adjacent summary for accessibility.
- Empty records show the existing ask-first empty state; do not render a radar with fake sample points.

### 4. Validation & Error Matrix

| Condition | UI behavior | Assertion |
| --- | --- | --- |
| No records | empty state with ask CTA | no chart with sample data |
| One level has data | radar shows one non-zero axis plus text summary | no hidden zero axes |
| All levels have data | six axes visible | labels are Chinese |
| Recharts cannot render during SSR | chart isolated in Client Component | page still server-loads data |
| High value outlier | radius domain covers max value | no clipped shape |
| Color-blind user | adjacent text summary explains levels | not color-only |

### 5. Good/Base/Bad Cases

- Good: radar shows L1-L6 counts with a suggestion from `CognitiveProfile.suggestion`.
- Good: strengths and weaknesses are listed as learning guidance, not grades.
- Base: radar plus the existing six numeric tiles for precise counts.
- Bad: six square counters are the only visualization after Recharts is available.
- Bad: chart uses mock `Math`, `English`, or demo `Student A` labels from docs.

### 6. Tests Required

- Component: radar receives six points and renders six Chinese axis labels.
- Component: empty records render `EmptyState`, not a chart.
- Component: `ResponsiveContainer` has stable parent height.
- Data: profile dimensions are based on user `conversation_messages.bloom_level` records.
- Accessibility: counts are available as text next to or below the chart.

### 7. Wrong vs Correct

#### Wrong

```tsx
// web/src/app/student/me/page.tsx
const distribution = projects.map((project) => project.highestLevel);
```

#### Correct

```tsx
// web/src/app/student/me/page.tsx
const profile = await getCognitiveProfile(role.data.id);
const data = profile.dimensions.map((count, index) => ({
  level: (index + 1) as BloomLevel,
  label: bloomLevelInfo[(index + 1) as BloomLevel].label,
  count,
  fullMark,
}));
```

---

## Scenario: Immersive Challenge Page

### 1. Scope / Trigger

- Trigger: changing student challenge routes, challenge generation/evaluation UI, or challenge success/failure states.
- The canonical challenge route is `/student/challenge/[projectId]`.
- The challenge page is immersive and focused: vertical progress, current prompt, answer area, hint, evaluation feedback, and next branch.

Current code anchor:

```tsx
// web/src/app/(student)/challenge/[projectId]/page.tsx
type ChallengeState = 'idle' | 'loading' | 'ready' | 'submitting' | 'evaluated';

export default function ChallengePage({ params }: PageProps) {
  const [projectId, setProjectId] = useState<string>('');
  const [targetLevel, setTargetLevel] = useState<number>(1);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);

  const handleGenerate = async (level: number) => {
    const response = await fetch('/api/challenge/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, targetLevel: level }),
    });
  };
}
```

```ts
// web/src/lib/challenge-engine.ts
export async function generateChallenge(
  projectId: string,
  userId: string,
  targetLevel: number
): Promise<ChallengeData | ChallengeError>;

export async function evaluateAnswer(
  challengeId: string,
  userAnswer: string
): Promise<EvaluationResult | ChallengeError>;
```

### 2. Signatures

Canonical file structure:

```text
web/src/app/student/challenge/[projectId]/page.tsx
web/src/app/student/challenge/[projectId]/loading.tsx
web/src/components/workbench/student-challenge-client.tsx
web/src/components/workbench/challenge-progress-rail.tsx
```

API contracts already present:

```ts
// POST /api/challenge/generate
type GenerateChallengeRequest = {
  projectId: string;
  targetLevel?: 1 | 2 | 3 | 4 | 5 | 6;
};

type ChallengeData = {
  id: string;
  projectId: string;
  projectTitle: string;
  targetLevel: number;
  prompt: string;
  createdAt: string;
};
```

```ts
// POST /api/challenge/evaluate
type EvaluateChallengeRequest = {
  challengeId: string;
  answer: string;
};

type EvaluationResult = {
  id: string;
  achieved: boolean;
  feedback: string;
  evaluatedAt: string;
};
```

### 3. Contracts

- `/student/challenge/[projectId]/page.tsx` should be a Server Component that validates project access or loads the minimum project shell before mounting the Client Component.
- `student-challenge-client.tsx` owns `idle | loading | ready | submitting | evaluated | failed` interaction state.
- The progress indicator is vertical on desktop and compact horizontal on mobile; it renders L1-L6 with labels.
- The “需要提示” button is always explicit. It can reveal server-provided hint text when present; it must not invent a hint when the generated challenge lacks one.
- On `achieved: true`, show a simple 2 second scale + opacity breakthrough animation. Do not implement gold particles, confetti, or decorative ritual animation.
- On `achieved: false`, preserve the answer and feedback, then offer a branch back to `L{targetLevel - 1}` when target level is above L1.
- Provider/capability failures from `ChallengeError.resolution` render as blocked states and keep the selected project context.

### 4. Validation & Error Matrix

| Condition | UI behavior | Assertion |
| --- | --- | --- |
| Missing project access | permission/not-found state | no project content leak |
| `targetLevel` omitted | default L1 generation | matches current API behavior |
| Generate fails | blocked/error state with resolution | answer area not shown as ready |
| Evaluate fails | preserve answer and show retry | no answer clearing |
| `achieved: true` | success feedback plus 2s scale/opacity | no particle animation |
| `achieved: false` at L4 | feedback plus branch to L3 | branch level is target minus one |
| `achieved: false` at L1 | feedback plus retry L1 | no L0 branch |

### 5. Good/Base/Bad Cases

- Good: full-screen challenge view with left vertical L1-L6 rail, center prompt/answer, right feedback or project context.
- Good: failed L5 challenge offers “回到 L4 分析练一次” with preserved feedback.
- Base: one-column mobile challenge with sticky submit area.
- Bad: generic `/student/challenge` page that does not know the project id.
- Bad: success animation blocks interaction for more than 2 seconds or adds gold particles.

### 6. Tests Required

- Route smoke: `/student/challenge/[projectId]` loads for an accessible project id.
- API integration: generate and evaluate requests match existing `/api/challenge/generate` and `/api/challenge/evaluate` bodies.
- Component: answer is preserved after evaluation error and after `achieved: false`.
- Component: branch level clamps at L1.
- Visual regression: success animation completes after 2 seconds and leaves the final feedback readable.
- Accessibility: “需要提示”, submit, retry, and branch buttons are keyboard reachable.

### 7. Wrong vs Correct

#### Wrong

```tsx
// web/src/app/student/challenge/page.tsx
export default function ChallengePage() {
  const providerReady = false;
  return <BlockedState title="练习生成与评估被阻塞" />;
}
```

#### Correct

```tsx
// web/src/app/student/challenge/[projectId]/page.tsx
export default async function StudentProjectChallengePage({ params }: PageProps) {
  const { projectId } = await params;
  const project = await requireStudentProject(projectId);

  return <StudentChallengeClient project={project} />;
}
```

---

## Scenario: Route Dedup

### 1. Scope / Trigger

- Trigger: adding, moving, or deleting student challenge routes.
- There must be exactly one project-specific challenge URL: `/student/challenge/[projectId]`.
- Route groups may be used for layout only when they do not create duplicate public URLs or hidden alternate implementations.

Current code anchor:

```tsx
// web/src/app/student/challenge/page.tsx
'use client';

export default function ChallengePage() {
  const providerReady = false;
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="font-heading text-3xl">层级挑战</h1>
    </div>
  );
}
```

```tsx
// web/src/app/(student)/challenge/[projectId]/page.tsx
'use client';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default function ChallengePage({ params }: PageProps) {
  const [projectId, setProjectId] = useState<string>('');
  useEffect(() => {
    params.then((p) => setProjectId(p.projectId));
  }, [params]);
}
```

### 2. Signatures

Canonical route map:

```text
KEEP:
  /student/challenge/[projectId]
  web/src/app/student/challenge/[projectId]/page.tsx

REMOVE:
  web/src/app/(student)/challenge/[projectId]/page.tsx
  web/src/app/student/challenge/page.tsx, unless it redirects to a project picker with no duplicate challenge implementation
```

Allowed redirect-only entry:

```tsx
// web/src/app/student/challenge/page.tsx
import { redirect } from 'next/navigation';

export default function StudentChallengeIndexPage() {
  redirect('/student/projects');
}
```

### 3. Contracts

- Do not keep two challenge implementations with the same component name and different route assumptions.
- Do not read a `params` Promise from a Client Component with `useEffect`; unwrap params in the Server Component route.
- If `/student/challenge` exists, it must redirect or show a project picker. It must not generate/evaluate a challenge without `projectId`.
- Links from `ProjectCard`, project detail, and ascension suggestion cards target `/student/challenge/[projectId]`.
- Removed route-group files must not leave imports, tests, or docs pointing at `(student)/challenge`.

### 4. Validation & Error Matrix

| Condition | Required behavior | Assertion |
| --- | --- | --- |
| User opens `/student/challenge/[projectId]` | canonical challenge page | project id is available on first render |
| User opens `/student/challenge` | redirect or project picker | no duplicate challenge implementation |
| Old route-group path exists | reject change | `find web/src/app -path '*challenge*'` shows no duplicate page |
| Link uses `/challenge/[projectId]` without role prefix | reject change | role-obvious URL preserved |
| Client page unwraps params in effect | reject change | params handled in Server Component |

### 5. Good/Base/Bad Cases

- Good: one canonical dynamic route under `web/src/app/student/challenge/[projectId]/page.tsx`.
- Good: `/student/challenge` redirects to `/student/projects` when no project is selected.
- Base: project detail has a “开始层级挑战” link to the canonical route.
- Bad: `(student)/challenge/[projectId]` and `student/challenge/page.tsx` both contain challenge business UI.
- Bad: route group name hides that the public URL is not role-obvious.

### 6. Tests Required

- Static route check: exactly one `page.tsx` under `web/src/app/**/challenge/**` contains challenge generation UI.
- Link check: all student challenge links include `/student/challenge/`.
- Smoke: old route group path is absent or non-rendering after deletion.
- Server/client boundary: dynamic `params` are awaited in a Server Component before client state begins.
- Regression: `/student/projects/[projectId]` challenge link resolves to the canonical route.

### 7. Wrong vs Correct

#### Wrong

```text
web/src/app/(student)/challenge/[projectId]/page.tsx
web/src/app/student/challenge/page.tsx
```

#### Correct

```text
web/src/app/student/challenge/[projectId]/page.tsx
web/src/app/student/challenge/page.tsx  # redirect or project picker only
```
