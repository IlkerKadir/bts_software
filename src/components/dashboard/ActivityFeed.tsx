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
  CREATE: 'olusturdu', UPDATE: 'guncelledi', STATUS_CHANGE: 'durumunu degistirdi',
  APPROVE: 'onayladi', EXPORT: 'disa aktardi', ITEM_ADD: 'kalem ekledi',
  ITEM_UPDATE: 'kalem guncelledi', ITEM_DELETE: 'kalem sildi', CLONE: 'kopyaladi',
};

export function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    fetch('/api/dashboard/activity').then(r => r.json()).then(setActivities).catch(console.error);
  }, []);

  if (activities.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900">Son Aktiviteler</h3>
      </div>
      <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
        {activities.map((a) => {
          const Icon = actionIcons[a.action] || Clock;
          return (
            <div key={a.id} className="px-5 py-3 flex items-start gap-3">
              <div className="mt-0.5 p-1.5 rounded-lg bg-slate-100">
                <Icon className="h-3.5 w-3.5 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900">
                  <span className="font-medium">{a.user.fullName}</span>{' '}
                  {a.quote.quoteNumber} ({a.quote.company.name}) {actionLabels[a.action] || a.action}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {new Date(a.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
