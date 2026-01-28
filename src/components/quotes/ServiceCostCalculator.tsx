'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calculator, X } from 'lucide-react';
import { Button, Input, Select, Spinner } from '@/components/ui';
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from '@/components/ui';
import { cn } from '@/lib/cn';

// ---------- Types ----------
interface ServiceCostConfig {
  dailySalary: number;
  dailyHotel: number;
  dailyMealsOutCity: number;
  dailyMealsOffice: number;
  dailyVehicle: number;
  perKmCost: number;
  distanceBrackets: number[];
}

interface LiftingEquipmentRate {
  id: string;
  name: string;
  dailyRate: number;
}

interface CostBreakdown {
  salary: number;
  hotel: number;
  meals: number;
  vehicle: number;
  kmCost: number;
  dailyTotal: number;
  subtotal: number;
  liftingCost: number;
  grandTotal: number;
}

type ServiceType = 'SUPERVISION' | 'TEST_COMMISSIONING' | 'TRAINING';
type LocationType = 'IN_CITY' | 'OFFICE' | 'OUT_CITY';

export interface ServiceCostCalculatorProps {
  quoteId: string;
  onServiceAdded: (item: any) => void;
  onClose: () => void;
}

// ---------- Constants ----------
const SERVICE_TYPE_OPTIONS = [
  { value: 'SUPERVISION', label: 'Supervizyon' },
  { value: 'TEST_COMMISSIONING', label: 'Test ve Devreye Alma' },
  { value: 'TRAINING', label: 'Egitim' },
];

const LOCATION_OPTIONS: { value: LocationType; label: string }[] = [
  { value: 'IN_CITY', label: 'Sehir Ici' },
  { value: 'OFFICE', label: 'Ofis' },
  { value: 'OUT_CITY', label: 'Sehir Disi' },
];

// ---------- Component ----------
export function ServiceCostCalculator({
  quoteId,
  onServiceAdded,
  onClose,
}: ServiceCostCalculatorProps) {
  // Config state
  const [config, setConfig] = useState<ServiceCostConfig | null>(null);
  const [liftingRates, setLiftingRates] = useState<LiftingEquipmentRate[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Form state
  const [serviceType, setServiceType] = useState<ServiceType>('SUPERVISION');
  const [teamSize, setTeamSize] = useState<1 | 2>(1);
  const [locationType, setLocationType] = useState<LocationType>('IN_CITY');
  const [distanceKm, setDistanceKm] = useState<number | ''>('');
  const [days, setDays] = useState<number | ''>(1);
  const [daysError, setDaysError] = useState<string | null>(null);

  // Lifting equipment state
  const [includeLiftingEquipment, setIncludeLiftingEquipment] = useState(false);
  const [selectedLiftingId, setSelectedLiftingId] = useState<string>('');
  const [liftingDays, setLiftingDays] = useState<number | ''>(1);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---------- Fetch config ----------
  const fetchConfig = useCallback(async () => {
    setIsLoadingConfig(true);
    setConfigError(null);
    try {
      const response = await fetch('/api/settings/service-costs');
      if (!response.ok) {
        throw new Error('Hizmet maliyet ayarlari yuklenemedi');
      }
      const data = await response.json();
      setConfig(data.config);
      setLiftingRates(data.liftingRates || []);
      if (data.liftingRates?.length > 0) {
        setSelectedLiftingId(data.liftingRates[0].id);
      }
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ---------- Days validation ----------
  const handleDaysChange = (value: string) => {
    setDaysError(null);
    if (value === '') {
      setDays('');
      return;
    }
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) {
      setDays(1);
      setDaysError('Gun sayisi en az 1 olmalidir');
    } else if (num > 15) {
      setDays(15);
      setDaysError('Gun sayisi en fazla 15 olabilir');
    } else {
      setDays(num);
    }
  };

  // ---------- Distance brackets as Select options ----------
  const distanceOptions = useMemo(() => {
    if (!config) return [];
    return config.distanceBrackets.map((km) => ({
      value: String(km),
      label: `${km} km`,
    }));
  }, [config]);

  // ---------- Lifting equipment options ----------
  const liftingOptions = useMemo(
    () =>
      liftingRates.map((rate) => ({
        value: rate.id,
        label: `${rate.name} (${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(rate.dailyRate))}/gün)`,
      })),
    [liftingRates]
  );

  // ---------- Live cost breakdown ----------
  const breakdown = useMemo<CostBreakdown | null>(() => {
    if (!config || days === '' || days < 1) return null;

    const daysNum = Number(days);
    // Convert Prisma Decimal values (which come as strings) to numbers
    const salary = Number(config.dailySalary);
    const hotel = locationType === 'OUT_CITY' ? Number(config.dailyHotel) : 0;
    const meals =
      locationType === 'OUT_CITY'
        ? Number(config.dailyMealsOutCity)
        : locationType === 'OFFICE'
          ? Number(config.dailyMealsOffice)
          : 0;
    const vehicle = Number(config.dailyVehicle);

    const distance = locationType === 'OUT_CITY' && distanceKm !== '' ? Number(distanceKm) : 0;
    const kmCost = distance * Number(config.perKmCost);

    const dailyTotal = salary + hotel + meals + vehicle + kmCost;
    const subtotal = dailyTotal * daysNum * teamSize;

    let liftingCost = 0;
    if (includeLiftingEquipment && selectedLiftingId && liftingDays !== '' && Number(liftingDays) > 0) {
      const rate = liftingRates.find((r) => r.id === selectedLiftingId);
      if (rate) {
        liftingCost = Number(rate.dailyRate) * Number(liftingDays);
      }
    }

    const grandTotal = subtotal + liftingCost;

    return {
      salary,
      hotel,
      meals,
      vehicle,
      kmCost,
      dailyTotal,
      subtotal,
      liftingCost,
      grandTotal,
    };
  }, [config, days, teamSize, locationType, distanceKm, includeLiftingEquipment, selectedLiftingId, liftingDays, liftingRates]);

  // ---------- Submit handler ----------
  const handleSubmit = async () => {
    if (!breakdown || days === '' || days < 1) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        teamSize,
        days: Number(days),
        locationType,
        serviceType,
      };
      if (locationType === 'OUT_CITY' && distanceKm !== '') {
        body.distanceKm = Number(distanceKm);
      }
      if (includeLiftingEquipment && selectedLiftingId) {
        body.liftingEquipment = {
          rateId: selectedLiftingId,
          days: Number(liftingDays) || 1,
        };
      }

      const response = await fetch(`/api/quotes/${quoteId}/items/service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Hizmet eklenirken hata olustu');
      }

      const data = await response.json();
      onServiceAdded(data.item);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------- Formatting helper ----------
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(val);

  // ---------- Loading state ----------
  if (isLoadingConfig) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center justify-center py-12">
            <Spinner />
            <span className="ml-3 text-primary-600">Ayarlar yukleniyor...</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (configError) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-8">
            <p className="text-red-600 mb-3">{configError}</p>
            <Button variant="secondary" size="sm" onClick={fetchConfig}>
              Tekrar Dene
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  // ---------- Render ----------
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary-700" />
            <CardTitle>Hizmet Maliyet Hesaplayici</CardTitle>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-primary-100 transition-colors cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-5 h-5 text-primary-500" />
          </button>
        </div>
      </CardHeader>

      <CardBody>
        <div className="space-y-6">
          {/* --- Service Type & Team Size Row --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Service Type */}
            <Select
              label="Hizmet Tipi"
              options={SERVICE_TYPE_OPTIONS}
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
            />

            {/* Team Size Toggle */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-primary-700">Ekip Buyuklugu</label>
              <div className="flex rounded-lg border border-primary-300 overflow-hidden">
                <button
                  type="button"
                  className={cn(
                    'flex-1 px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
                    teamSize === 1
                      ? 'bg-primary-700 text-white'
                      : 'bg-white text-primary-700 hover:bg-primary-50'
                  )}
                  onClick={() => setTeamSize(1)}
                >
                  1 Kisi
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex-1 px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-l border-primary-300',
                    teamSize === 2
                      ? 'bg-primary-700 text-white'
                      : 'bg-white text-primary-700 hover:bg-primary-50'
                  )}
                  onClick={() => setTeamSize(2)}
                >
                  2 Kisi
                </button>
              </div>
            </div>
          </div>

          {/* --- Location & Distance Row --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Location Radio Group */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-primary-700">Lokasyon</label>
              <div className="space-y-2">
                {LOCATION_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                      locationType === opt.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-primary-200 hover:bg-primary-50'
                    )}
                  >
                    <input
                      type="radio"
                      name="locationType"
                      value={opt.value}
                      checked={locationType === opt.value}
                      onChange={() => setLocationType(opt.value)}
                      className="accent-primary-700"
                    />
                    <span className="text-sm text-primary-800">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Distance + Days */}
            <div className="space-y-4">
              {locationType === 'OUT_CITY' && (
                <Select
                  label="Mesafe"
                  options={distanceOptions}
                  value={distanceKm !== '' ? String(distanceKm) : ''}
                  onChange={(e) => setDistanceKm(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Mesafe secin"
                />
              )}
              <Input
                label="Gun Sayisi"
                type="number"
                min={1}
                max={15}
                value={days}
                onChange={(e) => handleDaysChange(e.target.value)}
                error={daysError || undefined}
                placeholder="1-15"
              />
            </div>
          </div>

          {/* --- Lifting Equipment --- */}
          <div className="border border-primary-200 rounded-lg p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLiftingEquipment}
                onChange={(e) => setIncludeLiftingEquipment(e.target.checked)}
                className="accent-primary-700 w-4 h-4"
              />
              <span className="text-sm font-medium text-primary-700">
                Kaldirma Ekipmani Ekle
              </span>
            </label>

            {includeLiftingEquipment && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <Select
                  label="Ekipman Tipi"
                  options={liftingOptions}
                  value={selectedLiftingId}
                  onChange={(e) => setSelectedLiftingId(e.target.value)}
                  placeholder="Ekipman secin"
                />
                <Input
                  label="Kiralama Gunu"
                  type="number"
                  min={1}
                  value={liftingDays}
                  onChange={(e) =>
                    setLiftingDays(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  placeholder="Gun"
                />
              </div>
            )}
          </div>

          {/* --- Live Cost Breakdown --- */}
          {breakdown && (
            <div className="border border-primary-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-primary-50 border-b border-primary-200">
                <h4 className="text-sm font-semibold text-primary-800">Maliyet Dokumu</h4>
              </div>
              <div className="divide-y divide-primary-100">
                {/* Daily components */}
                <BreakdownRow label="Maas (gunluk)" value={formatCurrency(breakdown.salary)} />
                <BreakdownRow label="Otel (gunluk)" value={formatCurrency(breakdown.hotel)} />
                <BreakdownRow label="Yemek (gunluk)" value={formatCurrency(breakdown.meals)} />
                <BreakdownRow label="Arac (gunluk)" value={formatCurrency(breakdown.vehicle)} />
                {locationType === 'OUT_CITY' && (
                  <BreakdownRow label="KM Maliyeti" value={formatCurrency(breakdown.kmCost)} />
                )}

                {/* Daily total */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-primary-50">
                  <span className="text-sm font-medium text-primary-700">Gunluk Toplam</span>
                  <span className="text-sm font-semibold text-primary-900">
                    {formatCurrency(breakdown.dailyTotal)}
                  </span>
                </div>

                {/* Subtotal */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-primary-600">
                    Ara Toplam ({days} gun x {teamSize} kisi)
                  </span>
                  <span className="text-sm font-semibold text-primary-900">
                    {formatCurrency(breakdown.subtotal)}
                  </span>
                </div>

                {/* Lifting equipment cost */}
                {includeLiftingEquipment && breakdown.liftingCost > 0 && (
                  <BreakdownRow
                    label="Kaldirma Ekipmani"
                    value={formatCurrency(breakdown.liftingCost)}
                  />
                )}

                {/* Grand Total */}
                <div className="flex items-center justify-between px-4 py-3 bg-primary-700">
                  <span className="text-sm font-bold text-white">Genel Toplam</span>
                  <span className="text-base font-bold text-white">
                    {formatCurrency(breakdown.grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* --- Error --- */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}
        </div>
      </CardBody>

      <CardFooter>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
            Vazgec
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={!breakdown || days === '' || days < 1}
          >
            Teklife Ekle
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

// ---------- Breakdown Row ----------
function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className="text-sm text-primary-600">{label}</span>
      <span className="text-sm font-medium text-primary-800 tabular-nums">{value}</span>
    </div>
  );
}
