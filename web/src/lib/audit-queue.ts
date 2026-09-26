/**
 * audit-queue.ts
 *
 * 学习记录核实队列的**列表侧**形状与分组。
 *
 * 为什么单独成文件：此前这一层在客户端组件里用 useMemo 现推——数据层返回一页扁平记录，
 * 组件自己按 班级→学生→项目 嵌套三层 Map。结果是同一份分组语义只存在于视图里，
 * 既没法单测，也逼着列表查询去取详情才需要的字段（消息正文）。
 * 现在分组在服务端一次算好，列表行只带导航需要的字段；纯函数，可直接单测。
 */

/** 判定一条 AI 回答的教师处置记录所需的最小字段。 */
export type TeacherDecisionRow = {
  kind?: string | null;
  status?: string | null;
  quality?: string | null;
  metadata?: unknown;
  dimension_key?: string | null;
  teacher_comment?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function approved(row: TeacherDecisionRow) {
  return row.status === 'approved' || row.status === 'exported';
}

function actionOf(row: TeacherDecisionRow) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  return typeof metadata.teacher_action === 'string' ? metadata.teacher_action : '';
}

/**
 * 这条 AI 回答有没有教师的**显式处置**（逐条确认或修订）。
 *
 * 这是「训练数据只收教师处置过的回答」的唯一判据，列表预告与最终物化共用它：
 * 两处各写一份必然漂移，漂移的后果是界面说 3 条、库里进了 9 条。
 *
 * 此前没有这个判据——会话级提交只能靠「有没有修订」反推教师看过哪条，
 * 于是 10 轮长对话里改过第 3 轮，其余 9 条从未被读过的回答全被写成 accurate。
 * 「没改过」不等于「看过且认可」。
 */
export function hasTeacherDecision(rows: readonly TeacherDecisionRow[]) {
  return rows.some((row) => {
    if (!approved(row)) return false;
    if (row.kind !== 'metadata') return false;
    const action = actionOf(row);
    if (action === 'message_confirmed' || action === 'revision_draft') return true;
    // 历史数据：早期把确认结论只落在 quality 上，没有 teacher_action。
    return row.quality === 'confirmed' || row.quality === 'revision_draft';
  });
}

/** 教师处置时写下的维度键与评语（取较新的一条），供详情回显。 */
export function latestTeacherDecision(rows: readonly TeacherDecisionRow[]) {
  return [...rows]
    .filter((row) => row.kind === 'metadata' && approved(row) && (actionOf(row) === 'message_confirmed' || actionOf(row) === 'revision_draft'))
    .sort((left, right) => reviewTimestampOf(right).localeCompare(reviewTimestampOf(left)))
    .find((row) => row.dimension_key || row.teacher_comment);
}

function reviewTimestampOf(row: TeacherDecisionRow) {
  return row.updated_at ?? row.created_at ?? '';
}

/** AI 预审的进行状态。 */
export type PreReviewState = 'not_run' | 'ready' | 'partial' | 'blocked' | 'failed';

/**
 * 队列列表行：导航与三角定位需要的最小字段。
 * 刻意不含消息正文——列表不该长成详情查询的样子。
 */
export type AuditQueueSession = {
  conversationId: string;
  sessionLabel: string;
  /** 最后一条 AI 回答的时间，也是列表排序依据。 */
  updatedAt: string;
  finalized: boolean;
  assistantCount: number;
  /** 教师显式封口。与 finalized 独立：已核实但未封口的会话学生仍可继续追问。 */
  locked: boolean;
  /** 有疑点的 AI 回答条数（同一条回答多处疑点只算一条）。 */
  riskAssistantCount: number;
  issueCount: number;
  /** 疑点标签，供列表与看板一句话提示；最多 4 条。 */
  issueLabels: string[];
  preReviewState: PreReviewState;
  preReviewCoveredMessageCount: number;
};

/**
 * 一条待渲染的会话行：会话本身 + 它挂在哪条 班级/学生/项目 路径下。
 *
 * 三层都带 id：教师点某一层要能把它变成队列筛选（?classId= / ?studentId= / ?projectId=），
 * 只有名字的话点下去只能回到未筛选的队列，等于没筛。
 */
export type AuditQueueEntry = {
  classId: string | null;
  classLabel: string;
  studentId?: string | null;
  studentName: string;
  projectId?: string | null;
  projectName: string;
  session: AuditQueueSession;
};

/** 班级 → 学生 → 项目 → 会话。 */
export type AuditQueueGroup = {
  classId: string | null;
  classLabel: string;
  students: Array<{
    studentId?: string | null;
    studentName: string;
    projects: Array<{ projectId?: string | null; projectName: string; sessions: AuditQueueSession[] }>;
  }>;
};

/**
 * 把扁平的行按 班级 → 学生 → 项目 收成树。
 *
 * 保持入参顺序：调用方已按 updated_at desc 取数，所以每个项目下的会话天然是新到旧，
 * 班级/学生/项目的先后也随「最近有动静的排前面」。这里不重排——排序是查询的事。
 */
export function buildAuditQueueGroups(entries: readonly AuditQueueEntry[]): AuditQueueGroup[] {
  const byClass = new Map<string, AuditQueueGroup>();
  // 同一层级用「路径 → 节点」索引复用节点，避免嵌套 Map 的类型体操。
  const studentIndex = new Map<string, AuditQueueGroup['students'][number]>();
  const projectIndex = new Map<string, { projectId?: string | null; projectName: string; sessions: AuditQueueSession[] }>();

  for (const entry of entries) {
    const classKey = entry.classId ?? entry.classLabel;
    let group = byClass.get(classKey);
    if (!group) {
      group = { classId: entry.classId, classLabel: entry.classLabel, students: [] };
      byClass.set(classKey, group);
    }

    const studentKey = `${classKey}\u0000${entry.studentName}`;
    let student = studentIndex.get(studentKey);
    if (!student) {
      student = { studentId: entry.studentId, studentName: entry.studentName, projects: [] };
      studentIndex.set(studentKey, student);
      group.students.push(student);
    }

    const projectKey = `${studentKey}\u0000${entry.projectName}`;
    let project = projectIndex.get(projectKey);
    if (!project) {
      project = { projectId: entry.projectId, projectName: entry.projectName, sessions: [] };
      projectIndex.set(projectKey, project);
      student.projects.push(project);
    }

    project.sessions.push(entry.session);
  }

  return Array.from(byClass.values());
}

/** 按树的顺序摊平会话（班级 → 学生 → 项目 → 会话），用于「下一条」这类线性推进。 */
export function flattenAuditSessions(groups: readonly AuditQueueGroup[]): AuditQueueSession[] {
  return groups.flatMap((group) => group.students.flatMap((student) => student.projects.flatMap((project) => project.sessions)));
}

/**
 * 队列里当前会话之后的**下一条待核实**。
 * 跳过已提交的（status=all 时才可能出现），到底是最后一条就返回 undefined
 * ——不要循环回第一条，那会让教师误以为队列还没走完。
 */
export function findNextPendingSessionId(groups: readonly AuditQueueGroup[], currentId: string): string | undefined {
  const sessions = flattenAuditSessions(groups);
  const currentIndex = sessions.findIndex((session) => session.conversationId === currentId);
  if (currentIndex < 0) return undefined;
  return sessions.slice(currentIndex + 1).find((session) => !session.finalized)?.conversationId;
}
