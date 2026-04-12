import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { CommercialTermTemplatesList } from '@/components/settings/CommercialTermTemplatesList';

export const dynamic = 'force-dynamic';

/**
 * Admin page for managing the reusable `CommercialTermTemplate` library.
 * The templates are surfaced inside the quote editor's Ticari Şartlar
 * panel; editing them here makes them available to every future quote.
 */
export default async function CommercialTermsAdminPage() {
  const user = await getSession();
  if (!user) redirect('/login');
  if (!user.role.canManageSettings && !user.role.canManageUsers) {
    redirect('/dashboard');
  }

  return <CommercialTermTemplatesList />;
}
