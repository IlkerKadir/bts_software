'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Input } from '@/components/ui';
import { isStfEditable } from '@/lib/orders/order-access';
import { computeStfGrandTotalAtIndex } from '@/lib/stf/stf-totals';

interface StfItem {
  id?: string;
  sortOrder: number;
  itemType: string;
  pozNo: string | null;
  code: string | null;
  brand: string | null;
  model: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  priceLabel: string | null;
  parentItemId: string | null;
  discountPct: number;
  sectionNote: string | null;
  sectionDiscountPct: number | null;
  sectionDiscountLabel: string | null;
}

interface StfData {
  id: string;
  orderNumber: string;
  customerName: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerTaxInfo: string | null;
  projectName: string | null;
  quoteNo: string | null;
  refNo: string | null;
  formDate: string | null;
  siparisNo: string | null;
  currency: string;
  discountTotal: number;
  grandTotal: number;
  manufacturers: string | null;
  warranty: string | null;
  deliveryPlace: string | null;
  deliveryTime: string | null;
  paymentTerms: string | null;
  vatNote: string | null;
  notes: string | null;
  freeNote: string | null;
  customerApprovalName: string | null;
  btsResponsibleName: string | null;
  status: string;
  items: StfItem[];
}

const HEADER_FIELDS: { key: keyof StfData; label: string }[] = [
  { key: 'customerName', label: 'Firma Adı / İlgili Kişi' },
  { key: 'customerAddress', label: 'Firma Adresi' },
  { key: 'customerPhone', label: 'Firma Telefon' },
  { key: 'customerTaxInfo', label: 'V.D. / Vergi No' },
  { key: 'projectName', label: 'Proje Adı' },
  { key: 'quoteNo', label: 'Teklif No' },
  { key: 'refNo', label: 'Ref No' },
  { key: 'siparisNo', label: 'Sipariş No' },
];

const FOOTER_FIELDS: [keyof StfData, string][] = [
  ['manufacturers', 'Üretici Firmalar'],
  ['warranty', 'Garanti'],
  ['deliveryPlace', 'Teslim Yeri'],
  ['paymentTerms', 'Ödeme'],
  ['vatNote', 'KDV'],
  ['deliveryTime', 'Teslimat'],
  ['notes', 'Notlar'],
  ['customerApprovalName', 'Müşteri Onayı'],
  ['btsResponsibleName', 'BTS Sorumlusu'],
];

export function StfEditor({ stfId }: { stfId: string }) {
  const [stf, setStf] = useState<StfData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showFreeNote, setShowFreeNote] = useState(false);

  const fetchStf = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${stfId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'STF yüklenemedi');
      setStf({ ...data.order, items: data.order.items ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
    } finally {
      setIsLoading(false);
    }
  }, [stfId]);

  useEffect(() => { fetchStf(); }, [fetchStf]);

  // Parse a numeric input value: empty → 0, invalid (NaN) → keep previous.
  const parseNum = (raw: string, prev: number): number => {
    if (raw === '') return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : prev;
  };

  const setField = (key: keyof StfData, value: string) =>
    setStf((p) => (p ? { ...p, [key]: value } : p));

  const setItem = (idx: number, patch: Partial<StfItem>) =>
    setStf((p) => {
      if (!p) return p;
      const items = p.items.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        // Recompute the line total like the quote's computeRowTotal
        // (qty × unitPrice × (1 − discountPct/100), 2dp). Skip when a
        // priceLabel replaces the price, and skip SET parents — their
        // totalPrice is the rolled-up sum of their children, not
        // qty×unitPrice, so recomputing it would corrupt section/grand totals.
        if (!next.priceLabel && next.itemType !== 'SET') {
          const gross = Number(next.quantity) * Number(next.unitPrice);
          const net = gross * (1 - Number(next.discountPct) / 100);
          next.totalPrice = Math.round((net + Number.EPSILON) * 100) / 100;
        }
        return next;
      });
      return { ...p, items };
    });

  const handleSave = async () => {
    if (!stf) return;
    setIsSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch(`/api/orders/${stfId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stf),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi');
      setStf({ ...data.order, items: data.order.items ?? [] });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="p-6 text-sm text-primary-500">Yükleniyor...</div>;
  if (!stf) return <div className="p-6 text-sm text-red-600">{error || 'STF bulunamadı'}</div>;

  // Sent (GONDERILDI) / terminal (TAMAMLANDI/IPTAL) STFs are frozen: the server
  // rejects PUT for them, so render the whole form read-only and hide Kaydet
  // instead of letting the user type edits that would be lost on save.
  const editable = isStfEditable(stf.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary-900">{stf.orderNumber}</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-700">Kaydedildi ✓</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
          {editable && <Button onClick={handleSave} isLoading={isSaving}>Kaydet</Button>}
        </div>
      </div>

      {!editable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Bu STF tamamlanmış veya iptal edilmiş — salt-okunur. Düzenlemek için &quot;Taslağa Geri Çek&quot; yapın.
        </div>
      )}

      <fieldset disabled={!editable} className="m-0 min-w-0 border-0 p-0 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-primary-200 p-4">
        {HEADER_FIELDS.map((f) => (
          <Input
            key={f.key as string}
            label={f.label}
            value={(stf[f.key] as string | null) ?? ''}
            onChange={(e) => setField(f.key, e.target.value)}
          />
        ))}
        <Input
          label="Tarih"
          type="date"
          value={stf.formDate ? stf.formDate.split('T')[0] : ''}
          onChange={(e) => setField('formDate', e.target.value)}
        />
        <Input label="Para Birimi" value={stf.currency} onChange={(e) => setField('currency', e.target.value)} />
      </div>

      <div className="rounded-lg border border-primary-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-primary-50 text-xs uppercase text-primary-600">
            <tr>
              <th className="px-2 py-2 text-left">Poz</th>
              <th className="px-2 py-2 text-left">Ürün Adı</th>
              <th className="px-2 py-2 text-right">Miktar</th>
              <th className="px-2 py-2 text-left">Birim</th>
              <th className="px-2 py-2 text-right">Birim Fiyat</th>
              <th className="px-2 py-2 text-right">Toplam</th>
              <th className="px-2 py-2 text-left">Satın Alma Notu</th>
            </tr>
          </thead>
          <tbody>
            {stf.items.map((it, idx) => {
              if (it.itemType === 'HEADER') {
                return (
                  <tr key={it.id ?? idx} className="border-t border-primary-100 bg-green-50">
                    <td className="px-2 py-1"></td>
                    <td className="px-2 py-1" colSpan={6}>
                      <input className="w-full bg-transparent font-semibold uppercase" value={it.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })} />
                    </td>
                  </tr>
                );
              }
              if (it.itemType === 'NOTE') {
                return (
                  <tr key={it.id ?? idx} className="border-t border-primary-100">
                    <td className="px-2 py-1 text-center text-xs text-primary-500">{it.pozNo || 'NOT:'}</td>
                    <td className="px-2 py-1" colSpan={6}>
                      <input className="w-full bg-transparent italic" value={it.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })} />
                    </td>
                  </tr>
                );
              }
              if (it.itemType === 'SUBTOTAL') {
                return (
                  <tr key={it.id ?? idx} className="border-t border-primary-200 bg-primary-50">
                    <td className="px-2 py-1 text-xs font-medium text-primary-600" colSpan={2}>
                      Ara Toplam / İndirim
                    </td>
                    <td className="px-2 py-1" colSpan={2}>
                      <input className="w-full bg-transparent text-xs" placeholder="İndirim etiketi"
                        value={it.sectionDiscountLabel ?? ''}
                        onChange={(e) => setItem(idx, { sectionDiscountLabel: e.target.value })} />
                    </td>
                    <td className="px-2 py-1 text-right" colSpan={3}>
                      <input className="w-16 bg-transparent text-right" type="number" placeholder="%"
                        value={it.sectionDiscountPct ?? ''}
                        onChange={(e) => setItem(idx, {
                          sectionDiscountPct: e.target.value === '' ? null : parseNum(e.target.value, it.sectionDiscountPct ?? 0),
                        })} />
                      <span className="ml-1 text-xs text-primary-500">% indirim</span>
                    </td>
                  </tr>
                );
              }
              if (it.itemType === 'GRAND_TOTAL') {
                // A "GENEL TOPLAM" marker row from the quote — render the running
                // grand total at this position, NOT an editable product row.
                const runningTotal = computeStfGrandTotalAtIndex(stf.items, idx);
                return (
                  <tr key={it.id ?? idx} className="border-t-2 border-primary-300 bg-primary-100 font-semibold text-primary-900">
                    <td className="px-2 py-1 text-right" colSpan={5}>
                      {(it.description?.trim() || 'GENEL TOPLAM')} ({stf.currency})
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{runningTotal.toFixed(2)}</td>
                    <td className="px-2 py-1"></td>
                  </tr>
                );
              }
              // PRODUCT / SET / CUSTOM. SET children (parentItemId set) show "*"
              // and their qty/unitPrice are READ-ONLY: a SET parent's totalPrice
              // already carries the rolled-up children total, so editing a child
              // would desync the section/grand total (which excludes children).
              const isChild = !!it.parentItemId;
              return (
                <tr key={it.id ?? idx} className="border-t border-primary-100">
                  <td className="px-2 py-1">{isChild ? '*' : (it.pozNo ?? '')}</td>
                  <td className="px-2 py-1">
                    <input className="w-full bg-transparent" value={it.description}
                      onChange={(e) => setItem(idx, { description: e.target.value })} />
                  </td>
                  <td className="px-2 py-1 text-right">
                    {isChild ? (
                      <span className="tabular-nums text-primary-400">{it.quantity}</span>
                    ) : (
                      <input className="w-16 bg-transparent text-right" type="number" value={it.quantity}
                        onChange={(e) => setItem(idx, { quantity: parseNum(e.target.value, it.quantity) })} />
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {isChild ? (
                      <span className="text-primary-400">{it.unit}</span>
                    ) : (
                      <input className="w-16 bg-transparent" value={it.unit}
                        onChange={(e) => setItem(idx, { unit: e.target.value })} />
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {isChild ? (
                      <span className="tabular-nums text-primary-400">{Number(it.unitPrice).toFixed(2)}</span>
                    ) : (
                      <input className="w-24 bg-transparent text-right" type="number" value={it.unitPrice}
                        onChange={(e) => setItem(idx, { unitPrice: parseNum(e.target.value, it.unitPrice) })} />
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {it.priceLabel ? it.priceLabel : Number(it.totalPrice).toFixed(2)}
                  </td>
                  <td className="px-2 py-1">
                    <input className="w-full bg-transparent" value={it.sectionNote ?? ''}
                      onChange={(e) => setItem(idx, { sectionNote: e.target.value })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-6 text-sm">
        <span className="text-primary-600">İndirim: <b className="tabular-nums">{Number(stf.discountTotal).toFixed(2)}</b></span>
        <span className="text-primary-900">Genel Toplam: <b className="tabular-nums">{Number(stf.grandTotal).toFixed(2)} {stf.currency}</b></span>
      </div>

      {/* Serbest Kalem — free-form line rendered between the items and the footer
          (above ÜRETİCİ FİRMALAR) on the PDF/Excel when filled. Hidden behind an
          "+ Serbest Kalem Ekle" button until used. */}
      {showFreeNote || (stf.freeNote && stf.freeNote.trim()) ? (
        <div className="space-y-1">
          <label className="text-xs font-medium text-primary-700">Not</label>
          <textarea
            rows={2}
            autoFocus={showFreeNote}
            placeholder="Kalem tablosunun altına eklenecek not..."
            className="w-full px-2 py-1 border border-primary-300 rounded text-sm"
            value={stf.freeNote ?? ''}
            onChange={(e) => setField('freeNote', e.target.value)}
          />
        </div>
      ) : editable ? (
        // Hidden (not just disabled) when the STF is read-only: a dead
        // "+ Not Ekle" inside the disabled fieldset reads as "not working".
        <button
          type="button"
          onClick={() => setShowFreeNote(true)}
          className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
        >
          + Not Ekle
        </button>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-primary-200 p-4">
        {FOOTER_FIELDS.map(([key, label]) => (
          <div key={key as string} className="space-y-1">
            <label className="text-xs font-medium text-primary-700">{label}</label>
            <textarea
              rows={2}
              className="w-full px-2 py-1 border border-primary-300 rounded text-sm"
              value={(stf[key] as string | null) ?? ''}
              onChange={(e) => setField(key, e.target.value)}
            />
          </div>
        ))}
      </div>
      </fieldset>
    </div>
  );
}
