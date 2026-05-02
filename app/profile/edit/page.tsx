import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import EditProfileContent from './EditProfileContent';

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ targetId?: string; type?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/');

  const { targetId, type } = await searchParams;
  if (!targetId || !type) redirect('/profile');

  return (
    <EditProfileContent
      userId={session.userId}
      targetId={targetId}
      type={type}
    />
  );
}
