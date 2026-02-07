'use client';

import { ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/cn';

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-primary-50">
      <Sidebar
        userRole={user.role}
        userName={user.fullName}
        userRoleName={user.role.name}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
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
