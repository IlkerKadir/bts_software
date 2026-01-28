'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  History,
  CheckCircle,
  AlertCircle,
  Edit,
  Plus,
  Trash2,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { Badge, Spinner } from '@/components/ui';

interface HistoryEntry {
  id: string;
  action: string;
  changes: Record<string, unknown>;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
  };
}

interface QuoteHistoryProps {
  quoteId: string;
}

const actionLabels: Record<string, string> = {
  CREATE: 'Teklif Oluşturuldu',
  UPDATE: 'Teklif Güncellendi',
  STATUS_CHANGE: 'Durum Değişti',
  APPROVAL_CHECK: 'Onay Kontrolü',
  ITEM_ADD: 'Kalem Eklendi',
  ITEM_UPDATE: 'Kalem Güncellendi',
  ITEM_DELETE: 'Kalem Silindi',
  EXPORT: 'Dışa Aktarıldı',
};

const actionIcons: Record<string, typeof History> = {
  CREATE: Plus,
  UPDATE: Edit,
  STATUS_CHANGE: RefreshCw,
  APPROVAL_CHECK: CheckCircle,
  ITEM_ADD: Plus,
  ITEM_UPDATE: Edit,
  ITEM_DELETE: Trash2,
  EXPORT: FileText,
};

const actionVariants: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  CREATE: 'success',
  UPDATE: 'info',
  STATUS_CHANGE: 'warning',
  APPROVAL_CHECK: 'info',
  ITEM_ADD: 'success',
  ITEM_UPDATE: 'info',
  ITEM_DELETE: 'error',
  EXPORT: 'default',
};

const statusLabels: Record<string, string> = {
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

export function QuoteHistory({ quoteId }: QuoteHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderChanges = (entry: HistoryEntry) => {
    const { action, changes } = entry;

    if (!changes || Object.keys(changes).length === 0) {
      return null;
    }

    if (action === 'STATUS_CHANGE') {
      const fromStatus = String(changes.from || '');
      const toStatus = String(changes.to || '');
      const note = changes.note ? String(changes.note) : null;
      return (
        <div className="text-sm text-primary-600 mt-2">
          <span className="text-primary-500">
            {statusLabels[fromStatus] || fromStatus}
          </span>
          {' → '}
          <span className="font-medium text-primary-800">
            {statusLabels[toStatus] || toStatus}
          </span>
          {note && (
            <p className="mt-1 italic text-primary-500">
              Not: {note}
            </p>
          )}
        </div>
      );
    }

    if (action === 'APPROVAL_CHECK') {
      return (
        <div className="text-sm text-primary-600 mt-2">
          {(changes.needsApproval as boolean) && (
            <>
              <p className="text-warning-600 font-medium">Onay Gerekli</p>
              {Array.isArray(changes.reasonLabels) && (
                <ul className="list-disc list-inside mt-1">
                  {(changes.reasonLabels as string[]).map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      );
    }

    // Generic change display
    return (
      <div className="text-sm text-primary-600 mt-2 space-y-1">
        {Object.entries(changes).map(([key, value]) => (
          <div key={key}>
            <span className="text-primary-500">{key}:</span>{' '}
            <span className="font-medium">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-primary-500">
        <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Henüz geçmiş kaydı bulunmuyor</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-primary-200" />

        {/* History entries */}
        <div className="space-y-4">
          {history.map((entry) => {
            const Icon = actionIcons[entry.action] || History;
            const variant = actionVariants[entry.action] || 'default';

            return (
              <div
                key={entry.id}
                className="relative pl-10"
              >
                {/* Timeline dot */}
                <div className="absolute left-2 w-5 h-5 rounded-full bg-white border-2 border-primary-300 flex items-center justify-center">
                  <Icon className="w-3 h-3 text-primary-500" />
                </div>

                {/* Content */}
                <div
                  className={`
                    bg-white border border-primary-200 rounded-lg p-3 cursor-pointer
                    hover:border-primary-300 transition-colors
                  `}
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={variant} className="text-xs">
                          {actionLabels[entry.action] || entry.action}
                        </Badge>
                      </div>
                      <p className="text-sm text-primary-600 mt-1">
                        {entry.user.fullName}
                      </p>
                    </div>
                    <span className="text-xs text-primary-500 whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>

                  {expandedId === entry.id && renderChanges(entry)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
