import { redirect } from 'next/navigation';

export default async function StudentProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/student?projectId=${projectId}`);
}
