'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button, Modal, Input } from '@/components/ui';

interface AddReminderButtonProps {
  quoteId?: string;
  projectId?: string;
  /** Display label next to the icon. */
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function AddReminderButton({
  quoteId,
  projectId,
  label = 'Hatırlatma Ekle',
  variant = 'secondary',
  size = 'sm',
}: AddReminderButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    note: '',
    dueDate: '',
  });

  const resetForm = () => {
    setFormData({ title: '', note: '', dueDate: '' });
    setFormError('');
    setSuccess(false);
  };

  const handleOpen = () => {
    resetForm();
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetForm();
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
          quoteId: quoteId || null,
          projectId: projectId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || 'Bir hata oluştu');
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1000);
    } catch {
      setFormError('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={handleOpen}>
        <Bell className="w-4 h-4" />
        {label}
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Hatırlatma Ekle"
        size="sm"
        footer={
          success ? null : (
            <>
              <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
                İptal
              </Button>
              <Button onClick={handleSubmit} isLoading={isSaving}>
                Oluştur
              </Button>
            </>
          )
        }
      >
        {success ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Bell className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-700">Hatırlatma oluşturuldu</p>
          </div>
        ) : (
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
              placeholder="Örn: Müşteri ile görüşme yap"
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
        )}
      </Modal>
    </>
  );
}
