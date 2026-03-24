'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check, Eye } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RefNoBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (refNo: string) => void;
  /** e.g. "Cansu Ceylan" → initials "CC" */
  userFullName: string;
  /** Auto-fill project field */
  projectName?: string;
  /** Parse existing refNo to pre-fill fields */
  currentRefNo?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SYSTEM_CODES = [
  { value: 'YAS', label: 'YAS - Yangın Algılama Sistemi' },
  { value: 'CCTV', label: 'CCTV - CCTV Sistemi' },
  { value: 'PAVA', label: 'PAVA - Acil Anons Sistemi' },
  { value: 'KGS', label: 'KGS - Kartlı Geçiş Sistemi' },
  { value: 'GAZ', label: 'GAZ - Gaz Algılama' },
  { value: 'SOND', label: 'SOND - Yangın Söndürme Sistemleri' },
  { value: 'DAS', label: 'DAS - Fiber Optik Çevre Güvenlik Sistemi' },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract initials from a full name: "Cansu Ceylan" → "CC" */
function getInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/**
 * Attempt to parse an existing refNo string back into its constituent parts.
 * Format: `CC0004 - PAVA.1 - EKOL YONCA - NOTE MUH - TYCO NEO`
 */
function parseRefNo(refNo: string): {
  initials: string;
  sequenceNumber: string;
  systemCode: string;
  revision: number;
  project: string;
  contractor: string;
  brand: string;
} | null {
  if (!refNo || !refNo.trim()) return null;

  const parts = refNo.split(/\s*-\s*/);
  if (parts.length < 2) return null;

  // Part 0: initials + sequence (e.g., "CC0004")
  const firstPart = parts[0].trim();
  const initialsMatch = firstPart.match(/^([A-Za-zÇçĞğİıÖöŞşÜü]+)(\d+)$/);

  let initials = '';
  let sequenceNumber = '0001';
  if (initialsMatch) {
    initials = initialsMatch[1].toUpperCase();
    sequenceNumber = initialsMatch[2];
  }

  // Part 1: system code with optional revision (e.g., "PAVA" or "YAS.2")
  let systemCode = '';
  let revision = 0;
  if (parts.length >= 2) {
    const systemPart = parts[1].trim();
    const sysMatch = systemPart.match(/^([A-Za-z]+)(?:\.(\d+))?$/);
    if (sysMatch) {
      systemCode = sysMatch[1].toUpperCase();
      revision = sysMatch[2] ? parseInt(sysMatch[2], 10) : 0;
    }
  }

  // Part 2: project
  const project = parts.length >= 3 ? parts[2].trim() : '';

  // Part 3: contractor
  const contractor = parts.length >= 4 ? parts[3].trim() : '';

  // Part 4: brand
  const brand = parts.length >= 5 ? parts[4].trim() : '';

  return { initials, sequenceNumber, systemCode, revision, project, contractor, brand };
}

// ── Component ──────────────────────────────────────────────────────────────

export function RefNoBuilderModal({
  isOpen,
  onClose,
  onConfirm,
  userFullName,
  projectName,
  currentRefNo,
}: RefNoBuilderModalProps) {
  const [initials, setInitials] = useState('');
  const [sequenceNumber, setSequenceNumber] = useState('0001');
  const [systemCode, setSystemCode] = useState('YAS');
  const [revision, setRevision] = useState(0);
  const [project, setProject] = useState('');
  const [contractor, setContractor] = useState('');
  const [brand, setBrand] = useState('');

  // Reset / pre-fill when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const parsed = currentRefNo ? parseRefNo(currentRefNo) : null;

    if (parsed) {
      setInitials(parsed.initials || getInitials(userFullName));
      setSequenceNumber(parsed.sequenceNumber || '0001');
      // Only set system code if it matches a known code
      const knownCode = SYSTEM_CODES.find((s) => s.value === parsed.systemCode);
      setSystemCode(knownCode ? parsed.systemCode : 'YAS');
      setRevision(parsed.revision);
      setProject(parsed.project || projectName || '');
      setContractor(parsed.contractor);
      setBrand(parsed.brand);
    } else {
      setInitials(getInitials(userFullName));
      setSequenceNumber('0001');
      setSystemCode('YAS');
      setRevision(0);
      setProject(projectName || '');
      setContractor('');
      setBrand('');
    }
  }, [isOpen, userFullName, projectName, currentRefNo]);

  // ── Build the ref code ─────────────────────────────────────────────────

  const generatedRefNo = useMemo(() => {
    const paddedSeq = sequenceNumber.padStart(4, '0');
    const base = `${initials}${paddedSeq}`;
    const systemPart = revision > 0 ? `${systemCode}.${revision}` : systemCode;

    const parts = [base, systemPart];
    if (project.trim()) parts.push(project.trim());
    if (contractor.trim()) parts.push(contractor.trim());
    if (brand.trim()) parts.push(brand.trim());

    return parts.join(' - ');
  }, [initials, sequenceNumber, systemCode, revision, project, contractor, brand]);

  // ── Validation ─────────────────────────────────────────────────────────

  const isValid = useMemo(() => {
    return initials.length >= 2 && initials.length <= 4 && sequenceNumber.length > 0;
  }, [initials, sequenceNumber]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(generatedRefNo);
    onClose();
  };

  const handleSequenceChange = (value: string) => {
    // Only allow digits, max 4 characters
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    setSequenceNumber(cleaned);
  };

  const handleInitialsChange = (value: string) => {
    // Only allow letters, max 4 characters
    const cleaned = value.replace(/[^A-Za-zÇçĞğİıÖöŞşÜü]/g, '').toUpperCase().slice(0, 4);
    setInitials(cleaned);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Referans No Oluşturucu"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            İptal
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!isValid}>
            <Check className="h-4 w-4" />
            Uygula
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ── Row 1: Initials + Sequence ──────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1.5">
              Oluşturan Kısaltma
            </label>
            <input
              type="text"
              value={initials}
              onChange={(e) => handleInitialsChange(e.target.value)}
              placeholder="CC"
              maxLength={4}
              className={cn(
                'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 uppercase tracking-wider font-mono',
                'placeholder:text-primary-400',
                'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow',
                'border-primary-300',
                initials.length < 2 && initials.length > 0 && 'border-red-300'
              )}
            />
            <p className="text-xs text-primary-500 mt-1">
              2-4 karakter ({userFullName} &rarr; {getInitials(userFullName)})
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1.5">
              Sıra Numarası
            </label>
            <input
              type="text"
              value={sequenceNumber}
              onChange={(e) => handleSequenceChange(e.target.value)}
              placeholder="0001"
              maxLength={4}
              className={cn(
                'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 font-mono tabular-nums',
                'placeholder:text-primary-400',
                'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow',
                'border-primary-300'
              )}
            />
            <p className="text-xs text-primary-500 mt-1">
              4 haneli numara (ör. 0001, 0042)
            </p>
          </div>
        </div>

        {/* ── Row 2: System Code + Revision ───────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1.5">
              Sistem Kodu
            </label>
            <select
              value={systemCode}
              onChange={(e) => setSystemCode(e.target.value)}
              className={cn(
                'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 bg-white',
                'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow',
                'border-primary-300 cursor-pointer'
              )}
            >
              {SYSTEM_CODES.map((code) => (
                <option key={code.value} value={code.value}>
                  {code.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1.5">
              Revizyon
            </label>
            <input
              type="number"
              min={0}
              max={99}
              value={revision}
              onChange={(e) => setRevision(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className={cn(
                'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 font-mono tabular-nums',
                'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow',
                'border-primary-300'
              )}
            />
            <p className="text-xs text-primary-500 mt-1">
              0 = ilk versiyon, 1+ = revizyon (.1, .2, ...)
            </p>
          </div>
        </div>

        {/* ── Row 3: Project ──────────────────────────────────────── */}
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1.5">
            Proje Adı
          </label>
          <input
            type="text"
            value={project}
            onChange={(e) => setProject(e.target.value.toUpperCase())}
            placeholder="ör. EKOL YONCA BEYMEN FAZ1"
            className={cn(
              'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 uppercase',
              'placeholder:text-primary-400 placeholder:normal-case',
              'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow',
              'border-primary-300'
            )}
          />
        </div>

        {/* ── Row 4: Contractor + Brand ───────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1.5">
              Yüklenici
              <span className="text-primary-400 font-normal ml-1">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={contractor}
              onChange={(e) => setContractor(e.target.value.toUpperCase())}
              placeholder="ör. NOTE MUH"
              className={cn(
                'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 uppercase',
                'placeholder:text-primary-400 placeholder:normal-case',
                'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow',
                'border-primary-300'
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1.5">
              Marka
              <span className="text-primary-400 font-normal ml-1">(opsiyonel)</span>
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value.toUpperCase())}
              placeholder="ör. TYCO NEO"
              className={cn(
                'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 uppercase',
                'placeholder:text-primary-400 placeholder:normal-case',
                'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow',
                'border-primary-300'
              )}
            />
          </div>
        </div>

        {/* ── Preview ─────────────────────────────────────────────── */}
        <div className="bg-primary-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-primary-500" />
            <span className="text-xs font-semibold text-primary-600 uppercase tracking-wider">
              Ön İzleme
            </span>
          </div>
          <div className="bg-white border-2 border-accent-300 rounded-lg px-4 py-3">
            <span className="font-mono text-sm font-semibold text-primary-900 break-all">
              {generatedRefNo}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
