'use client';

import {
  Building2,
  FolderKanban,
  CalendarDays,
  Save,
  SendHorizonal,
  FileDown,
  TrendingUp,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Input, Select, Card, Badge } from '@/components/ui';

// ── Types ──────────────────────────────────────────────────────────────────

type QuoteStatus =
  | 'TASLAK'
  | 'ONAY_BEKLIYOR'
  | 'ONAYLANDI'
  | 'GONDERILDI'
  | 'TAKIPTE'
  | 'REVIZYON'
  | 'KAZANILDI'
  | 'KAYBEDILDI'
  | 'IPTAL';

export interface QuoteEditorHeaderProps {
  quoteNumber: string;
  status: string;
  companyName: string;
  projectName?: string | null;
  systemBrand: string;
  date: string;
  currency: string;
  exchangeRate: number;
  protectionPct: number;
  language: string;
  validityDays: number;
  hasChanges: boolean;
  isSaving: boolean;
  onSystemBrandChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onExchangeRateChange: (value: number) => void;
  onProtectionPctChange: (value: number) => void;
  onLanguageChange: (value: string) => void;
  onValidityDaysChange: (value: number) => void;
  onSave: () => void;
  onSubmitForApproval?: () => void;
  onExport?: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

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

const currencyOptions = [
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'USD', label: 'USD - Dolar' },
  { value: 'GBP', label: 'GBP - Sterlin' },
  { value: 'TRY', label: 'TRY - Türk Lirası' },
];

// ── Component ──────────────────────────────────────────────────────────────

export function QuoteEditorHeader({
  quoteNumber,
  status,
  companyName,
  projectName,
  systemBrand,
  date,
  currency,
  exchangeRate,
  protectionPct,
  language,
  validityDays,
  hasChanges,
  isSaving,
  onSystemBrandChange,
  onCurrencyChange,
  onExchangeRateChange,
  onProtectionPctChange,
  onLanguageChange,
  onValidityDaysChange,
  onSave,
  onSubmitForApproval,
  onExport,
}: QuoteEditorHeaderProps) {
  const isEditable = status === 'TASLAK' || status === 'REVIZYON';

  return (
    <Card className="rounded-xl">
      {/* ── Row 1: Identity & Meta ──────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-primary-200 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {/* Left: Company / Project / System Brand */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 min-w-0">
          {/* Company */}
          <div className="flex items-center gap-1.5 text-sm text-primary-700">
            <Building2 className="h-4 w-4 shrink-0 text-primary-500" />
            <span className="font-medium truncate max-w-[200px]">{companyName}</span>
          </div>

          {/* Divider */}
          <span className="hidden sm:block h-4 w-px bg-primary-200" aria-hidden />

          {/* Project */}
          <div className="flex items-center gap-1.5 text-sm text-primary-600">
            <FolderKanban className="h-4 w-4 shrink-0 text-primary-400" />
            <span className="truncate max-w-[180px]">
              {projectName || 'Proje Yok'}
            </span>
          </div>

          {/* Divider */}
          <span className="hidden sm:block h-4 w-px bg-primary-200" aria-hidden />

          {/* System / Brand name – editable */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="system-brand"
              className="text-xs font-medium text-primary-500 whitespace-nowrap"
            >
              Marka ve Sistem Adı
            </label>
            <input
              id="system-brand"
              type="text"
              value={systemBrand}
              onChange={(e) => onSystemBrandChange(e.target.value)}
              disabled={!isEditable}
              placeholder="Sistem adı girin"
              className={cn(
                'px-2 py-1 border rounded-md text-sm text-primary-900 bg-white w-52',
                'placeholder:text-primary-400',
                'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow',
                !isEditable && 'bg-primary-50 cursor-not-allowed opacity-70',
                'border-primary-300'
              )}
            />
          </div>
        </div>

        {/* Right: Quote # / Status / Date */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-primary-900 tracking-wide">
            {quoteNumber}
          </span>

          <Badge status={status as QuoteStatus} />

          <div className="flex items-center gap-1.5 text-sm text-primary-600">
            <CalendarDays className="h-4 w-4 text-primary-400" />
            <span>{date}</span>
          </div>
        </div>
      </div>

      {/* ── Row 2: Controls ─────────────────────────────────────────────── */}
      <div className="px-5 py-3 flex flex-wrap items-end gap-x-5 gap-y-3">
        {/* Currency + Exchange Rate */}
        <div className="flex items-end gap-2">
          <div className="w-40">
            <Select
              label="Döviz"
              value={currency}
              onChange={(e) => onCurrencyChange(e.target.value)}
              options={currencyOptions}
              disabled={!isEditable}
            />
          </div>

          <div className="flex items-end gap-1.5">
            <div className="w-24">
              <Input
                label="Kur"
                type="number"
                step="0.0001"
                min={0}
                value={exchangeRate}
                onChange={(e) => onExchangeRateChange(parseFloat(e.target.value) || 0)}
                disabled={!isEditable}
              />
            </div>
            <TrendingUp className="mb-2.5 h-4 w-4 text-primary-400 shrink-0" />
          </div>
        </div>

        {/* Protection % */}
        <div className="flex items-end gap-1.5">
          <div className="w-20">
            <Input
              label="Koruma %"
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={protectionPct}
              onChange={(e) => onProtectionPctChange(parseFloat(e.target.value) || 0)}
              disabled={!isEditable}
            />
          </div>
          <ShieldCheck className="mb-2.5 h-4 w-4 text-primary-400 shrink-0" />
        </div>

        {/* Language Toggle */}
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-primary-700">Dil</span>
          <div className="flex rounded-lg border border-primary-300 overflow-hidden">
            <button
              type="button"
              onClick={() => onLanguageChange('TR')}
              disabled={!isEditable}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                language === 'TR'
                  ? 'bg-primary-700 text-white'
                  : 'bg-white text-primary-700 hover:bg-primary-50',
                !isEditable && 'opacity-70 cursor-not-allowed'
              )}
            >
              TR
            </button>
            <button
              type="button"
              onClick={() => onLanguageChange('EN')}
              disabled={!isEditable}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                language === 'EN'
                  ? 'bg-primary-700 text-white'
                  : 'bg-white text-primary-700 hover:bg-primary-50',
                !isEditable && 'opacity-70 cursor-not-allowed'
              )}
            >
              EN
            </button>
          </div>
        </div>

        {/* Validity Days */}
        <div className="flex items-end gap-1.5">
          <div className="w-20">
            <Input
              label="Geçerlilik"
              type="number"
              min={1}
              max={365}
              value={validityDays}
              onChange={(e) => onValidityDaysChange(parseInt(e.target.value, 10) || 30)}
              disabled={!isEditable}
            />
          </div>
          <span className="mb-2.5 text-xs text-primary-500 whitespace-nowrap">gün</span>
          <Clock className="mb-2.5 h-4 w-4 text-primary-400 shrink-0" />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-end gap-2">
          {onExport && (
            <Button variant="ghost" size="sm" onClick={onExport} title="Dışa Aktar">
              <FileDown className="h-4 w-4" />
              <span className="hidden lg:inline">Dışa Aktar</span>
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={onSave}
            isLoading={isSaving}
            disabled={!hasChanges || isSaving || !isEditable}
          >
            <Save className="h-4 w-4" />
            Kaydet
          </Button>

          {onSubmitForApproval && (
            <Button
              variant="primary"
              size="sm"
              onClick={onSubmitForApproval}
              disabled={hasChanges || !isEditable}
              title={hasChanges ? 'Önce değişiklikleri kaydedin' : 'Onaya Gönder'}
            >
              <SendHorizonal className="h-4 w-4" />
              Onaya Gönder
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
