import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { FaturaKodlamaForm } from '@/components/settings/FaturaKodlamaForm';

export const dynamic = 'force-dynamic';

export default async function FaturaKodlamaAdminPage() {
  const user = await getSession();
  if (!user) redirect('/login');
  if (!user.role.canManageSettings && !user.role.canManageUsers) {
    redirect('/dashboard');
  }

  return <FaturaKodlamaForm />;
}
