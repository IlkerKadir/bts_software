'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Plus, Check, Calendar, FileText, Folder, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, CardBody, Modal, Input, Spinner } from '@/components/ui';

interface Reminder {
  id: string;
  title: string;
  note: string | null;
  dueDate: string;
  isCompleted: boolean;
  quote: { id: string; quoteNumber: string } | null;
  project: { id: string; name: string } | null;
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getDueDateStatus(dateStr: string): 'overdue' | 'today' | 'upcoming' {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(date);
  dueDay.setHours(0, 0, 0, 0);

  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

export function UpcomingReminders() {
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    note: '',
    dueDate: '',
  });
  const [formError, setFormError] = useState('');

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders?limit=5');
      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders || []);
      }
    } catch (err) {
      console.error('Error fetching reminders:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const handleComplete = async (id: string) => {
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: true }),
      });
      if (res.ok) {
        setReminders((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      console.error('Error completing reminder:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReminders((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      console.error('Error deleting reminder:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.title.trim()) {
      setFormError('Başlık zorunludur');
      return;
    }
    if (!formData.dueDate) {
      setFormError('Tarih zorunludur');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title.trim(),
          note: formData.note.trim() || null,
          dueDate: formData.dueDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || 'Bir hata oluştu');
        return;
      }

      setFormData({ title: '', note: '', dueDate: '' });
      setIsModalOpen(false);
      fetchReminders();
    } catch {
      setFormError('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  const dueDateClasses: Record<string, string> = {
    overdue: 'text-red-600 bg-red-50',
    today: 'text-amber-600 bg-amber-50',
    upcoming: 'text-primary-600 bg-primary-50',
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                <Bell className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-900">Yaklaşan Hatırlatmalar</h3>
                <p className="text-xs text-primary-500">
                  {reminders.length > 0
                    ? `${reminders.length} bekleyen hatırlatma`
                    : 'Hatırlatma yok'}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => setIsModalOpen(true)}>
              <Plus className="w-4 h-4" />
              Ekle
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : reminders.length === 0 ? (
            <p className="text-center text-primary-400 py-6 text-sm">
              Bekleyen hatırlatma bulunmuyor
            </p>
          ) : (
            <div className="space-y-2">
              {reminders.map((reminder) => {
                const status = getDueDateStatus(reminder.dueDate);
                return (
                  <div
                    key={reminder.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-primary-100 hover:bg-primary-50/50 transition-colors group"
                  >
                    {/* Complete button */}
                    <button
                      onClick={() => handleComplete(reminder.id)}
                      className="mt-0.5 w-5 h-5 rounded-full border-2 border-primary-300 hover:border-green-500 hover:bg-green-50 flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      title="Tamamla"
                    >
                      <Check className="w-3 h-3 text-transparent group-hover:text-green-500" />
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary-900 truncate">
                        {reminder.title}
                      </p>
                      {reminder.note && (
                        <p className="text-xs text-primary-500 mt-0.5 truncate">
                          {reminder.note}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${dueDateClasses[status]}`}
                        >
                          <Calendar className="w-3 h-3" />
                          {status === 'overdue' && 'Gecikmiş: '}
                          {status === 'today' && 'Bugün: '}
                          {formatDueDate(reminder.dueDate)}
                        </span>
                        {reminder.quote && (
                          <button
                            onClick={() => router.push(`/quotes/${reminder.quote!.id}`)}
                            className="inline-flex items-center gap-1 text-xs text-accent-600 hover:underline cursor-pointer"
                          >
                            <FileText className="w-3 h-3" />
                            {reminder.quote.quoteNumber}
                          </button>
                        )}
                        {reminder.project && (
                          <button
                            onClick={() => router.push(`/projects/${reminder.project!.id}`)}
                            className="inline-flex items-center gap-1 text-xs text-accent-600 hover:underline cursor-pointer"
                          >
                            <Folder className="w-3 h-3" />
                            {reminder.project.name}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(reminder.id)}
                      className="opacity-0 group-hover:opacity-100 text-primary-400 hover:text-red-500 cursor-pointer transition-all shrink-0"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Add Reminder Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setFormError('');
        }}
        title="Yeni Hatırlatma"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsModalOpen(false);
                setFormError('');
              }}
              disabled={isSaving}
            >
              İptal
            </Button>
            <Button onClick={handleSubmit} isLoading={isSaving}>
              Oluştur
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {formError}
            </div>
          )}

          <Input
            label="Başlık *"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Örn: Müşteri X ile görüşme"
            required
          />

          <Input
            label="Tarih *"
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
            required
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-primary-700">Not</label>
            <textarea
              value={formData.note}
              onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Ek bilgi..."
              rows={2}
              className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent resize-none"
            />
          </div>
        </form>
      </Modal>
    </>
  );
}
