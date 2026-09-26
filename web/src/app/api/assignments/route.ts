import { z } from 'zod';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { ASSIGNMENT_KIND_SET, createAssignment, listStudentAssignments, listTeacherAssignments } from '@/lib/data/assignments';
import { requireRole } from '@/lib/data/common';
import { postgresUuidSchema } from '@/lib/request-schemas';

const createSchema = z.object({
  title: z.string().trim().min(1, '请填写任务标题。').max(120, '任务标题请控制在 120 字以内。'),
  instructions: z.string().trim().max(4000, '任务说明请控制在 4000 字以内。').optional(),
  kind: z.enum(ASSIGNMENT_KIND_SET as [string, ...string[]]).default('practice'),
  classId: postgresUuidSchema.optional(),
  spaceId: postgresUuidSchema.optional(),
  targetLevel: z.number().int().min(1).max(6).optional(),
  // 客户端给的是 datetime-local（本地时间且不带时区），这里按 UTC 收，
  // 否则补 Z 会被当成 UTC 而偏几个小时。
  dueAt: z.string().datetime({ offset: true }).optional(),
  recipients: z.array(postgresUuidSchema).max(200).optional(),
});

/** 待办任务。角色决定看哪一侧：教师看自己布置的，学生看派给自己的。 */
export async function GET(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'assignments_list', route: '/api/assignments' }, async (requestId) => {
    const role = await requireRole('teacher');
    if (role.ok) {
      const result = await listTeacherAssignments();
      if (!result.ok) return Response.json({ error: result.message, requestId }, { status: 500 });
      return Response.json({ assignments: result.data, requestId });
    }

    const student = await requireRole('student');
    if (!student.ok) return Response.json({ error: role.message, requestId }, { status: 403 });
    const result = await listStudentAssignments();
    if (!result.ok) return Response.json({ error: result.message, requestId }, { status: 500 });
    return Response.json({ assignments: result.data, requestId });
  });
}

/** 布置任务。 */
export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'assignment_create', route: '/api/assignments' }, async (requestId) => {
    const role = await requireRole('teacher');
    if (!role.ok) return Response.json({ error: role.message, requestId }, { status: role.reason === 'forbidden' ? 403 : 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid request', issues: [{ message: 'Malformed JSON body' }] }, { status: 400 });
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: 'Invalid request', issues: parsed.error.flatten() }, { status: 400 });

    // 路由层只做形状校验，受众与锚点的业务规则仍在 createAssignment 里——
    // 那里已经有 RLS 与教师作用域的判据，两处各判一次必然漂移。
    const formData = new FormData();
    formData.set('title', parsed.data.title);
    if (parsed.data.instructions) formData.set('instructions', parsed.data.instructions);
    formData.set('kind', parsed.data.kind);
    if (parsed.data.classId) formData.set('class_id', parsed.data.classId);
    if (parsed.data.spaceId) formData.set('space_id', parsed.data.spaceId);
    if (parsed.data.targetLevel) formData.set('target_level', String(parsed.data.targetLevel));
    if (parsed.data.dueAt) formData.set('due_at', parsed.data.dueAt);
    for (const recipient of parsed.data.recipients ?? []) formData.append('recipients', recipient);

    const result = await createAssignment({ ok: false, message: '' }, formData);
    return Response.json({ ...result, requestId }, { status: result.ok ? 200 : 400 });
  });
}
