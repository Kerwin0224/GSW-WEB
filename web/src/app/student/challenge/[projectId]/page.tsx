import { redirect } from 'next/navigation';

export default async function StudentChallengePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/student/challenge?projectId=${encodeURIComponent(projectId)}`);
}
