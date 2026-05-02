import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import PackagesContent from './PackagesContent';

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/');

  const { childId } = await searchParams;

  return <PackagesContent userId={session.userId} childId={childId} />;
}
