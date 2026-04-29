'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import {
  FileEdit,
  Clock,
  CheckCircle2,
  Send,
  MessageSquareWarning,
} from 'lucide-react';

type PipelineStatus = 'TASLAK' | 'ONAY_BEKLIYOR' | 'DUZENLEME_TALEP_EDILDI' | 'ONAYLANDI' | 'GONDERILDI';

interface PipelineCounts {
  TASLAK: number;
  ONAY_BEKLIYOR: number;
  DUZENLEME_TALEP_EDILDI: number;
  ONAYLANDI: number;
  GONDERILDI: number;
}

interface QuotePipelineProps {
  counts: PipelineCounts;
}

const pipelineConfig: {
  status: PipelineStatus;
  label: string;
  borderColor: string;
  iconBg: string;
  iconColor: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    status: 'TASLAK',
    label: 'Taslak',
    borderColor: 'border-l-gray-400',
    iconBg: 'bg-gray-100',
    iconColor: 'text-gray-600',
    icon: FileEdit,
  },
  {
    status: 'ONAY_BEKLIYOR',
    label: 'Onay Bekliyor',
    borderColor: 'border-l-amber-500',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    icon: Clock,
  },
  {
    status: 'DUZENLEME_TALEP_EDILDI',
    label: 'Düzenleme Talep Edildi',
    borderColor: 'border-l-rose-500',
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
    icon: MessageSquareWarning,
  },
  {
    status: 'ONAYLANDI',
    label: 'Onaylandı',
    borderColor: 'border-l-sky-500',
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    icon: CheckCircle2,
  },
  {
    status: 'GONDERILDI',
    label: 'Gönderildi',
    borderColor: 'border-l-blue-500',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    icon: Send,
  },
];

export function QuotePipeline({ counts }: QuotePipelineProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {pipelineConfig.map((item) => {
        const Icon = item.icon;
        const count = counts[item.status];

        return (
          <Link
            key={item.status}
            href={`/quotes?status=${item.status}`}
            className={cn(
              'bg-white rounded-xl border border-primary-200 overflow-hidden',
              'border-l-4',
              item.borderColor,
              'p-4 hover:shadow-md transition-shadow duration-200 group'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn('p-2 rounded-lg', item.iconBg)}>
                <Icon className={cn('w-5 h-5', item.iconColor)} />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-primary-500 truncate group-hover:text-primary-700 transition-colors">
                  {item.label}
                </p>
                <p className="text-2xl font-bold text-primary-900">
                  {count}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
