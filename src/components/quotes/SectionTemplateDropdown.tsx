'use client';

import { useState, useRef, useEffect } from 'react';
import { LayoutTemplate, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui';

export type SectionTemplate =
  | 'MUHENDISLIK_SET'
  | 'MUHENDISLIK_KISI_GUN'
  | 'MONTAJ_PER_ITEM'
  | 'MONTAJ_TEMINI_VE_MONTAJI'
  | 'GRAFIK_IZLEME';

const templates: { key: SectionTemplate; label: string; description: string }[] = [
  {
    key: 'MUHENDISLIK_SET',
    label: 'Müh. Test ve Devreye Alma (SET)',
    description: 'Başlık + SET satırı + maliyet alt-satırları',
  },
  {
    key: 'MUHENDISLIK_KISI_GUN',
    label: 'Müh. Test ve Devreye Alma (Kişi/Gün)',
    description: 'Başlık + Kişi/Gün satırları',
  },
  {
    key: 'MONTAJ_PER_ITEM',
    label: 'Montaj ve İşçilik (kalem bazlı)',
    description: 'Başlık + montaj satırları için boş bölüm',
  },
  {
    key: 'MONTAJ_TEMINI_VE_MONTAJI',
    label: 'Montaj ve İşçilik (temini ve montajı)',
    description: 'Başlık + malzeme temini ve montajı satırları',
  },
  {
    key: 'GRAFIK_IZLEME',
    label: 'Grafik İzleme Yazılım Çalışmaları',
    description: 'Başlık + SET satırı + otomatik not',
  },
];

interface Props {
  onSelect: (template: SectionTemplate) => void;
}

export function SectionTemplateDropdown({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(!open)}>
        <LayoutTemplate className="h-4 w-4" />
        Bölüm Ekle
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-primary-200 rounded-lg shadow-lg z-50 py-1">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { onSelect(t.key); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-primary-50 cursor-pointer transition-colors"
            >
              <div className="text-sm font-medium text-primary-800">{t.label}</div>
              <div className="text-xs text-primary-500">{t.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
