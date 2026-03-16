import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { UserList } from './UserList';

export default async function UsersPage() {
  const user = await getSession();
  if (!user) redirect('/login');

  if (!user.role.canManageUsers) {
    redirect('/dashboard');
  }

  return <UserList />;
}
