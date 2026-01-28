'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Card, CardBody } from '@/components/ui';
import {
  FilePlus,
  Search,
  RefreshCw,
} from 'lucide-react';

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}

const actions: QuickAction[] = [
  {
    label: 'Yeni Teklif',
    description: 'Yeni teklif oluştur',
    href: '/quotes?action=new',
    icon: FilePlus,
    iconBg: 'bg-primary-50',
    iconColor: 'text-primary-700',
  },
  {
    label: 'Ürün Ara',
    description: 'Ürün kataloğunda ara',
    href: '/products',
    icon: Search,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  {
    label: 'Kur Güncelle',
    description: 'Döviz kurlarını güncelle',
    href: '/settings/exchange-rates',
    icon: RefreshCw,
    iconBg: 'bg-green-50',
    iconColor: 'text-green-600',
  },
];

export function QuickActions() {
  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-primary-900">Hızlı İşlemler</h2>
      <div className="flex flex-col gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href}>
              <Card className="hover:shadow-md transition-shadow duration-200 group cursor-pointer">
                <CardBody className="flex items-center gap-4 py-4">
                  <div className={cn('p-3 rounded-lg', action.iconBg)}>
                    <Icon
                      className={cn(
                        'w-5 h-5',
                        action.iconColor,
                        'group-hover:scale-110 transition-transform duration-200'
                      )}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-primary-900 group-hover:text-primary-700 transition-colors">
                      {action.label}
                    </p>
                    <p className="text-sm text-primary-500">
                      {action.description}
                    </p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
