'use client';

import { ReactNode, useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/cn';

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

interface DashboardLayoutProps {
  children: ReactNode;
  user: {
    fullName: string;
    role: {
      name: string;
      canManageUsers: boolean;
      canApprove?: boolean;
    };
  };
}

export function DashboardLayout({ children, user }: DashboardLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getInitialCollapsed);

  const handleToggleCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // localStorage may be unavailable
      }
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-primary-50">
      <Sidebar
        userRole={user.role}
        userName={user.fullName}
        userRoleName={user.role.name}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <div
        className={cn(
          'transition-all duration-300',
          isSidebarCollapsed ? 'pl-16' : 'pl-60'
        )}
      >
        <Header user={user} />

        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
