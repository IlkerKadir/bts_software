'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button, Input, Select, Card } from '@/components/ui';

interface Company {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  client: { id: string; name: string };
}

export default function NewQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    companyId: searchParams.get('companyId') || '',
    projectId: searchParams.get('projectId') || '',
    subject: '',
    currency: 'EUR',
    validityDays: 30,
    notes: '',
  });

  // Fetch companies
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('/api/companies?limit=100');
        const data = await response.json();
        setCompanies(data.companies || []);
      } catch (err) {
        console.error('Error fetching companies:', err);
      } finally {
        setIsLoadingCompanies(false);
      }
    };

    fetchCompanies();
  }, []);

  // Fetch projects filtered by selected company
  useEffect(() => {
    if (!formData.companyId) {
      setProjects([]);
      return;
    }

    const fetchProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const response = await fetch(`/api/projects?clientId=${formData.companyId}&limit=100`);
        const data = await response.json();
        setProjects(data.projects || []);
      } catch (err) {
        console.error('Error fetching projects:', err);
      } finally {
        setIsLoadingProjects(false);
      }
    };

    fetchProjects();
  }, [formData.companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.companyId) {
      setError('Firma secimi zorunludur');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: formData.companyId,
          projectId: formData.projectId || undefined,
          subject: formData.subject || undefined,
          currency: formData.currency,
          validityDays: formData.validityDays,
          notes: formData.notes || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Teklif olusturulurken bir hata olustu');
      }

      router.push(`/quotes/${data.quote.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata olustu');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/quotes')}
          className="p-2 hover:bg-primary-100 rounded-lg text-primary-600 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Yeni Teklif Olustur</h1>
          <p className="text-sm text-primary-500">Yeni bir teklif olusturmak icin formu doldurun</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Form */}
      <Card>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Company selector */}
          <Select
            label="Firma *"
            value={formData.companyId}
            onChange={(e) => {
              setFormData({
                ...formData,
                companyId: e.target.value,
                projectId: '', // Reset project when company changes
              });
            }}
            options={[
              { value: '', label: isLoadingCompanies ? 'Yukleniyor...' : 'Firma Secin' },
              ...companies.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />

          {/* Project selector */}
          <Select
            label="Proje"
            value={formData.projectId}
            onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
            options={[
              {
                value: '',
                label: !formData.companyId
                  ? 'Once firma secin'
                  : isLoadingProjects
                    ? 'Yukleniyor...'
                    : 'Proje Secin (Opsiyonel)',
              },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            disabled={!formData.companyId}
          />

          {/* Subject */}
          <Input
            label="Konu"
            placeholder="Teklif konusu girin"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          />

          {/* Currency */}
          <Select
            label="Para Birimi"
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
            options={[
              { value: 'EUR', label: 'EUR - Euro' },
              { value: 'USD', label: 'USD - Amerikan Dolari' },
              { value: 'GBP', label: 'GBP - Ingiliz Sterlini' },
              { value: 'TRY', label: 'TRY - Turk Lirasi' },
            ]}
          />

          {/* Validity Days */}
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">
              Gecerlilik Suresi (Gun)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={formData.validityDays}
              onChange={(e) =>
                setFormData({ ...formData, validityDays: parseInt(e.target.value) || 30 })
              }
              className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-primary-700 mb-1">
              Notlar
            </label>
            <textarea
              rows={3}
              placeholder="Opsiyonel notlar..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border border-primary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-primary-200">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push('/quotes')}
              disabled={isSubmitting}
            >
              Iptal
            </Button>
            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={!formData.companyId || isSubmitting}
            >
              <Plus className="w-4 h-4" />
              Olustur
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
