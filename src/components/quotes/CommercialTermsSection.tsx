'use client';

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { FileText, ChevronDown, ChevronUp, Check, Plus, X } from 'lucide-react';
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
  { key: 'DAHIL_OLMAYAN', label: 'Dahil Olmayan Hizmetler' },
  { key: 'NOTLAR', label: 'Notlar' },
] as const;

type CategoryKey = (typeof TERM_CATEGORIES)[number]['key'];

/** Categories that support multiple selected values (checkbox list). */
const MULTI_VALUE_CATEGORIES: string[] = ['uretici_firmalar', 'onaylar', 'NOTLAR'];

interface TermData {
  id?: string;
  category: string;
  value: string;
  sortOrder: number;
  highlight?: boolean;
}

interface TemplateOption {
  id?: string;
  name: string;
  value: string;
  isDefault?: boolean;
  highlight?: boolean;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMultiValue(category: string): boolean {
  return MULTI_VALUE_CATEGORIES.includes(category);
}

/**
 * Internal state shape: every category stores an array of values.
 * Single-value categories have 0 or 1 element.
 * Multi-value categories have 0-N elements.
 */
type TermsState = Record<string, string[]>;

/**
 * For NOTLAR we also track per-value highlight flags.
 * Key = category, value = set of highlighted value strings.
 */
type HighlightState = Record<string, Set<string>>;

function termsArrayToState(terms: TermData[]): { state: TermsState; highlights: HighlightState } {
  const state: TermsState = {};
  const highlights: HighlightState = {};
  for (const term of terms) {
    if (!term.value || term.value.trim().length === 0) continue;
    if (!state[term.category]) state[term.category] = [];
    state[term.category].push(term.value);
    if (term.highlight) {
      if (!highlights[term.category]) highlights[term.category] = new Set();
      highlights[term.category].add(term.value);
    }
  }
  return { state, highlights };
}

function stateToTermsArray(state: TermsState, highlights: HighlightState): TermData[] {
  const arr: TermData[] = [];
  let sortCounter = 0;
  for (const cat of TERM_CATEGORIES) {
    const values = state[cat.key];
    if (!values) continue;
    for (const v of values) {
      if (!v || v.trim().length === 0) continue;
      sortCounter++;
      arr.push({
        category: cat.key,
        value: v,
        sortOrder: sortCounter,
        highlight: highlights[cat.key]?.has(v) ?? false,
      });
    }
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CommercialTermsSection = forwardRef<CommercialTermsSectionHandle, CommercialTermsSectionProps>(function CommercialTermsSection({
  quoteId,
  initialTerms,
  onTermsChange,
}: CommercialTermsSectionProps, ref) {
  // Terms state: map of category key -> value[]
  const [terms, setTerms] = useState<TermsState>({});
  const [highlights, setHighlights] = useState<HighlightState>({});
  // Snapshot of saved terms for reset functionality
  const [savedTerms, setSavedTerms] = useState<TermsState>({});
  const [savedHighlights, setSavedHighlights] = useState<HighlightState>({});
  // Templates cache: map of category key -> template options
  const [templates, setTemplates] = useState<Record<string, TemplateOption[]>>({});
  // Track which categories have had templates fetched
  const fetchedCategories = useRef<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<CategoryKey>('uretici_firmalar');
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Custom entry input for multi-value categories
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Track whether we have already seeded state from initialTerms or the API.
  const hasInitialized = useRef(false);

  // Initialize terms from initialTerms prop
  useEffect(() => {
    if (hasInitialized.current) return;
    if (initialTerms && initialTerms.length > 0) {
      hasInitialized.current = true;
      const { state, highlights: hl } = termsArrayToState(initialTerms);
      setTerms(state);
      setHighlights(hl);
      setSavedTerms(state);
      setSavedHighlights(hl);
    }
  }, [initialTerms]);

  // Fetch terms from API if no initialTerms provided.
  useEffect(() => {
    if (hasInitialized.current) return;
    if (!initialTerms) {
      fetchTerms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, initialTerms]);

  const fetchTerms = async () => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/terms`);
      if (!response.ok) throw new Error('Ticari şartlar yüklenemedi');
      const data = await response.json();
      const termsArr: TermData[] = data.terms && Array.isArray(data.terms) ? data.terms : [];
      const { state, highlights: hl } = termsArrayToState(termsArr);
      hasInitialized.current = true;
      setTerms(state);
      setHighlights(hl);
      setSavedTerms(state);
      setSavedHighlights(hl);
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
      JSON.stringify(terms) !== JSON.stringify(savedTerms) ||
      JSON.stringify(serializeHighlights(highlights)) !== JSON.stringify(serializeHighlights(savedHighlights));
    setHasChanges(changed);
    if (changed && onTermsChange) {
      onTermsChange();
    }
  }, [terms, savedTerms, highlights, savedHighlights, onTermsChange]);

  // Handle tab switch
  const handleTabChange = (key: CategoryKey) => {
    setActiveTab(key);
    setShowCustomInput(false);
    setCustomInput('');
  };

  // ---- Single-value handlers ----

  // Handle template selection for single-value category
  const handleTemplateSelect = (value: string) => {
    if (!value) return;
    setTerms((prev) => ({ ...prev, [activeTab]: [value] }));
  };

  // Handle textarea change for single-value category
  const handleTermChange = (value: string) => {
    setTerms((prev) => ({ ...prev, [activeTab]: [value] }));
  };

  // ---- Multi-value handlers ----

  // Toggle a checkbox value on/off for a multi-value category
  const handleMultiToggle = (value: string) => {
    setTerms((prev) => {
      const existing = prev[activeTab] || [];
      if (existing.includes(value)) {
        return { ...prev, [activeTab]: existing.filter((v) => v !== value) };
      } else {
        return { ...prev, [activeTab]: [...existing, value] };
      }
    });
  };

  // Add a custom text entry for multi-value category
  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    setTerms((prev) => {
      const existing = prev[activeTab] || [];
      if (existing.includes(trimmed)) return prev;
      return { ...prev, [activeTab]: [...existing, trimmed] };
    });
    setCustomInput('');
    setShowCustomInput(false);
  };

  // Remove a specific value from a multi-value category
  const handleRemoveValue = (value: string) => {
    setTerms((prev) => {
      const existing = prev[activeTab] || [];
      return { ...prev, [activeTab]: existing.filter((v) => v !== value) };
    });
    // Also remove highlight if any
    setHighlights((prev) => {
      const hl = new Set(prev[activeTab]);
      hl.delete(value);
      return { ...prev, [activeTab]: hl };
    });
  };

  // Toggle highlight for NOTLAR entries
  const handleToggleHighlight = (value: string) => {
    setHighlights((prev) => {
      const hl = new Set(prev[activeTab] || []);
      if (hl.has(value)) {
        hl.delete(value);
      } else {
        hl.add(value);
      }
      return { ...prev, [activeTab]: hl };
    });
  };

  // Save all terms
  const handleSaveInternal = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const termsArray = stateToTermsArray(terms, highlights);

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
      setSavedHighlights(deepCloneHighlights(highlights));
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
  }, [quoteId, terms, highlights]);

  // Expose save method to parent via ref
  useImperativeHandle(ref, () => ({
    save: handleSaveInternal,
    hasChanges: () =>
      JSON.stringify(terms) !== JSON.stringify(savedTerms) ||
      JSON.stringify(serializeHighlights(highlights)) !== JSON.stringify(serializeHighlights(savedHighlights)),
  }), [handleSaveInternal, terms, savedTerms, highlights, savedHighlights]);

  // Reset to saved values
  const handleReset = () => {
    setTerms({ ...savedTerms });
    setHighlights(deepCloneHighlights(savedHighlights));
    setError(null);
  };

  // Count filled categories
  const filledCount = TERM_CATEGORIES.filter(
    (cat) => {
      const vals = terms[cat.key];
      return vals && vals.some((v) => v.trim().length > 0);
    }
  ).length;

  const activeCategory = TERM_CATEGORIES.find(
    (cat) => cat.key === activeTab
  );
  const activeCategoryTemplates = templates[activeTab] || [];
  const activeTermValues = terms[activeTab] || [];
  const isMulti = isMultiValue(activeTab);

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
              const vals = terms[cat.key];
              const isFilled = vals && vals.some((v) => v.trim().length > 0);
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
                  {isMultiValue(cat.key) && vals && vals.length > 0 && (
                    <span className={cn(
                      'ml-0.5 text-xs rounded-full px-1.5 py-0.5',
                      isActive ? 'bg-white/20 text-white' : 'bg-primary-200 text-primary-700'
                    )}>
                      {vals.length}
                    </span>
                  )}
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
                {isMulti && (
                  <span className="ml-2 text-xs font-normal text-primary-400">(birden fazla seçilebilir)</span>
                )}
              </label>
              {activeTermValues.some((v) => v.trim().length > 0) && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {isMulti ? `${activeTermValues.length} seçim` : 'Değer girildi'}
                </span>
              )}
            </div>

            {/* ---------- MULTI-VALUE: Checkbox list ---------- */}
            {isMulti && (
              <div className="space-y-2">
                {isLoadingTemplates && !templates[activeTab] ? (
                  <div className="flex items-center gap-2 px-3 py-2 border border-primary-200 rounded-lg bg-primary-50">
                    <Spinner size="sm" />
                    <span className="text-sm text-primary-500">
                      Şablonlar yükleniyor...
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Template checkboxes */}
                    {activeCategoryTemplates.length > 0 && (
                      <div className="border border-primary-200 rounded-lg divide-y divide-primary-100 max-h-64 overflow-y-auto">
                        {activeCategoryTemplates.map((tpl, idx) => {
                          const isChecked = activeTermValues.includes(tpl.value);
                          const isFixed = tpl.isDefault === true;
                          return (
                            <label
                              key={idx}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
                                isChecked ? 'bg-accent-50' : 'hover:bg-primary-50',
                                isFixed && 'bg-primary-50'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isFixed && isChecked}
                                onChange={() => handleMultiToggle(tpl.value)}
                                className="w-4 h-4 rounded border-primary-300 text-accent-600 focus:ring-accent-500"
                              />
                              <div className="flex-1 min-w-0">
                                <span className={cn(
                                  'text-sm text-primary-800',
                                  isFixed && 'font-medium'
                                )}>
                                  {tpl.name}
                                </span>
                                {tpl.name !== tpl.value && (
                                  <p className="text-xs text-primary-400 truncate">{tpl.value}</p>
                                )}
                              </div>
                              {isFixed && (
                                <span className="text-[10px] text-primary-400 bg-primary-100 px-1.5 py-0.5 rounded">
                                  Sabit
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* ── Selected Values Preview / Edit ── */}
                    {activeTermValues.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-primary-500">
                          Seçilen Değerler ({activeTermValues.length})
                        </p>
                        <div className="border border-primary-200 rounded-lg divide-y divide-primary-100 max-h-64 overflow-y-auto">
                          {activeTermValues.map((v, idx) => {
                            const isFromTemplate = activeCategoryTemplates.some((t) => t.value === v);
                            const tplName = activeCategoryTemplates.find((t) => t.value === v)?.name;
                            const isHighlighted = highlights[activeTab]?.has(v);
                            return (
                              <div
                                key={idx}
                                className={cn(
                                  'px-3 py-2 group',
                                  isHighlighted && 'bg-yellow-50'
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  <span className="text-xs text-primary-400 font-mono mt-1 shrink-0 w-5 text-right">
                                    {idx + 1}.
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    {tplName && tplName !== v && (
                                      <span className="text-xs font-medium text-primary-500 block mb-0.5">{tplName}</span>
                                    )}
                                    {!isFromTemplate ? (
                                      <span className="text-xs text-accent-600 font-medium block mb-0.5">Özel</span>
                                    ) : null}
                                    <textarea
                                      value={v}
                                      onChange={(e) => {
                                        const newVal = e.target.value;
                                        setTerms((prev) => {
                                          const updated = [...(prev[activeTab] || [])];
                                          const oldVal = updated[idx];
                                          updated[idx] = newVal;
                                          // Update highlight key if value changed
                                          if (highlights[activeTab]?.has(oldVal)) {
                                            setHighlights((prevH) => {
                                              const hl = new Set(prevH[activeTab]);
                                              hl.delete(oldVal);
                                              hl.add(newVal);
                                              return { ...prevH, [activeTab]: hl };
                                            });
                                          }
                                          return { ...prev, [activeTab]: updated };
                                        });
                                      }}
                                      rows={2}
                                      className="w-full text-sm text-primary-800 bg-transparent border border-transparent hover:border-primary-200 focus:border-accent-400 rounded px-1.5 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-accent-400"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 mt-1">
                                    {activeTab === 'NOTLAR' && (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleHighlight(v)}
                                        className={cn(
                                          'text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer',
                                          isHighlighted
                                            ? 'bg-yellow-200 border-yellow-400 text-yellow-800'
                                            : 'bg-primary-50 border-primary-200 text-primary-500 hover:bg-yellow-50'
                                        )}
                                        title="Vurgula (sarı)"
                                      >
                                        Vurgula
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveValue(v)}
                                      className="p-1 text-primary-300 hover:text-red-500 transition-colors cursor-pointer"
                                      title="Kaldır"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom entry button + input */}
                    {showCustomInput ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customInput}
                          onChange={(e) => setCustomInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); }
                            if (e.key === 'Escape') { setShowCustomInput(false); setCustomInput(''); }
                          }}
                          placeholder="Özel değer giriniz..."
                          className={cn(
                            'flex-1 px-3 py-1.5 border rounded-lg text-sm text-primary-900',
                            'placeholder:text-primary-400',
                            'focus:outline-none focus:ring-2 focus:border-transparent',
                            'border-primary-300 focus:ring-accent-500'
                          )}
                          autoFocus
                        />
                        <Button variant="primary" size="sm" onClick={handleAddCustom} disabled={!customInput.trim()}>
                          Ekle
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => { setShowCustomInput(false); setCustomInput(''); }}>
                          İptal
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCustomInput(true)}
                        className="flex items-center gap-1.5 text-sm text-accent-600 hover:text-accent-700 font-medium"
                      >
                        <Plus className="w-4 h-4" />
                        Özel Ekle
                      </button>
                    )}

                    {!isLoadingTemplates &&
                      activeCategoryTemplates.length === 0 &&
                      templates[activeTab] !== undefined && (
                        <p className="text-xs text-primary-400">
                          Bu kategori için şablon bulunmamaktadır. Özel değer ekleyebilirsiniz.
                        </p>
                      )}
                  </>
                )}
              </div>
            )}

            {/* ---------- SINGLE-VALUE: Template dropdown + Textarea ---------- */}
            {!isMulti && (
              <>
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
                    value={activeTermValues[0] || ''}
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
              </>
            )}
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

// ---------------------------------------------------------------------------
// Utility helpers for HighlightState serialization
// ---------------------------------------------------------------------------

function serializeHighlights(hl: HighlightState): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, s] of Object.entries(hl)) {
    out[k] = Array.from(s).sort();
  }
  return out;
}

function deepCloneHighlights(hl: HighlightState): HighlightState {
  const out: HighlightState = {};
  for (const [k, s] of Object.entries(hl)) {
    out[k] = new Set(s);
  }
  return out;
}
