'use client';

import { useState, useEffect, useMemo } from 'react';
import { Check, Eye } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  DEFAULT_REFNO_OPTIONS,
  type RefNoOption,
  type RefNoOptionGroups,
} from '@/lib/refno-options';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RefNoBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (refNo: string) => void;
  userFullName: string;
  projectName?: string;
  currentRefNo?: string;
}

// Constants moved to `src/lib/refno-options.ts`. The modal fetches the
// admin-overridable lists from the API at open time and falls back to
// the defaults if the fetch fails.

// ── User → C code mapping ─────────────────────────────────────────────────

/** Map logged-in user's full name to the closest C (Kişi) code */
function guessPersonCode(fullName: string): string {
  const lower = fullName.toLowerCase();
  if (lower.includes('levent')) return '1';
  if (lower.includes('selale') || lower.includes('şelale')) return '2';
  if (lower.includes('serhat')) return '5';
  if (lower.includes('cansu')) return '9';
  // Default: first available
  return '1';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseRefNo(refNo: string): { a: string; b: string[]; c: string; d: string[] } | null {
  if (!refNo || refNo.trim().length < 2) return null;
  const clean = refNo.trim();
  // Format: A digit, then B digit(s), then C digit, then D letter(s)
  // e.g. "235M", "2159AB", "21359ACV"
  // Strategy: first char = A, last char(s) after digits = D, second-to-last digit = C, middle digits = B
  const match = clean.match(/^(\d)([\d]+)([A-Z]+)$/i);
  if (!match) return null;
  const aVal = match[1];
  const middleDigits = match[2]; // contains B values + C (last digit)
  const dChars = match[3].toUpperCase();
  if (middleDigits.length < 1) return null;
  const cVal = middleDigits[middleDigits.length - 1];
  const bDigits = middleDigits.slice(0, -1);
  return {
    a: aVal,
    b: bDigits.split(''),
    c: cVal,
    d: dChars.split(''),
  };
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
  const defaultC = useMemo(() => guessPersonCode(userFullName), [userFullName]);

  const [a, setA] = useState('');
  const [b, setB] = useState<string[]>([]);
  const [c, setC] = useState('');
  const [d, setD] = useState<string[]>([]);
  // Option lists are admin-editable; fetched on open. Defaults keep
  // the modal usable if the fetch fails (offline, perm error, etc.).
  const [groups, setGroups] = useState<RefNoOptionGroups>(DEFAULT_REFNO_OPTIONS);

  const toggleB = (val: string) => setB(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val].sort());
  const toggleD = (val: string) => setD(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val].sort());

  // Fetch admin-edited options when modal opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/settings/refno-options')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.options) setGroups(data.options);
      })
      .catch(() => {
        // Defaults already in state; nothing else to do.
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Reset / pre-fill when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const parsed = currentRefNo ? parseRefNo(currentRefNo) : null;
    if (parsed) {
      setA(parsed.a);
      setB(parsed.b);
      setC(parsed.c);
      setD(parsed.d);
    } else {
      setA('');
      setB([]);
      setC(defaultC);
      setD([]);
    }
  }, [isOpen, currentRefNo, defaultC]);

  const isValid = a !== '' && b.length > 0 && c !== '' && d.length > 0;

  const generatedRefNo = useMemo(() => {
    if (!isValid) return '____';
    return `${a}${b.join('')}${c}${d.join('')}`;
  }, [a, b, c, d, isValid]);

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(generatedRefNo);
    onClose();
  };

  // Decode for display
  const decodedA = groups.a.find(x => x.value === a)?.label || a;
  const decodedB = b.map(v => groups.b.find(x => x.value === v)?.label || v).join(', ');
  const decodedC = groups.c.find(x => x.value === c)?.label || c;
  const decodedD = d.map(v => groups.d.find(x => x.value === v)?.label || v).join(', ');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fatura Kodlama Sistemi"
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
        {/* A - BTS Bölüm */}
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1.5">
            A — BTS Bölüm
          </label>
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            className={cn(
              'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 bg-white',
              'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
              'border-primary-300 cursor-pointer'
            )}
          >
            <option value="">Seçiniz...</option>
            {groups.a.map((opt: RefNoOption) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* B - Konu (multi-select) */}
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1.5">
            B — Konu <span className="text-primary-400 font-normal">(birden fazla seçilebilir)</span>
          </label>
          <div className="border border-primary-300 rounded-lg p-2 grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
            {groups.b.map((opt: RefNoOption) => (
              <label key={opt.value} className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors',
                b.includes(opt.value) ? 'bg-accent-50 text-accent-900' : 'hover:bg-primary-50 text-primary-700'
              )}>
                <input
                  type="checkbox"
                  checked={b.includes(opt.value)}
                  onChange={() => toggleB(opt.value)}
                  className="rounded border-primary-300 text-accent-600 focus:ring-accent-500"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* C - Kişi */}
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1.5">
            C — Kişi
          </label>
          <select
            value={c}
            onChange={(e) => setC(e.target.value)}
            className={cn(
              'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 bg-white',
              'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent',
              'border-primary-300 cursor-pointer'
            )}
          >
            <option value="">Seçiniz...</option>
            {groups.c.map((opt: RefNoOption) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* D - Üretici (multi-select) */}
        <div>
          <label className="block text-sm font-medium text-primary-700 mb-1.5">
            D — Üretici <span className="text-primary-400 font-normal">(birden fazla seçilebilir)</span>
          </label>
          <div className="border border-primary-300 rounded-lg p-2 grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
            {groups.d.map((opt: RefNoOption) => (
              <label key={opt.value} className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors',
                d.includes(opt.value) ? 'bg-accent-50 text-accent-900' : 'hover:bg-primary-50 text-primary-700'
              )}>
                <input
                  type="checkbox"
                  checked={d.includes(opt.value)}
                  onChange={() => toggleD(opt.value)}
                  className="rounded border-primary-300 text-accent-600 focus:ring-accent-500"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="bg-primary-50 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-primary-500" />
            <span className="text-xs font-semibold text-primary-600 uppercase tracking-wider">
              Ön İzleme
            </span>
          </div>
          <div className="bg-white border-2 border-accent-300 rounded-lg px-4 py-3">
            <span className="font-mono text-lg font-bold text-primary-900 tracking-widest">
              {generatedRefNo}
            </span>
          </div>
          <div className="mt-3 text-xs text-primary-500 space-y-0.5">
            <p><span className="font-medium">A:</span> {decodedA}</p>
            <p><span className="font-medium">B:</span> {decodedB}</p>
            <p><span className="font-medium">C:</span> {decodedC}</p>
            <p><span className="font-medium">D:</span> {decodedD}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
