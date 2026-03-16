'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Building2,
  FolderOpen,
  Package,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Coins,
  Shield,
  Clock,
  FileImage,
  ClipboardCheck,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const menuItems = [
  { href: '/dashboard', label: 'Anasayfa', icon: LayoutDashboard },
  { href: '/quotes', label: 'Teklifler', icon: FileText },
  { href: '/orders', label: 'Siparisler', icon: ClipboardCheck },
  { href: '/projects', label: 'Projeler', icon: FolderOpen },
  { href: '/companies', label: 'Firmalar', icon: Building2 },
  { href: '/products', label: 'Ürünler', icon: Package },
];

const adminItems = [
  { href: '/users', label: 'Kullanıcılar', icon: Users },
  { href: '/settings/roles', label: 'Roller', icon: Shield },
  { href: '/settings/exchange-rates', label: 'Döviz Kurları', icon: Coins },
  { href: '/settings/templates', label: 'Şablonlar', icon: FileImage },
  { href: '/settings', label: 'Ayarlar', icon: Settings },
];

interface SidebarProps {
  userRole?: {
    canManageUsers: boolean;
    canApprove?: boolean;
  };
  userName?: string;
  userRoleName?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

export function Sidebar({ userRole, userName, userRoleName, isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  const NavItem = ({ href, label, icon: Icon }: (typeof menuItems)[0]) => {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

    return (
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 cursor-pointer',
          isActive
            ? 'bg-primary-700 text-white'
            : 'text-accent-300 hover:bg-accent-800 hover:text-white'
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!isCollapsed && <span className="text-sm font-medium">{label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-accent-900 flex flex-col transition-all duration-300 z-40',
        isCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center px-4 border-b border-accent-800">
        {!isCollapsed && (
          <Link href="/dashboard" className="flex items-center flex-1">
            <Image
              src="/btslogo.svg"
              alt="BTS Logo"
              width={120}
              height={42}
              className="brightness-0 invert"
              priority
            />
          </Link>
        )}
        <button
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
          className="p-1.5 rounded-lg text-accent-400 hover:bg-accent-800 hover:text-white cursor-pointer transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav role="navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        {userRole?.canApprove && (
          <NavItem href="/approvals" label="Onay Bekleyenler" icon={Clock} />
        )}

        <NavItem href="/notifications" label="Bildirimler" icon={Bell} />

        {userRole?.canManageUsers && (
          <>
            <div className="my-4 border-t border-accent-800" />
            {!isCollapsed && (
              <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-accent-500">
                Yönetim
              </p>
            )}
            {adminItems.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* User info & version */}
      <div className="border-t border-accent-800 p-3">
        {userName ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              {getInitials(userName)}
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className="text-sm font-medium text-accent-200 truncate">{userName}</p>
                <p className="text-xs text-accent-500 truncate">{userRoleName}</p>
              </div>
            )}
          </div>
        ) : (
          !isCollapsed && <p className="text-xs text-accent-500">v1.0.0</p>
        )}
      </div>
    </aside>
  );
}
