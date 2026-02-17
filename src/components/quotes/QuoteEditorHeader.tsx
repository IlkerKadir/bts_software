'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Building2,
  FolderKanban,
  CalendarDays,
  Save,
  SendHorizonal,
  FileDown,
  Eye,
  TrendingUp,
  ShieldCheck,
  Clock,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, Input, Select, Card, Badge } from '@/components/ui';
import { ExchangeRateModal } from './ExchangeRateModal';
import { PdfPreviewModal } from './PdfPreviewModal';

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

interface ProjectOption {
  id: string;
  name: string;
  client?: { id: string; name: string };
}

export interface QuoteEditorHeaderProps {
  quoteId: string;
  quoteNumber: string;
  status: string;
  companyName: string;
  companyId: string;
  projectId?: string | null;
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
  onProjectChange: (projectId: string | null) => void;
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
  quoteId,
  quoteNumber,
  status,
  companyName,
  companyId,
  projectId,
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
  onProjectChange,
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

  // Project selection state
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Exchange rate modal state
  const [showExchangeRateModal, setShowExchangeRateModal] = useState(false);

  // PDF preview modal state
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
    }
    if (showProjectDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showProjectDropdown]);

  // Fetch all active projects (a quote can be for any project, sent to any company)
  useEffect(() => {
    async function fetchProjects() {
      setIsLoadingProjects(true);
      try {
        const res = await fetch('/api/projects?status=TEKLIF_ASAMASINDA,ONAYLANDI,DEVAM_EDIYOR');
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setIsLoadingProjects(false);
      }
    }
    fetchProjects();
  }, []);

  const handleProjectSelect = (id: string | null) => {
    onProjectChange(id);
    setShowProjectDropdown(false);
  };

  // Get current project name (from props or from loaded projects)
  const currentProjectName = projectName ||
    (projectId ? projects.find(p => p.id === projectId)?.name : null) ||
    'Proje Yok';

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

          {/* Project Selector */}
          <div className="flex items-center gap-1">
            <div className="relative" ref={projectDropdownRef}>
              <button
                type="button"
                onClick={() => isEditable && setShowProjectDropdown(!showProjectDropdown)}
                disabled={!isEditable}
                className={cn(
                  'flex items-center gap-1.5 text-sm text-primary-600 px-2 py-1 rounded-md transition-colors',
                  isEditable && 'hover:bg-primary-100 cursor-pointer',
                  !isEditable && 'cursor-default'
                )}
              >
                <FolderKanban className="h-4 w-4 shrink-0 text-primary-400" />
                <span className="truncate max-w-[180px]">
                  {currentProjectName}
                </span>
                {isEditable && (
                  <ChevronDown className={cn(
                    'h-3.5 w-3.5 text-primary-400 transition-transform',
                    showProjectDropdown && 'rotate-180'
                  )} />
                )}
              </button>

            {/* Dropdown */}
            {showProjectDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-primary-200 rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                {/* No project option */}
                <button
                  type="button"
                  onClick={() => handleProjectSelect(null)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-primary-50 cursor-pointer',
                    !projectId && 'bg-primary-100 font-medium'
                  )}
                >
                  Proje Yok
                </button>

                {isLoadingProjects ? (
                  <div className="px-3 py-2 text-sm text-primary-500">
                    Yükleniyor...
                  </div>
                ) : projects.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-primary-500">
                    Aktif proje bulunamadı
                  </div>
                ) : (
                  projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => handleProjectSelect(project.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm hover:bg-primary-50 cursor-pointer',
                        projectId === project.id && 'bg-primary-100 font-medium'
                      )}
                    >
                      <div className="font-medium">{project.name}</div>
                      {project.client && (
                        <div className="text-xs text-primary-500">{project.client.name}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            </div>

            {/* Link to project details */}
            {projectId && (
              <Link
                href={`/projects/${projectId}`}
                className="p-1 rounded hover:bg-primary-100 transition-colors"
                title="Proje detaylarını görüntüle"
              >
                <ExternalLink className="h-3.5 w-3.5 text-primary-400" />
              </Link>
            )}
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
        {/* Currency */}
        <div className="w-40">
          <Select
            label="Döviz"
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            options={currencyOptions}
            disabled={!isEditable}
          />
        </div>

        {/* Exchange Rate + Protection – opens modal */}
        <div className="flex flex-col">
          <span className="text-sm font-medium text-primary-700 mb-1.5">Kur</span>
          <button
            type="button"
            onClick={() => isEditable && setShowExchangeRateModal(true)}
            disabled={!isEditable}
            className={cn(
              'flex items-center gap-2 px-3 py-2 border-2 rounded-lg text-sm transition-all',
              isEditable
                ? 'border-accent-300 bg-accent-50 hover:border-accent-500 hover:bg-accent-100 hover:shadow-sm cursor-pointer'
                : 'border-primary-200 bg-primary-50 cursor-not-allowed opacity-70'
            )}
          >
            <TrendingUp className="h-4 w-4 text-accent-600" />
            <span className="font-mono tabular-nums font-semibold text-primary-900">
              {exchangeRate.toLocaleString('tr-TR', {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}
            </span>
            {protectionPct > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-white bg-accent-600 px-1.5 py-0.5 rounded">
                <ShieldCheck className="h-3 w-3" />
                %{protectionPct}
              </span>
            )}
            {isEditable && (
              <ChevronDown className="h-3.5 w-3.5 text-accent-400 ml-1" />
            )}
          </button>
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
          <Button variant="ghost" size="sm" onClick={() => setShowPdfPreview(true)} title="Ön İzleme">
            <Eye className="h-4 w-4" />
            <span className="hidden lg:inline">Ön İzleme</span>
          </Button>

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

      {/* Exchange Rate Modal */}
      <ExchangeRateModal
        isOpen={showExchangeRateModal}
        onClose={() => setShowExchangeRateModal(false)}
        currency={currency}
        currentRate={exchangeRate}
        currentProtectionPct={protectionPct}
        onApply={(newRate, newProtectionPct) => {
          onExchangeRateChange(newRate);
          onProtectionPctChange(newProtectionPct);
        }}
      />

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={showPdfPreview}
        onClose={() => setShowPdfPreview(false)}
        quoteId={quoteId}
      />
    </Card>
  );
}
