import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import BookContent from './BookContent';

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/');

  const { childId } = await searchParams;

  return <BookContent userId={session.userId} childId={childId} />;
}
