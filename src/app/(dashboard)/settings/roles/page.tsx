import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { RolesList } from './RolesList';

export default async function RolesPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  if (!user.role.canManageUsers) {
    redirect('/dashboard');
  }

  return <RolesList />;
}
