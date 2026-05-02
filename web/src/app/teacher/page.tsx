import { ErrorState } from '@/components/workbench/state-surfaces';
import { TeacherChatClient } from '@/components/workbench/teacher-chat-client';
import { getTeacherWorkspace } from '@/lib/data/teacher';

export default async function TeacherChatPage() {
  const workspace = await getTeacherWorkspace();
  if (!workspace.ok) return <div className="p-6"><ErrorState title="教师工作台加载失败" description={workspace.message} /></div>;
  return <TeacherChatClient presets={workspace.data.presets} providerBlocked={workspace.data.providerBlocked} />;
}
