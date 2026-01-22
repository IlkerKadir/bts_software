'use client';

import { useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { cn } from '@/lib/cn';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/quotes', label: 'Teklifler', icon: FileText },
  { href: '/projects', label: 'Projeler', icon: FolderOpen },
  { href: '/companies', label: 'Firmalar', icon: Building2 },
  { href: '/products', label: 'Ürünler', icon: Package },
];

const adminItems = [
  { href: '/users', label: 'Kullanıcılar', icon: Users },
  { href: '/settings', label: 'Ayarlar', icon: Settings },
];

interface SidebarProps {
  userRole?: {
    canManageUsers: boolean;
  };
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const NavItem = ({ href, label, icon: Icon }: typeof menuItems[0]) => {
    const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

    return (
      <Link
        href={href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 cursor-pointer',
          isActive
            ? 'bg-accent-700 text-white'
            : 'text-primary-300 hover:bg-primary-800 hover:text-white'
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
        'fixed left-0 top-0 h-screen bg-primary-900 flex flex-col transition-all duration-300 z-40',
        isCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-primary-800">
        {!isCollapsed && (
          <span className="text-xl font-bold text-white">BTS Teklif</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg text-primary-400 hover:bg-primary-800 hover:text-white cursor-pointer transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        {userRole?.canManageUsers && (
          <>
            <div className="my-4 border-t border-primary-800" />
            {adminItems.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* Version */}
      {!isCollapsed && (
        <div className="p-4 border-t border-primary-800">
          <p className="text-xs text-primary-500">v1.0.0</p>
        </div>
      )}
    </aside>
  );
}
