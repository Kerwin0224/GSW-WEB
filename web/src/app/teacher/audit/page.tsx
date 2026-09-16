import { ErrorState } from '@/components/workbench/state-surfaces';
import { TeacherAuditClient } from '@/components/workbench/teacher-audit-client';
import { parsePageParam } from '@/lib/pagination';
import { getTeacherAuditQueue, type TeacherAuditQueueStatus } from '@/lib/data/teacher';

type AuditPageSearchParams = { page?: string | string[]; status?: string | string[] };

function parseStatus(value: string | string[] | undefined): TeacherAuditQueueStatus {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'all' ? 'all' : 'pending';
}

export default async function TeacherAuditPage({ searchParams }: { searchParams?: Promise<AuditPageSearchParams> }) {
  const params = await searchParams;
  const page = parsePageParam(params?.page);
  const status = parseStatus(params?.status);
  const result = await getTeacherAuditQueue({ page, status });
  if (!result.ok) return <div className="p-6"><ErrorState title="学习记录核实加载失败" description={result.message} /></div>;
  return <TeacherAuditClient {...result.data} />;
}
