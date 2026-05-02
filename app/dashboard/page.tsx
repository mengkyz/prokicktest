import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import DashboardContent from './DashboardContent';

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/');

  return <DashboardContent userId={session.userId} />;
}
