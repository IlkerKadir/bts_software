import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

// Quote status type (duplicated to avoid Prisma client dependency in client components)
type QuoteStatus =
  | 'TASLAK'
  | 'ONAY_BEKLIYOR'
  | 'ONAYLANDI'
  | 'GONDERILDI'
  | 'TAKIPTE'
  | 'REVIZYON'
  | 'KAZANILDI'
  | 'KAYBEDILDI'
  | 'IPTAL';

const statusStyles: Record<QuoteStatus, string> = {
  TASLAK: 'bg-primary-100 text-primary-700 border-primary-300',
  ONAY_BEKLIYOR: 'bg-amber-50 text-amber-700 border-amber-300',
  ONAYLANDI: 'bg-sky-50 text-sky-700 border-sky-300',
  GONDERILDI: 'bg-blue-50 text-blue-700 border-blue-300',
  TAKIPTE: 'bg-purple-50 text-purple-700 border-purple-300',
  REVIZYON: 'bg-orange-50 text-orange-700 border-orange-300',
  KAZANILDI: 'bg-green-50 text-green-700 border-green-300',
  KAYBEDILDI: 'bg-red-50 text-red-700 border-red-300',
  IPTAL: 'bg-gray-100 text-gray-500 border-gray-300',
};

const statusLabels: Record<QuoteStatus, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gönderildi',
  TAKIPTE: 'Takipte',
  REVIZYON: 'Revizyon',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
  IPTAL: 'İptal',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: QuoteStatus;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, status, variant = 'default', children, ...props }, ref) => {
    const variantStyles = {
      default: 'bg-primary-100 text-primary-700 border-primary-300',
      success: 'bg-green-50 text-green-700 border-green-300',
      warning: 'bg-amber-50 text-amber-700 border-amber-300',
      error: 'bg-red-50 text-red-700 border-red-300',
      info: 'bg-blue-50 text-blue-700 border-blue-300',
    };

    const styles = status ? statusStyles[status] : variantStyles[variant];
    const label = status ? statusLabels[status] : children;

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border',
          styles,
          className
        )}
        {...props}
      >
        {label}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge, statusLabels };
