import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import ProfileContent from './ProfileContent';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect('/');

  return <ProfileContent userId={session.userId} />;
}
