import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import AdminLoginContent from './AdminLoginContent';

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  return <AdminLoginContent />;
}
