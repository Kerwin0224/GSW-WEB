import { redirect } from 'next/navigation';

export default async function StudentProjectsPage() {
  redirect('/student/me');
}
