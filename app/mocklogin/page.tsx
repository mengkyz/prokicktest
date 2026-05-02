import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import MockLoginContent from './MockLoginContent';

export default async function MockLoginPage() {
  if (process.env.MOCK_LOGIN_ENABLED !== 'true') {
    notFound();
  }

  const session = await getSession();
  if (session) redirect('/dashboard');

  return <MockLoginContent />;
}
