import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileText, Tag, Settings as SettingsIcon, Users } from 'lucide-react';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Settings landing hub. Lists the admin sub-areas as navigation cards.
 * Each card links to its sub-page; the underlying page is responsible
 * for its own permission gate. This landing is visible to any user with
 * either `canManageUsers` or `canManageSettings` — it's just a directory.
 */
export default async function SettingsHubPage() {
  const user = await getSession();
  if (!user) redirect('/login');
  if (!user.role.canManageUsers && !user.role.canManageSettings) {
    redirect('/dashboard');
  }

  const cards: Array<{
    href: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    visible: boolean;
  }> = [
    {
      href: '/settings/quote-defaults',
      title: 'Teklif Varsayılanları',
      description: 'Miktar birimleri (Adet, kg, m² vb.) ve kullanılacak para birimlerini yönetin.',
      icon: SettingsIcon,
      visible: user.role.canManageSettings,
    },
    {
      href: '/settings/commercial-terms',
      title: 'Ticari Şart Şablonları',
      description: 'Garanti, ödeme, teslimat gibi kategorilerde tekrar kullanılabilir şart metinlerini yönetin.',
      icon: FileText,
      visible: user.role.canManageSettings,
    },
    {
      href: '/settings/price-labels',
      title: 'Fiyat Etiketleri',
      description: '"Tarafınızca sağlanacaktır" gibi fiyat yerine kullanılan etiket seçeneklerini yönetin.',
      icon: Tag,
      visible: user.role.canManageSettings,
    },
    {
      href: '/settings/roles',
      title: 'Roller ve İzinler',
      description: 'Kullanıcı rollerini ve onlara tanımlı yetki bayraklarını yönetin.',
      icon: Users,
      visible: user.role.canManageUsers,
    },
  ];

  const visibleCards = cards.filter(c => c.visible);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-accent-900 mb-2">Ayarlar</h1>
      <p className="text-sm text-accent-600 mb-8">
        Yönetici seviyesindeki yapılandırma seçenekleri.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleCards.map(card => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="group flex items-start gap-4 rounded-lg border border-accent-200 bg-white p-5 shadow-sm transition hover:border-primary-400 hover:shadow-md"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 group-hover:bg-primary-200">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-accent-900 group-hover:text-primary-700">
                  {card.title}
                </h2>
                <p className="mt-1 text-xs text-accent-600">{card.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
