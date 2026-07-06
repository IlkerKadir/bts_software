import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SectionMemoryReset } from '@/components/layout/SectionMemoryReset';
import { loadAppSettings } from '@/lib/settings/loader';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  const settings = await loadAppSettings();

  return (
    <DashboardLayout user={user} settings={settings}>
      <SectionMemoryReset />
      {children}
    </DashboardLayout>
  );
}
