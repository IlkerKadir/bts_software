import { getSession } from '@/lib/session';
import { ProductList } from './ProductList';

export default async function ProductsPage() {
  const user = await getSession();

  if (!user) return null;

  return (
    <ProductList
      canViewCosts={user.role.canViewCosts}
      canEditProducts={user.role.canEditProducts}
      canDelete={user.role.canDelete}
    />
  );
}
