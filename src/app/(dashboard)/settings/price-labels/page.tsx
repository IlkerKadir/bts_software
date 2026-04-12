import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { PriceLabelOptionsList } from '@/components/settings/PriceLabelOptionsList';

export const dynamic = 'force-dynamic';

export default async function PriceLabelsAdminPage() {
  const user = await getSession();
  if (!user) redirect('/login');
  if (!user.role.canManageSettings && !user.role.canManageUsers) {
    redirect('/dashboard');
  }

  return <PriceLabelOptionsList />;
}
