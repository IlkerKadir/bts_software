'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Plus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Check,
  Calendar,
  Truck,
  CreditCard,
} from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardBody, Input, Spinner, Badge } from '@/components/ui';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceCostConfig {
  id: string;
  dailySalary: number;
  dailyHotel: number;
  dailyMealsOutCity: number;
  dailyMealsOffice: number;
  dailyVehicle: number;
  perKmCost: number;
  distanceBrackets: number[];
  validFrom: string;
  isActive: boolean;
  createdAt: string;
}

interface LiftingEquipmentRate {
  id: string;
  name: string;
  dailyRate: number;
  transportCost: number;
  validFrom: string;
  isActive: boolean;
  createdAt: string;
}

interface FormData {
  dailySalary: string;
  dailyHotel: string;
  dailyMealsOutCity: string;
  dailyMealsOffice: string;
  dailyVehicle: string;
  perKmCost: string;
  distanceBrackets: string;
  validFrom: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatTRY = (value: number): string =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);

const formatDate = (dateString: string): string =>
  new Date(dateString).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

const formatDateTime = (dateString: string): string =>
  new Date(dateString).toLocaleString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const todayISO = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const PARAM_LABELS: { key: keyof Omit<FormData, 'distanceBrackets' | 'validFrom'>; label: string }[] = [
  { key: 'dailySalary', label: 'Adam/Gun Maas Maliyeti' },
  { key: 'dailyHotel', label: 'Adam/Gun Otel Maliyeti' },
  { key: 'dailyMealsOutCity', label: 'Adam/Gun Yemek (Sehir Disi)' },
  { key: 'dailyMealsOffice', label: 'Adam/Gun Yemek (Ofis)' },
  { key: 'dailyVehicle', label: 'Gunluk Arac Maliyeti' },
  { key: 'perKmCost', label: 'Km Basi Maliyet' },
];

const DISPLAY_LABELS: { key: keyof ServiceCostConfig; label: string }[] = [
  { key: 'dailySalary', label: 'Adam/Gun Maas' },
  { key: 'dailyHotel', label: 'Adam/Gun Otel' },
  { key: 'dailyMealsOutCity', label: 'Adam/Gun Yemek (Sehir Disi)' },
  { key: 'dailyMealsOffice', label: 'Adam/Gun Yemek (Ofis)' },
  { key: 'dailyVehicle', label: 'Gunluk Arac' },
  { key: 'perKmCost', label: 'Km Basi Maliyet' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ServiceCostSettings() {
  // Data state
  const [config, setConfig] = useState<ServiceCostConfig | null>(null);
  const [liftingRates, setLiftingRates] = useState<LiftingEquipmentRate[]>([]);
  const [historicalConfigs, setHistoricalConfigs] = useState<ServiceCostConfig[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    dailySalary: '',
    dailyHotel: '',
    dailyMealsOutCity: '',
    dailyMealsOffice: '',
    dailyVehicle: '',
    perKmCost: '',
    distanceBrackets: '75, 150, 200, 250, 500, 750, 1000, 1250',
    validFrom: todayISO(),
  });

  // ---------- Fetch data ----------

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/settings/service-costs');
      if (!response.ok) {
        throw new Error('Veriler yuklenirken bir hata olustu');
      }
      const data = await response.json();

      if (data.config) {
        setConfig(data.config);
      }
      if (data.liftingRates) {
        setLiftingRates(data.liftingRates);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/service-costs?history=true');
      if (response.ok) {
        const data = await response.json();
        if (data.history) {
          setHistoricalConfigs(data.history);
        }
      }
    } catch {
      // silently fail for history
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------- Handlers ----------

  const handleOpenForm = () => {
    // Pre-fill form with current config values if available
    if (config) {
      setFormData({
        dailySalary: String(config.dailySalary),
        dailyHotel: String(config.dailyHotel),
        dailyMealsOutCity: String(config.dailyMealsOutCity),
        dailyMealsOffice: String(config.dailyMealsOffice),
        dailyVehicle: String(config.dailyVehicle),
        perKmCost: String(config.perKmCost),
        distanceBrackets: Array.isArray(config.distanceBrackets)
          ? config.distanceBrackets.join(', ')
          : '75, 150, 200, 250, 500, 750, 1000, 1250',
        validFrom: todayISO(),
      });
    }
    setShowForm(true);
    setError(null);
    setSuccessMessage(null);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setError(null);
  };

  const handleFieldChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggleHistory = () => {
    if (!showHistory) {
      fetchHistory();
    }
    setShowHistory((prev) => !prev);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Parse distance brackets
      const brackets = formData.distanceBrackets
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n > 0);

      if (brackets.length === 0) {
        throw new Error('Gecerli mesafe kademeleri giriniz');
      }

      const payload = {
        dailySalary: parseFloat(formData.dailySalary),
        dailyHotel: parseFloat(formData.dailyHotel),
        dailyMealsOutCity: parseFloat(formData.dailyMealsOutCity),
        dailyMealsOffice: parseFloat(formData.dailyMealsOffice),
        dailyVehicle: parseFloat(formData.dailyVehicle),
        perKmCost: parseFloat(formData.perKmCost),
        distanceBrackets: brackets,
        validFrom: formData.validFrom,
      };

      // Validate all numbers
      const numericFields = [
        'dailySalary',
        'dailyHotel',
        'dailyMealsOutCity',
        'dailyMealsOffice',
        'dailyVehicle',
        'perKmCost',
      ] as const;
      for (const field of numericFields) {
        if (isNaN(payload[field]) || payload[field] <= 0) {
          throw new Error('Tum maliyet alanlari gecerli pozitif sayilar olmalidir');
        }
      }

      const response = await fetch('/api/settings/service-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Kaydetme basarisiz');
      }

      setSuccessMessage('Yeni tarife basariyla olusturuldu');
      setShowForm(false);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------- Render ----------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Hizmet Maliyet Ayarlari</h1>
          <p className="text-primary-600 mt-1">
            Hizmet maliyet parametrelerini goruntuleyin ve yonetim
          </p>
        </div>
        {!showForm && (
          <Button onClick={handleOpenForm}>
            <Plus className="w-4 h-4" />
            Yeni Tarife Olustur
          </Button>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-700">
          <Check className="w-5 h-5 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Current Rates Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary-600" />
            <CardTitle>Guncel Tarife</CardTitle>
            {config?.isActive && (
              <Badge variant="success">Aktif</Badge>
            )}
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {config ? (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-3">Parametre</th>
                    <th className="text-right px-5 py-3">Deger</th>
                  </tr>
                </thead>
                <tbody>
                  {DISPLAY_LABELS.map(({ key, label }) => (
                    <tr key={key} className="border-t border-primary-100">
                      <td className="px-5 py-3 text-sm text-primary-700">{label}</td>
                      <td className="px-5 py-3 text-sm text-right font-mono tabular-nums text-primary-900">
                        {formatTRY(Number(config[key]))}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-primary-100">
                    <td className="px-5 py-3 text-sm text-primary-700">Mesafe Kademeleri</td>
                    <td className="px-5 py-3 text-sm text-right font-mono tabular-nums text-primary-900">
                      {Array.isArray(config.distanceBrackets)
                        ? config.distanceBrackets.join(', ') + ' km'
                        : '-'}
                    </td>
                  </tr>
                  <tr className="border-t border-primary-100">
                    <td className="px-5 py-3 text-sm text-primary-700">Gecerlilik Tarihi</td>
                    <td className="px-5 py-3 text-sm text-right text-primary-900">
                      {formatDate(config.validFrom)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-primary-500">
              <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Henuz tarife tanimlanmamis. Yeni bir tarife olusturun.</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* New Tariff Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Yeni Tarife Olustur</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Base Rate Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PARAM_LABELS.map(({ key, label }) => (
                  <Input
                    key={key}
                    label={label}
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData[key]}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    placeholder="0.00"
                    required
                  />
                ))}
              </div>

              {/* Distance Brackets */}
              <Input
                label="Mesafe Kademeleri (km)"
                type="text"
                value={formData.distanceBrackets}
                onChange={(e) => handleFieldChange('distanceBrackets', e.target.value)}
                placeholder="75, 150, 200, 250, 500, 750, 1000, 1250"
              />
              <p className="text-xs text-primary-500 -mt-4">
                Virgul ile ayrilmis mesafe degerleri (km cinsinden)
              </p>

              {/* Valid From Date */}
              <div className="max-w-xs">
                <Input
                  label="Gecerlilik Baslangici"
                  type="date"
                  value={formData.validFrom}
                  onChange={(e) => handleFieldChange('validFrom', e.target.value)}
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={isSaving} isLoading={isSaving}>
                  Kaydet
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancelForm}>
                  Iptal
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Lifting Equipment Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary-600" />
            <CardTitle>Kaldirma Ekipmanlari</CardTitle>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {liftingRates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-3">Ad</th>
                    <th className="text-right px-5 py-3">Gunluk Ucret</th>
                    <th className="text-right px-5 py-3">Nakliye Maliyeti</th>
                  </tr>
                </thead>
                <tbody>
                  {liftingRates.map((rate) => (
                    <tr key={rate.id} className="border-t border-primary-100">
                      <td className="px-5 py-3 text-sm text-primary-900 font-medium">
                        {rate.name}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono tabular-nums text-primary-900">
                        {formatTRY(Number(rate.dailyRate))}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-mono tabular-nums text-primary-900">
                        {formatTRY(Number(rate.transportCost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-primary-500">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Henuz kaldirma ekipmani tanimlanmamis.</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Historical Configs (Collapsible) */}
      <Card>
        <button
          type="button"
          onClick={handleToggleHistory}
          className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-primary-50 transition-colors rounded-xl"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary-600" />
            <span className="font-semibold text-primary-900">Tarihce</span>
          </div>
          {showHistory ? (
            <ChevronUp className="w-5 h-5 text-primary-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-primary-500" />
          )}
        </button>

        {showHistory && (
          <div className="border-t border-primary-200">
            {historicalConfigs.length > 0 ? (
              <div className="divide-y divide-primary-100">
                {historicalConfigs.map((hist) => (
                  <div key={hist.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-primary-700">
                        Gecerlilik: {formatDate(hist.validFrom)}
                      </span>
                      <span className="text-xs text-primary-500">
                        Olusturulma: {formatDateTime(hist.createdAt)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                      {DISPLAY_LABELS.map(({ key, label }) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-primary-500">{label}:</span>
                          <span className="font-mono tabular-nums text-primary-800">
                            {formatTRY(Number(hist[key]))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-6 text-center text-primary-500 text-sm">
                Gecmis tarife kaydi bulunamadi.
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
