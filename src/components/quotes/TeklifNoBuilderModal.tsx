'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check, Eye } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { parseQuoteNumber } from '@/lib/quote-number';

export interface TeklifNoBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (quoteNumber: string) => void;
  currentQuoteNumber: string;
  userFullName?: string;
}

const SYSTEM_CODES = [
  { value: 'YAS', label: 'YAS - Yangın Algılama Sistemi' },
  { value: 'CCTV', label: 'CCTV - CCTV Sistemi' },
  { value: 'PAVA', label: 'PAVA - Acil Anons Sistemi' },
  { value: 'KGS', label: 'KGS - Kartlı Geçiş Sistemi' },
  { value: 'GAZ', label: 'GAZ - Gaz Algılama' },
  { value: 'SOND', label: 'SOND - Yangın Söndürme Sistemleri' },
  { value: 'DAS', label: 'DAS - Fiber Optik / Çevre Güvenlik' },
  { value: 'YALIT', label: 'YALIT - Yalıtım' },
  { value: 'SESLEN', label: 'SESLEN - Seslendirme' },
];

export function TeklifNoBuilderModal({
  isOpen,
  onClose,
  onConfirm,
  currentQuoteNumber,
  userFullName,
}: TeklifNoBuilderModalProps) {
  const [initials, setInitials] = useState('');
  const [sequence, setSequence] = useState('0001');
  const [systemCode, setSystemCode] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    const defaultInitials = userFullName
      ? userFullName.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase()).join('')
      : '';

    const parsed = parseQuoteNumber(currentQuoteNumber);
    if (parsed) {
      setInitials(parsed.initials || defaultInitials);
      setSequence(String(parsed.sequence).padStart(4, '0'));
      setSystemCode(parsed.systemCode || '');
      setRevision(parsed.revision);
    } else {
      setInitials(defaultInitials);
      setSequence('0001');
      setSystemCode('');
      setRevision(0);
    }
  }, [isOpen, currentQuoteNumber, userFullName]);

  const generatedNo = useMemo(() => {
    const seq = sequence.padStart(4, '0');
    let result = `${initials}${seq}`;
    if (systemCode) {
      result += `-${systemCode}`;
      if (revision > 0) result += `.${revision}`;
    }
    return result;
  }, [initials, sequence, systemCode, revision]);

  const handleConfirm = () => {
    onConfirm(generatedNo);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Teklif No Düzenle"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>İptal</Button>
          <Button variant="primary" onClick={handleConfirm}>
            <Check className="h-4 w-4" />
            Uygula
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Row 1: Initials + Sequence (read-only context) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1.5">Kısaltma</label>
            <input
              type="text"
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-ZÇĞİÖŞÜ]/gi, '').slice(0, 4))}
              className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1.5">Sıra No</label>
            <input
              type="text"
              value={sequence}
              onChange={(e) => setSequence(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>
        </div>

        {/* Row 2: System Code */}
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1.5">Sistem Kodu</label>
          <select
            value={systemCode}
            onChange={(e) => setSystemCode(e.target.value)}
            className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="">Seçiniz (opsiyonel)...</option>
            {SYSTEM_CODES.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Row 3: Revision */}
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1.5">Revizyon</label>
          <input
            type="number"
            min={0}
            max={99}
            value={revision}
            onChange={(e) => setRevision(Math.max(0, parseInt(e.target.value, 10) || 0))}
            className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <p className="text-xs text-primary-500 mt-1">0 = ilk versiyon, 1+ = revizyon (.1, .2, ...)</p>
        </div>

        {/* Preview */}
        <div className="bg-primary-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-primary-500" />
            <span className="text-xs font-semibold text-primary-600 uppercase tracking-wider">Ön İzleme</span>
          </div>
          <div className="bg-white border-2 border-accent-300 rounded-lg px-4 py-3">
            <span className="font-mono text-lg font-bold text-primary-900 tracking-wider">
              {generatedNo}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
