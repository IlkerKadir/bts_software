import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  return (
    <DashboardLayout user={user}>
      {children}
    </DashboardLayout>
  );
}
