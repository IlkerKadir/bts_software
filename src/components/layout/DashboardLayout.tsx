import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

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
  return (
    <div className="min-h-screen bg-primary-50">
      <Sidebar
        userRole={user.role}
        userName={user.fullName}
        userRoleName={user.role.name}
      />

      <div className="pl-60">
        <Header user={user} />

        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
