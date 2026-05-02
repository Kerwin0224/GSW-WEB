import { ErrorState } from '@/components/workbench/state-surfaces';
import { TeacherAuditClient } from '@/components/workbench/teacher-audit-client';
import { getTeacherAuditQueue } from '@/lib/data/teacher';

export default async function TeacherAuditPage() {
  const result = await getTeacherAuditQueue();
  if (!result.ok) return <div className="p-6"><ErrorState title="审计队列加载失败" description={result.message} /></div>;
  return <TeacherAuditClient records={result.data} />;
}
