import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { ServiceCostSettings } from '@/components/settings/ServiceCostSettings';

export default async function ServiceCostSettingsPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  // Only admin users can manage service costs
  if (!user.role.canManageUsers) {
    redirect('/dashboard');
  }

  return <ServiceCostSettings />;
}
