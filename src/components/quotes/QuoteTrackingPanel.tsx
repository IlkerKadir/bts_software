'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Input, Select, Modal } from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import {
  QUOTE_PRIORITIES,
  LOST_REASONS,
  LOST_REASON_LABELS,
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABELS,
} from '@/lib/validations/quote-tracking';

export interface TrackingValues {
  priority: string | null;
  successPct: number | null;
  expectedOrderDate: string | null;
  lostReason: string | null;
  lostCompetitor: string | null;
}

interface Interaction {
  id: string;
  interactionDate: string;
  type: string;
  note: string;
  reminderDate: string | null;
  user: { id: string; fullName: string };
}

interface QuoteTrackingPanelProps {
  quoteId: string;
  status: string;
  isOpen: boolean;
  onClose: () => void;
  initial: TrackingValues;
  /** Notify the parent so the detail page can reflect saved static fields. */
  onSaved?: (values: TrackingValues) => void;
}

const toDateInput = (iso: string | null): string => (iso ? iso.split('T')[0] : '');
const todayInput = (): string => new Date().toISOString().split('T')[0];

const priorityOptions = [
  { value: '', label: '—' },
  ...QUOTE_PRIORITIES.map((p) => ({ value: p, label: p })),
];
const lostReasonOptions = [
  { value: '', label: 'Seçiniz...' },
  ...LOST_REASONS.map((r) => ({ value: r, label: LOST_REASON_LABELS[r] })),
];
const interactionTypeOptions = INTERACTION_TYPES.map((t) => ({
  value: t,
  label: INTERACTION_TYPE_LABELS[t],
}));

export function QuoteTrackingPanel({
  quoteId,
  status,
  isOpen,
  onClose,
  initial,
  onSaved,
}: QuoteTrackingPanelProps) {
  const isLost = status === 'KAYBEDILDI';

  // Static (overwrite) fields
  const [priority, setPriority] = useState(initial.priority ?? '');
  const [successPct, setSuccessPct] = useState(
    initial.successPct != null ? String(initial.successPct) : ''
  );
  const [expectedOrderDate, setExpectedOrderDate] = useState(toDateInput(initial.expectedOrderDate));
  const [lostReason, setLostReason] = useState(initial.lostReason ?? '');
  const [lostCompetitor, setLostCompetitor] = useState(initial.lostCompetitor ?? '');
  const [savingStatic, setSavingStatic] = useState(false);
  const [staticError, setStaticError] = useState('');
  const [staticSaved, setStaticSaved] = useState(false);

  // Interaction log
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [newType, setNewType] = useState<string>(INTERACTION_TYPES[0]);
  const [newDate, setNewDate] = useState(todayInput());
  const [newNote, setNewNote] = useState('');
  const [newReminder, setNewReminder] = useState('');
  const [addingLog, setAddingLog] = useState(false);
  const [logError, setLogError] = useState('');

  // Re-seed the static form whenever the panel (re)opens.
  useEffect(() => {
    if (!isOpen) return;
    setPriority(initial.priority ?? '');
    setSuccessPct(initial.successPct != null ? String(initial.successPct) : '');
    setExpectedOrderDate(toDateInput(initial.expectedOrderDate));
    setLostReason(initial.lostReason ?? '');
    setLostCompetitor(initial.lostCompetitor ?? '');
    setStaticSaved(false);
    setStaticError('');
  }, [isOpen, initial]);

  const fetchLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/interactions`);
      const data = await res.json();
      if (res.ok) setInteractions(data.interactions || []);
    } catch (err) {
      console.error('Fetch interactions error:', err);
    } finally {
      setLoadingLog(false);
    }
  }, [quoteId]);

  useEffect(() => {
    if (isOpen) fetchLog();
  }, [isOpen, fetchLog]);

  const handleSaveStatic = async () => {
    setSavingStatic(true);
    setStaticError('');
    setStaticSaved(false);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priority: priority || null,
          successPct: successPct === '' ? null : Number(successPct),
          expectedOrderDate: expectedOrderDate || null,
          lostReason: isLost ? lostReason || null : null,
          lostCompetitor: isLost ? lostCompetitor || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStaticError(data.error || 'Kaydedilemedi');
        return;
      }
      setStaticSaved(true);
      onSaved?.({
        priority: priority || null,
        successPct: successPct === '' ? null : Number(successPct),
        expectedOrderDate: expectedOrderDate || null,
        lostReason: isLost ? lostReason || null : null,
        lostCompetitor: isLost ? lostCompetitor || null : null,
      });
    } catch {
      setStaticError('Sunucu ile bağlantı kurulamadı');
    } finally {
      setSavingStatic(false);
    }
  };

  const handleAddInteraction = async () => {
    if (!newNote.trim()) {
      setLogError('İletişim notu gereklidir');
      return;
    }
    setAddingLog(true);
    setLogError('');
    try {
      const res = await fetch(`/api/quotes/${quoteId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: newType,
          note: newNote,
          interactionDate: newDate || null,
          reminderDate: newReminder || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLogError(data.error || 'Eklenemedi');
        return;
      }
      setInteractions((prev) => [data.interaction, ...prev]);
      setNewNote('');
      setNewReminder('');
      setNewType(INTERACTION_TYPES[0]);
      setNewDate(todayInput());
    } catch {
      setLogError('Sunucu ile bağlantı kurulamadı');
    } finally {
      setAddingLog(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Teklif Takip" size="lg">
      <div className="space-y-6">
        {/* ── Static fields ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-primary-800">Genel Durum</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Önem Sırası"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              options={priorityOptions}
            />
            <Input
              label="Başarı Yüzdesi (%)"
              type="number"
              min={0}
              max={100}
              step={1}
              value={successPct}
              onChange={(e) => setSuccessPct(e.target.value)}
              placeholder="0-100"
            />
            <Input
              label="Beklenen Sipariş Tarihi"
              type="date"
              value={expectedOrderDate}
              onChange={(e) => setExpectedOrderDate(e.target.value)}
            />
          </div>

          {isLost && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-red-50 border border-red-200 p-3">
              <Select
                label="Kaybedilme Nedeni"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                options={lostReasonOptions}
              />
              <Input
                label="Tercih Edilen Rakip"
                value={lostCompetitor}
                onChange={(e) => setLostCompetitor(e.target.value)}
                placeholder="Rakip firma / marka"
              />
            </div>
          )}

          {staticError && <p className="text-sm text-red-600">{staticError}</p>}
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveStatic} isLoading={savingStatic}>
              Durumu Kaydet
            </Button>
            {staticSaved && <span className="text-sm text-green-700">Kaydedildi ✓</span>}
          </div>
        </section>

        {/* ── New interaction ── */}
        <section className="space-y-3 border-t border-primary-200 pt-4">
          <h3 className="text-sm font-semibold text-primary-800">Yeni İletişim Kaydı</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="İletişim Tipi"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              options={interactionTypeOptions}
            />
            <Input
              label="İletişim Tarihi"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
            <Input
              label="Hatırlatıcı (Takip)"
              type="date"
              value={newReminder}
              onChange={(e) => setNewReminder(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-primary-700">İletişim Notu</label>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              placeholder="Görüşme notu..."
              className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
          </div>
          {logError && <p className="text-sm text-red-600">{logError}</p>}
          <Button variant="secondary" onClick={handleAddInteraction} isLoading={addingLog}>
            + İletişim Ekle
          </Button>
        </section>

        {/* ── Interaction history ── */}
        <section className="space-y-2 border-t border-primary-200 pt-4">
          <h3 className="text-sm font-semibold text-primary-800">İletişim Geçmişi</h3>
          {loadingLog ? (
            <p className="text-sm text-primary-500">Yükleniyor...</p>
          ) : interactions.length === 0 ? (
            <p className="text-sm text-primary-400">Henüz iletişim kaydı yok.</p>
          ) : (
            <ul className="space-y-2">
              {interactions.map((it) => (
                <li key={it.id} className="rounded-lg border border-primary-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-primary-500">
                    <span className="font-medium text-primary-700">
                      {INTERACTION_TYPE_LABELS[it.type as keyof typeof INTERACTION_TYPE_LABELS] || it.type}
                    </span>
                    <span>·</span>
                    <span>{formatDate(it.interactionDate)}</span>
                    <span>·</span>
                    <span>{it.user?.fullName}</span>
                    {it.reminderDate && (
                      <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                        Hatırlatıcı: {formatDate(it.reminderDate)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-primary-800">{it.note}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
