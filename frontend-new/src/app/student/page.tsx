import { ErrorState } from '@/components/workbench/state-surfaces';
import { StudentChatClient } from '@/components/workbench/student-chat-client';
import { getStudentWorkspace } from '@/lib/data/student';

export default async function StudentChatPage() {
  const workspace = await getStudentWorkspace();
  if (!workspace.ok) return <div className="p-6"><ErrorState title="学生工作台加载失败" description={workspace.message} /></div>;
  return <StudentChatClient providerBlocked={workspace.data.providerBlocked} classificationBlocked={workspace.data.classificationBlocked} />;
}
