'use client';

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { FileText, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const TERM_CATEGORIES = [
  { key: 'uretici_firmalar', label: 'Üretici Firmalar' },
  { key: 'onaylar', label: 'Onaylar' },
  { key: 'garanti', label: 'Garanti' },
  { key: 'teslim_yeri', label: 'Teslim Yeri' },
  { key: 'odeme', label: 'Ödeme' },
  { key: 'kdv', label: 'KDV' },
  { key: 'teslimat', label: 'Teslimat' },
  { key: 'opsiyon', label: 'Opsiyon' },
] as const;

type CategoryKey = (typeof TERM_CATEGORIES)[number]['key'];

interface TermData {
  id?: string;
  category: string;
  value: string;
  sortOrder: number;
}

interface TemplateOption {
  name: string;
  value: string;
}

export interface CommercialTermsSectionHandle {
  save: () => Promise<void>;
  hasChanges: () => boolean;
}

interface CommercialTermsSectionProps {
  quoteId: string;
  initialTerms?: TermData[];
  onTermsChange?: () => void;
}

export const CommercialTermsSection = forwardRef<CommercialTermsSectionHandle, CommercialTermsSectionProps>(function CommercialTermsSection({
  quoteId,
  initialTerms,
  onTermsChange,
}: CommercialTermsSectionProps, ref) {
  // Terms state: map of category key -> value
  const [terms, setTerms] = useState<Record<string, string>>({});
  // Snapshot of saved terms for reset functionality
  const [savedTerms, setSavedTerms] = useState<Record<string, string>>({});
  // Templates cache: map of category key -> template options
  const [templates, setTemplates] = useState<
    Record<string, TemplateOption[]>
  >({});
  // Track which categories have had templates fetched
  const fetchedCategories = useRef<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<CategoryKey>('uretici_firmalar');
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize terms from initialTerms prop
  useEffect(() => {
    if (initialTerms && initialTerms.length > 0) {
      const termsMap: Record<string, string> = {};
      for (const term of initialTerms) {
        termsMap[term.category] = term.value;
      }
      setTerms(termsMap);
      setSavedTerms(termsMap);
    }
  }, [initialTerms]);

  // Fetch terms from API if no initialTerms provided
  useEffect(() => {
    if (!initialTerms) {
      fetchTerms();
    }
  }, [quoteId, initialTerms]);

  const fetchTerms = async () => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/terms`);
      if (!response.ok) throw new Error('Ticari şartlar yüklenemedi');
      const data = await response.json();
      const termsMap: Record<string, string> = {};
      if (data.terms && Array.isArray(data.terms)) {
        for (const term of data.terms) {
          termsMap[term.category] = term.value;
        }
      }
      setTerms(termsMap);
      setSavedTerms(termsMap);
    } catch (err) {
      console.error('Failed to fetch commercial terms:', err);
    }
  };

  // Fetch templates for a category (lazy load with caching)
  const fetchTemplatesForCategory = useCallback(
    async (category: string) => {
      if (fetchedCategories.current.has(category)) return;

      setIsLoadingTemplates(true);
      try {
        const response = await fetch(
          `/api/settings/commercial-terms?category=${encodeURIComponent(category)}`
        );
        if (response.ok) {
          const data = await response.json();
          const options: TemplateOption[] = Array.isArray(data.templates)
            ? data.templates
            : Array.isArray(data)
              ? data
              : [];
          setTemplates((prev) => ({ ...prev, [category]: options }));
        } else {
          // If endpoint doesn't exist or returns error, set empty array
          setTemplates((prev) => ({ ...prev, [category]: [] }));
        }
        fetchedCategories.current.add(category);
      } catch {
        setTemplates((prev) => ({ ...prev, [category]: [] }));
        fetchedCategories.current.add(category);
      } finally {
        setIsLoadingTemplates(false);
      }
    },
    []
  );

  // Fetch templates when active tab changes
  useEffect(() => {
    if (isExpanded) {
      fetchTemplatesForCategory(activeTab);
    }
  }, [activeTab, isExpanded, fetchTemplatesForCategory]);

  // Check for changes
  useEffect(() => {
    const changed =
      JSON.stringify(terms) !== JSON.stringify(savedTerms);
    setHasChanges(changed);
    if (changed && onTermsChange) {
      onTermsChange();
    }
  }, [terms, savedTerms, onTermsChange]);

  // Handle tab switch
  const handleTabChange = (key: CategoryKey) => {
    setActiveTab(key);
  };

  // Handle template selection
  const handleTemplateSelect = (value: string) => {
    if (!value) return;
    setTerms((prev) => ({ ...prev, [activeTab]: value }));
  };

  // Handle textarea change
  const handleTermChange = (value: string) => {
    setTerms((prev) => ({ ...prev, [activeTab]: value }));
  };

  // Save all terms
  const handleSaveInternal = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const termsArray: TermData[] = TERM_CATEGORIES.map((cat, index) => ({
        category: cat.key,
        value: terms[cat.key] || '',
        sortOrder: index + 1,
      }));

      const response = await fetch(`/api/quotes/${quoteId}/terms`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: termsArray }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Kaydetme hatası');
      }

      setSavedTerms({ ...terms });
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Ticari şartlar kaydedilemedi'
      );
    } finally {
      setIsSaving(false);
    }
  }, [quoteId, terms]);

  // Expose save method to parent via ref
  useImperativeHandle(ref, () => ({
    save: handleSaveInternal,
    hasChanges: () => JSON.stringify(terms) !== JSON.stringify(savedTerms),
  }), [handleSaveInternal, terms, savedTerms]);

  // Reset to saved values
  const handleReset = () => {
    setTerms({ ...savedTerms });
    setError(null);
  };

  // Count filled categories
  const filledCount = TERM_CATEGORIES.filter(
    (cat) => terms[cat.key] && terms[cat.key].trim().length > 0
  ).length;

  const activeCategory = TERM_CATEGORIES.find(
    (cat) => cat.key === activeTab
  );
  const activeCategoryTemplates = templates[activeTab] || [];
  const activeTermValue = terms[activeTab] || '';

  return (
    <div className="border border-primary-200 rounded-xl bg-white overflow-hidden">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={cn(
          'w-full flex items-center justify-between px-5 py-4 cursor-pointer transition-colors',
          'hover:bg-primary-50',
          isExpanded && 'border-b border-primary-200'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-primary-900">
              Ticari Şartlar
            </h3>
            <p className="text-xs text-primary-500 mt-0.5">
              {filledCount}/{TERM_CATEGORIES.length} kategori dolduruldu
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              Kaydedilmemiş
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-primary-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-primary-500" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-5 space-y-4">
          {/* Tab Navigation */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {TERM_CATEGORIES.map((cat) => {
              const isFilled =
                terms[cat.key] && terms[cat.key].trim().length > 0;
              const isActive = activeTab === cat.key;

              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => handleTabChange(cat.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors cursor-pointer',
                    isActive
                      ? 'bg-primary-700 text-white'
                      : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                  )}
                >
                  {/* Status indicator */}
                  {isFilled ? (
                    <Check
                      className={cn(
                        'w-3.5 h-3.5',
                        isActive ? 'text-green-300' : 'text-green-600'
                      )}
                    />
                  ) : (
                    <span
                      className={cn(
                        'w-2.5 h-2.5 rounded-full border-2',
                        isActive
                          ? 'border-white/50'
                          : 'border-primary-300'
                      )}
                    />
                  )}
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Active Tab Content */}
          <div className="space-y-3">
            {/* Category Label */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-primary-700">
                {activeCategory?.label}
              </label>
              {activeTermValue.trim().length > 0 && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Değer girildi
                </span>
              )}
            </div>

            {/* Template Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-primary-500">
                Şablon
              </label>
              <div className="relative">
                {isLoadingTemplates && !templates[activeTab] ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-primary-200 rounded-lg bg-primary-50">
                    <Spinner size="sm" />
                    <span className="text-sm text-primary-500">
                      Şablonlar yükleniyor...
                    </span>
                  </div>
                ) : (
                  <select
                    value=""
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className={cn(
                      'w-full px-3 py-2 border rounded-lg text-sm bg-white appearance-none cursor-pointer',
                      'focus:outline-none focus:ring-2 focus:border-transparent transition-shadow duration-200',
                      'border-primary-300 focus:ring-accent-500 text-primary-900'
                    )}
                  >
                    <option value="" disabled>
                      Şablon seçin...
                    </option>
                    {activeCategoryTemplates.map((tpl, idx) => (
                      <option key={idx} value={tpl.value}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                )}
                {!isLoadingTemplates && (
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-500 pointer-events-none" />
                )}
              </div>
              {!isLoadingTemplates &&
                activeCategoryTemplates.length === 0 &&
                templates[activeTab] !== undefined && (
                  <p className="text-xs text-primary-400">
                    Bu kategori için şablon bulunmamaktadır
                  </p>
                )}
            </div>

            {/* Free Text Area */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-primary-500">
                Değer
              </label>
              <textarea
                value={activeTermValue}
                onChange={(e) => handleTermChange(e.target.value)}
                placeholder={`${activeCategory?.label} bilgisi giriniz...`}
                className={cn(
                  'w-full px-3 py-2.5 border rounded-lg text-sm text-primary-900',
                  'placeholder:text-primary-400',
                  'focus:outline-none focus:ring-2 focus:border-transparent transition-shadow duration-200',
                  'border-primary-300 focus:ring-accent-500',
                  'resize-y'
                )}
                style={{ minHeight: '100px' }}
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {saveSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-700">
                Ticari şartlar başarıyla kaydedildi
              </p>
            </div>
          )}

          {/* Bottom Action Bar */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-primary-100">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges || isSaving}
            >
              Sıfırla
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveInternal}
              disabled={!hasChanges}
              isLoading={isSaving}
            >
              Kaydet
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
