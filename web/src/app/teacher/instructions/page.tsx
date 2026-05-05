import { ErrorState } from '@/components/workbench/state-surfaces';
import { TeacherInstructionEditor } from '@/components/workbench/teacher-chat-client';
import { getTeacherWorkspace } from '@/lib/data/teacher';

export default async function TeacherInstructionsPage() {
  const workspace = await getTeacherWorkspace();
  if (!workspace.ok) {
    return (
      <div className="p-6">
        <ErrorState title="教学预设加载失败" description={workspace.message} />
      </div>
    );
  }

  return <TeacherInstructionEditor presets={workspace.data.teacherPresets} />;
}
