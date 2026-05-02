import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import PaymentContent from './PaymentContent';

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string; packageId?: string; promoId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/');

  const { childId, packageId, promoId } = await searchParams;
  if (!packageId) redirect('/packages');

  return (
    <PaymentContent
      userId={session.userId}
      childId={childId ?? null}
      packageId={packageId}
      promoId={promoId ?? null}
      isAdmin={session.isAdmin}
    />
  );
}
