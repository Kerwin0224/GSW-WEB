import { z } from 'zod';

import { withApiLogging } from '@/lib/observability/with-api-logging';
import { createSubmission, deleteSubmission, listManagedSubmissions, listMySubmissions } from '@/lib/data/submissions';
import { postgresUuidSchema } from '@/lib/request-schemas';

/**
 * 归属判定全在数据层（RLS + owner 过滤），这里只搬参数。
 */

const idSchema = z.object({ id: postgresUuidSchema });

function statusFor(reason: string) {
  if (reason === 'forbidden') return 403;
  if (reason === 'unauthenticated' || reason === 'password_change_required') return 401;
  return 500;
}

export async function GET(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'submissions_list', route: '/api/submissions' }, async () => {
    const url = new URL(req.url);
    const view = url.searchParams.get('view') ?? 'mine';
    const result = view === 'managed'
      ? await listManagedSubmissions({
        classId: url.searchParams.get('classId') ?? undefined,
        spaceId: url.searchParams.get('spaceId') ?? undefined,
      })
      : await listMySubmissions();
    if (!result.ok) return Response.json({ ok: false, message: result.message }, { status: statusFor(result.reason) });
    return Response.json({ ok: true, submissions: result.data });
  });
}

export async function POST(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'submission_create', route: '/api/submissions' }, async () => {
    const form = await req.formData();
    const title = form.get('title');
    const projectId = form.get('projectId');
    const content = form.get('content');
    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);

    const result = await createSubmission({
      title: typeof title === 'string' ? title : '',
      projectId: typeof projectId === 'string' && projectId ? projectId : null,
      content: typeof content === 'string' ? content : null,
      files,
    });
    if (!result.ok) return Response.json({ ok: false, message: result.message }, { status: statusFor(result.reason) });
    return Response.json({ ok: true, submission: result.data }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  return withApiLogging(req, { area: 'api', event: 'submission_delete', route: '/api/submissions' }, async () => {
    const id = new URL(req.url).searchParams.get('id');
    const parsed = idSchema.safeParse({ id });
    if (!parsed.success) return Response.json({ ok: false, message: '提交 ID 无效。' }, { status: 400 });

    const result = await deleteSubmission(parsed.data.id);
    if (!result.ok) return Response.json({ ok: false, message: result.message }, { status: statusFor(result.reason) });
    return Response.json({ ok: true, id: result.data.id });
  });
}
