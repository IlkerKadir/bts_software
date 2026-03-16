'use client';

import { useEffect, useState } from 'react';
import { Clock, FileText, CheckCircle, Send, Edit, Trash2 } from 'lucide-react';

interface Activity {
  id: string;
  action: string;
  createdAt: string;
  user: { fullName: string };
  quote: { quoteNumber: string; company: { name: string } };
}

const actionIcons: Record<string, typeof Clock> = {
  CREATE: FileText, UPDATE: Edit, STATUS_CHANGE: CheckCircle, EXPORT: Send, ITEM_DELETE: Trash2,
};
const actionLabels: Record<string, string> = {
  CREATE: 'oluşturdu', UPDATE: 'güncelledi', STATUS_CHANGE: 'durumunu değiştirdi',
  APPROVE: 'onayladı', EXPORT: 'dışa aktardı', ITEM_ADD: 'kalem ekledi',
  ITEM_UPDATE: 'kalem güncelledi', ITEM_DELETE: 'kalem sildi', CLONE: 'kopyaladı',
};

export function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = async () => {
    setError(false);
    setLoading(true);
    try {
      const response = await fetch('/api/dashboard/activity');
      if (!response.ok) throw new Error('Fetch failed');
      const data = await response.json();
      setActivities(data);
    } catch (err) {
      console.error('Activity feed fetch failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (error) return (
    <div className="text-center py-8 text-red-600">
      <p>Veri yüklenirken bir hata oluştu.</p>
      <button onClick={() => fetchData()} className="mt-2 text-sm text-primary-600 underline">Tekrar dene</button>
    </div>
  );

  if (loading) return (
    <div className="bg-white rounded-xl border border-primary-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-primary-200">
        <div className="h-5 w-32 bg-primary-100 rounded animate-pulse" />
      </div>
      <div className="divide-y divide-primary-100">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="px-5 py-3 flex items-start gap-3">
            <div className="mt-0.5 w-7 h-7 rounded-lg bg-primary-100 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-primary-100 rounded animate-pulse" />
              <div className="h-3 w-1/3 bg-primary-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (activities.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-primary-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-primary-200">
        <h3 className="font-semibold text-primary-900">Son Aktiviteler</h3>
      </div>
      <div className="divide-y divide-primary-100 max-h-96 overflow-y-auto">
        {activities.map((a) => {
          const Icon = actionIcons[a.action] || Clock;
          return (
            <div key={a.id} className="px-5 py-3 flex items-start gap-3">
              <div className="mt-0.5 p-1.5 rounded-lg bg-primary-100">
                <Icon className="h-3.5 w-3.5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-primary-900">
                  <span className="font-medium">{a.user.fullName}</span>{' '}
                  {a.quote.quoteNumber} ({a.quote.company.name}) {actionLabels[a.action] || a.action}
                </p>
                <p className="text-xs text-primary-500 mt-0.5">
                  {new Date(a.createdAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
