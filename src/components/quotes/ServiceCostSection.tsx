'use client';

import { useState } from 'react';
import { Wrench, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ServiceCostCalculator } from './ServiceCostCalculator';

// ---------- Types ----------
interface ServiceItem {
  id: string;
  description: string;
  totalPrice: number;
  serviceMeta?: any;
}

export interface ServiceCostSectionProps {
  quoteId: string;
  serviceItems: ServiceItem[];
  currency: string;
  onServiceAdded: (item: any) => void;
  onServiceDeleted: (itemId: string) => void;
}

// ---------- Service meta label maps ----------
const serviceTypeLabels: Record<string, string> = {
  SUPERVISION: 'Supervizyon',
  TEST_COMMISSIONING: 'Test ve Devreye Alma',
  TRAINING: 'Egitim',
};

const locationLabels: Record<string, string> = {
  IN_CITY: 'Sehir Ici',
  OFFICE: 'Ofis',
  OUT_CITY: 'Sehir Disi',
};

// ---------- Component ----------
export function ServiceCostSection({
  quoteId,
  serviceItems,
  currency,
  onServiceAdded,
  onServiceDeleted,
}: ServiceCostSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency === 'TRY' ? 'TRY' : currency,
    }).format(val);

  const totalServiceCost = serviceItems.reduce((sum, item) => sum + item.totalPrice, 0);

  // ---------- Delete handler ----------
  const handleDelete = async (itemId: string) => {
    if (!confirm('Bu hizmet kalemini silmek istediginize emin misiniz?')) return;
    setDeletingId(itemId);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Silme hatasi');
      }
      onServiceDeleted(itemId);
    } catch (err) {
      console.error('Service item delete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  // ---------- Service added handler ----------
  const handleServiceAdded = (item: any) => {
    onServiceAdded(item);
    setShowCalculator(false);
  };

  // ---------- Render ----------
  return (
    <div className="border border-primary-200 rounded-xl overflow-hidden bg-white">
      {/* --- Section Header --- */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between px-5 py-4 cursor-pointer transition-colors',
          'hover:bg-primary-50',
          isExpanded && 'border-b border-primary-200'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-primary-700" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-primary-900">
              Muhendislik, Test ve Devreye Alma Hizmetleri
            </h3>
            <p className="text-sm text-primary-500">
              {serviceItems.length} hizmet kalemi
              {serviceItems.length > 0 && ` \u2022 ${formatCurrency(totalServiceCost)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {serviceItems.length > 0 && (
            <Badge variant="info" className="text-xs">
              {serviceItems.length}
            </Badge>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-primary-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-primary-500" />
          )}
        </div>
      </button>

      {/* --- Expanded Content --- */}
      {isExpanded && (
        <div className="p-5 space-y-4">
          {/* --- Service Items List --- */}
          {serviceItems.length > 0 ? (
            <div className="space-y-3">
              {serviceItems.map((item) => {
                const isItemExpanded = expandedItemId === item.id;
                const meta = item.serviceMeta;

                return (
                  <div
                    key={item.id}
                    className="border border-primary-200 rounded-lg overflow-hidden"
                  >
                    {/* Item Header */}
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-primary-50 transition-colors">
                      <button
                        type="button"
                        className="flex-1 flex items-center gap-3 text-left cursor-pointer"
                        onClick={() =>
                          setExpandedItemId(isItemExpanded ? null : item.id)
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-primary-900 truncate">
                            {item.description}
                          </p>
                          {meta?.serviceType && (
                            <p className="text-xs text-primary-500 mt-0.5">
                              {serviceTypeLabels[meta.serviceType] || meta.serviceType}
                              {meta.locationType &&
                                ` \u2022 ${locationLabels[meta.locationType] || meta.locationType}`}
                              {meta.teamSize && ` \u2022 ${meta.teamSize} kisi`}
                              {meta.days && ` \u2022 ${meta.days} gun`}
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-primary-900 whitespace-nowrap">
                          {formatCurrency(item.totalPrice)}
                        </span>
                        {isItemExpanded ? (
                          <ChevronUp className="w-4 h-4 text-primary-400 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-primary-400 flex-shrink-0" />
                        )}
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        isLoading={deletingId === item.id}
                        className="ml-2 text-red-600 hover:bg-red-50"
                        title="Sil"
                      >
                        {deletingId !== item.id && <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>

                    {/* Item Breakdown */}
                    {isItemExpanded && meta && (
                      <div className="border-t border-primary-100 bg-primary-50 px-4 py-3">
                        <ServiceMetaBreakdown meta={meta} currency={currency} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6">
              <Wrench className="w-8 h-8 text-primary-300 mx-auto mb-2" />
              <p className="text-sm text-primary-500">
                Henuz hizmet kalemi eklenmedi
              </p>
            </div>
          )}

          {/* --- Add Service / Calculator --- */}
          {showCalculator ? (
            <ServiceCostCalculator
              quoteId={quoteId}
              onServiceAdded={handleServiceAdded}
              onClose={() => setShowCalculator(false)}
            />
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCalculator(true)}
              className="w-full"
            >
              <Plus className="w-4 h-4" />
              Hizmet Ekle
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Service Meta Breakdown Sub-component ----------
function ServiceMetaBreakdown({
  meta,
  currency,
}: {
  meta: any;
  currency: string;
}) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: currency === 'TRY' ? 'TRY' : currency,
    }).format(val);

  const breakdown = meta.breakdown || meta;

  return (
    <div className="space-y-2 text-sm">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        {meta.serviceType && (
          <Badge variant="info">
            {serviceTypeLabels[meta.serviceType] || meta.serviceType}
          </Badge>
        )}
        {meta.locationType && (
          <Badge variant="default">
            {locationLabels[meta.locationType] || meta.locationType}
          </Badge>
        )}
        {meta.teamSize && (
          <Badge variant="default">{meta.teamSize} kisi</Badge>
        )}
        {meta.days && (
          <Badge variant="default">{meta.days} gun</Badge>
        )}
        {meta.distanceKm && (
          <Badge variant="default">{meta.distanceKm} km</Badge>
        )}
      </div>

      {/* Cost rows */}
      <div className="divide-y divide-primary-200 border border-primary-200 rounded-lg bg-white overflow-hidden">
        {breakdown.salary != null && (
          <MetaRow label="Maas (gunluk)" value={formatCurrency(breakdown.salary)} />
        )}
        {breakdown.hotel != null && breakdown.hotel > 0 && (
          <MetaRow label="Otel (gunluk)" value={formatCurrency(breakdown.hotel)} />
        )}
        {breakdown.meals != null && breakdown.meals > 0 && (
          <MetaRow label="Yemek (gunluk)" value={formatCurrency(breakdown.meals)} />
        )}
        {breakdown.vehicle != null && (
          <MetaRow label="Arac (gunluk)" value={formatCurrency(breakdown.vehicle)} />
        )}
        {breakdown.kmCost != null && breakdown.kmCost > 0 && (
          <MetaRow label="KM Maliyeti" value={formatCurrency(breakdown.kmCost)} />
        )}
        {breakdown.dailyTotal != null && (
          <div className="flex items-center justify-between px-3 py-2 bg-primary-50">
            <span className="font-medium text-primary-700">Gunluk Toplam</span>
            <span className="font-semibold text-primary-900 tabular-nums">
              {formatCurrency(breakdown.dailyTotal)}
            </span>
          </div>
        )}
        {breakdown.subtotal != null && (
          <MetaRow label="Ara Toplam" value={formatCurrency(breakdown.subtotal)} />
        )}
        {breakdown.liftingCost != null && breakdown.liftingCost > 0 && (
          <MetaRow label="Kaldirma Ekipmani" value={formatCurrency(breakdown.liftingCost)} />
        )}
        {breakdown.grandTotal != null && (
          <div className="flex items-center justify-between px-3 py-2.5 bg-primary-700">
            <span className="font-bold text-white">Genel Toplam</span>
            <span className="font-bold text-white tabular-nums">
              {formatCurrency(breakdown.grandTotal)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Meta Row ----------
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-primary-600">{label}</span>
      <span className="font-medium text-primary-800 tabular-nums">{value}</span>
    </div>
  );
}
