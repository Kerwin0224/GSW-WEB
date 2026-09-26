import { Card, CardContent } from '@/components/ui/card';
import { AuditWorkspace } from '@/components/workbench/audit/audit-workspace';
import { ErrorState } from '@/components/workbench/state-surfaces';
import { firstParam, parsePageParam } from '@/lib/pagination';
import { auditQueueView, type AuditQueueView } from '@/components/workbench/audit/presentation';
import { listTeacherAppeals } from '@/lib/data/appeals';
import { getTeacherAuditQueue, getTeacherAuditSession, getTeacherClasses, type AuditSessionDetail } from '@/lib/data/teacher';
import { listTeacherStudentOptions } from '@/lib/data/spaces';

/**
 * ?status= 只认待核实与已提交两个真视图；旧链接上的 `all` 也回落到待核实。
 * 服务端的队列查询按这个值过滤，标签和结果必须一一对应。
 */
function parseStatus(value: string | string[] | undefined): AuditQueueView {
  return auditQueueView(firstParam(value));
}

/** 筛选值只认 uuid / 合法日期。垃圾值原样传给查询会变成一条必然报错的请求。 */
function parseFilterValue(value: string | string[] | undefined) {
  const raw = firstParam(value)?.trim() ?? '';
  if (!raw) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : undefined;
}

function parseDateFrom(value: string | string[] | undefined) {
  const raw = firstParam(value)?.trim() ?? '';
  if (!raw || Number.isNaN(Date.parse(raw))) return undefined;
  return raw;
}

type AuditPageSearchParams = {
  page?: string | string[];
  status?: string | string[];
  session?: string | string[];
  classId?: string | string[];
  studentId?: string | string[];
  projectId?: string | string[];
  hasIssue?: string | string[];
  dateFrom?: string | string[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * 学习记录核实页。
 *
 * 选中哪条会话来自 URL（?session=），不是客户端 state —— 这样教师看板上的
 * 「需优先核实」卡片才能直接点到具体会话，后退键也正常工作。
 * 列表与详情各自取值：详情只取被选中的那一条，列表不再顺带把整页会话的正文拉回来。
 *
 * 筛选（班级/学生/项目/疑点/起始日期）同样走 URL：带 6 个班的教师此前只能靠翻页找
 * 「某班某学生某项目」，翻到第二页就忘了自己在找什么。
 */
export default async function TeacherAuditPage({ searchParams }: { searchParams?: Promise<AuditPageSearchParams> }) {
  const params = await searchParams;
  const page = parsePageParam(params?.page);
  const status = parseStatus(params?.status);
  const sessionParam = firstParam(params?.session)?.trim() ?? '';
  const sessionId = uuidPattern.test(sessionParam) ? sessionParam : '';
  const filters = {
    classId: parseFilterValue(params?.classId),
    studentId: parseFilterValue(params?.studentId),
    projectId: parseFilterValue(params?.projectId),
    // 只有 '1' 算启用：URL 里出现 ?hasIssue= 之类的空值不该被读成「只要有疑点的」。
    hasIssue: firstParam(params?.hasIssue) === '1',
    dateFrom: parseDateFrom(params?.dateFrom),
  };

  const [queueResult, classesResult, studentsResult, appealsResult] = await Promise.all([
    getTeacherAuditQueue({ page, status, ...filters }),
    getTeacherClasses(),
    listTeacherStudentOptions(),
    listTeacherAppeals('open'),
  ]);
  if (!queueResult.ok) return <div className="p-6"><ErrorState title="学习记录核实加载失败" description={queueResult.message} /></div>;

  let session: AuditSessionDetail | null = null;
  let sessionError: string | undefined;
  if (sessionId) {
    const result = await getTeacherAuditSession(sessionId);
    if (!result.ok) {
      sessionError = result.message;
    } else if (result.data) {
      session = result.data;
    } else {
      // 查不到一律按「打不开」处理，不区分不存在与无权访问，避免探测他人会话。
      sessionError = '这条会话不在你的班级范围内，或者已被学生删除。';
    }
  }

  const classOptions = classesResult.ok ? classesResult.data.map((item) => ({ classId: item.classId, className: item.className })) : [];
  // 同名学生可能带班名，不带班名会让两个班的学生分不开——筛选下拉必须能区分。
  const studentOptions = studentsResult.ok ? studentsResult.data.map((item) => ({ studentId: item.id, studentName: item.className ? `${item.displayName}（${item.className}）` : item.displayName })) : [];
  // 申诉读失败不挡核实主流程：教师照样能提交核实，只是看不到申诉队列。
  const appeals = appealsResult.ok ? appealsResult.data : [];

  // 与学生提问空间、教师问答同一套外框：三者都是整屏工作区，看起来该是同一个产品。
  return (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-[100rem] flex-col px-3 py-3 sm:px-5 lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden">
      <Card className="relative flex min-h-0 flex-1 overflow-hidden border-primary/20 bg-card/92 shadow-ink backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-accent to-destructive/70" />
        <CardContent className="flex min-h-0 flex-1 p-0">
          <AuditWorkspace
            queue={queueResult.data}
            session={session}
            sessionError={sessionError}
            initialView={status}
            classOptions={classOptions}
            studentOptions={studentOptions}
            appeals={appeals}
          />
        </CardContent>
      </Card>
    </div>
  );
}
