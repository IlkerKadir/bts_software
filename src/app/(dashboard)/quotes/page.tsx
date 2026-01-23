import { getSession } from '@/lib/session';
import { QuoteList } from './QuoteList';

export default async function QuotesPage() {
  const user = await getSession();

  if (!user) return null;

  return (
    <QuoteList
      userId={user.id}
      canApprove={user.role.canApprove}
      canViewCosts={user.role.canViewCosts}
    />
  );
}
