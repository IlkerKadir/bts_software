'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Badge, Spinner } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface QuoteRow {
  id: string;
  quoteNumber: string;
  company: { id: string; name: string };
  grandTotal: number | string;
  status: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export function RecentQuotes() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchQuotes() {
      try {
        const res = await fetch('/api/quotes?limit=10');
        if (!res.ok) throw new Error('Veri yüklenemedi');
        const data = await res.json();
        setQuotes(data.quotes || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bir hata oluştu');
      } finally {
        setLoading(false);
      }
    }
    fetchQuotes();
  }, []);

  return (
    <Card>
      <div className="px-5 py-4 border-b border-primary-200 flex items-center justify-between">
        <h2 className="font-semibold text-primary-900">Son Teklifler</h2>
        <Link
          href="/quotes"
          className="text-sm text-accent-700 hover:text-primary-700 hover:underline transition-colors"
        >
          Tümünü Gör &rarr;
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : error ? (
        <div className="px-5 py-8 text-center text-red-600 text-sm">
          {error}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Teklif No</th>
                <th>Firma</th>
                <th>Toplam</th>
                <th>Durum</th>
                <th>Tarih</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr
                  key={quote.id}
                  className="cursor-pointer hover:bg-primary-50 transition-colors"
                  onClick={() => router.push(`/quotes/${quote.id}`)}
                >
                  <td className="font-medium text-primary-900">
                    {quote.quoteNumber}
                  </td>
                  <td className="text-primary-700">
                    {quote.company.name}
                  </td>
                  <td className="tabular-nums text-primary-800">
                    {formatCurrency(quote.grandTotal, quote.currency)}
                  </td>
                  <td>
                    <Badge status={quote.status as Parameters<typeof Badge>[0]['status']} />
                  </td>
                  <td className="text-primary-500 text-sm">
                    {formatDate(quote.updatedAt || quote.createdAt)}
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-primary-500 py-8">
                    Henüz teklif bulunmuyor
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
