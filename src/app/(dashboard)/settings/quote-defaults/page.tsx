import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { QuoteDefaultsForm } from '@/components/settings/QuoteDefaultsForm';

export const dynamic = 'force-dynamic';

export default async function QuoteDefaultsAdminPage() {
  const user = await getSession();
  if (!user) redirect('/login');
  if (!user.role.canManageSettings && !user.role.canManageUsers) {
    redirect('/dashboard');
  }

  return <QuoteDefaultsForm />;
}
