import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import AddProfileContent from './AddProfileContent';

export default async function AddProfilePage() {
  const session = await getSession();
  if (!session) redirect('/');

  return <AddProfileContent userId={session.userId} />;
}
