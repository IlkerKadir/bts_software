'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Upload,
  Save,
  Trash2,
  Building2,
  Palette,
  Settings,
  Image,
} from 'lucide-react';
import { Button, Card, Input, Select, Spinner } from '@/components/ui';

interface TemplateSettings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyTaxId: string;
  companyWebsite: string;
  logoPath: string | null;
  footerText: string;
  primaryColor: string;
  secondaryColor: string;
  defaultValidityDays: number;
  defaultCurrency: string;
}

const DEFAULT_SETTINGS: TemplateSettings = {
  companyName: 'BTS Yangın Güvenlik Sistemleri',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyTaxId: '',
  companyWebsite: '',
  logoPath: null,
  footerText: '',
  primaryColor: '#1e40af',
  secondaryColor: '#3b82f6',
  defaultValidityDays: 30,
  defaultCurrency: 'EUR',
};

export default function TemplateSettingsPage() {
  const [settings, setSettings] = useState<TemplateSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/template');
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'Ayarlar kaydedildi' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Bir hata oluştu' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Ayarlar kaydedilirken bir hata oluştu' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const response = await fetch('/api/settings/template/logo', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setSettings((prev) => ({ ...prev, logoPath: data.logoPath }));
        setMessage({ type: 'success', text: 'Logo yüklendi' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Logo yüklenemedi' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Logo yüklenirken bir hata oluştu' });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!confirm('Logoyu silmek istediğinize emin misiniz?')) return;

    try {
      const response = await fetch('/api/settings/template/logo', {
        method: 'DELETE',
      });

      if (response.ok) {
        setSettings((prev) => ({ ...prev, logoPath: null }));
        setMessage({ type: 'success', text: 'Logo silindi' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Logo silinirken bir hata oluştu' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Şablon Ayarları</h1>
          <p className="text-primary-500">PDF ve Excel export şablonlarını özelleştirin</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
          Kaydet
        </Button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-success-50 text-success-700 border border-success-200'
              : 'bg-error-50 text-error-700 border border-error-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Logo Section */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
            <Image className="w-5 h-5" />
            Logo
          </h2>
          <div className="flex items-start gap-6">
            <div className="w-48 h-24 border-2 border-dashed border-primary-200 rounded-lg flex items-center justify-center bg-primary-50">
              {settings.logoPath ? (
                <img
                  src={settings.logoPath}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <span className="text-sm text-primary-400">Logo yok</span>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-200 cursor-pointer px-4 py-2.5 text-sm bg-white hover:bg-primary-50 text-primary-700 border border-primary-300 ${isUploadingLogo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                    disabled={isUploadingLogo}
                  />
                  {isUploadingLogo ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />}
                  Logo Yükle
                </label>
                {settings.logoPath && (
                  <Button variant="ghost" onClick={handleLogoDelete}>
                    <Trash2 className="w-4 h-4 text-error-600" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-primary-500">
                PNG, JPEG, GIF veya SVG. Maksimum 2MB.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Company Info Section */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Firma Bilgileri
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Firma Adı"
              value={settings.companyName}
              onChange={(e) => setSettings((prev) => ({ ...prev, companyName: e.target.value }))}
              required
            />
            <Input
              label="Vergi No"
              value={settings.companyTaxId}
              onChange={(e) => setSettings((prev) => ({ ...prev, companyTaxId: e.target.value }))}
            />
            <div className="md:col-span-2">
              <Input
                label="Adres"
                value={settings.companyAddress}
                onChange={(e) => setSettings((prev) => ({ ...prev, companyAddress: e.target.value }))}
              />
            </div>
            <Input
              label="Telefon"
              value={settings.companyPhone}
              onChange={(e) => setSettings((prev) => ({ ...prev, companyPhone: e.target.value }))}
            />
            <Input
              label="E-posta"
              type="email"
              value={settings.companyEmail}
              onChange={(e) => setSettings((prev) => ({ ...prev, companyEmail: e.target.value }))}
            />
            <Input
              label="Web Sitesi"
              value={settings.companyWebsite}
              onChange={(e) => setSettings((prev) => ({ ...prev, companyWebsite: e.target.value }))}
            />
          </div>
        </div>
      </Card>

      {/* Colors Section */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Renkler
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-primary-700 mb-1">
                Ana Renk
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings((prev) => ({ ...prev, primaryColor: e.target.value }))}
                  className="w-12 h-10 rounded cursor-pointer border border-primary-200"
                />
                <Input
                  value={settings.primaryColor}
                  onChange={(e) => setSettings((prev) => ({ ...prev, primaryColor: e.target.value }))}
                  className="flex-1"
                  maxLength={7}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-primary-700 mb-1">
                İkincil Renk
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.secondaryColor}
                  onChange={(e) => setSettings((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                  className="w-12 h-10 rounded cursor-pointer border border-primary-200"
                />
                <Input
                  value={settings.secondaryColor}
                  onChange={(e) => setSettings((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                  className="flex-1"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Defaults Section */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Varsayılan Değerler
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Varsayılan Geçerlilik Süresi (gün)"
              type="number"
              min={1}
              max={365}
              value={settings.defaultValidityDays}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  defaultValidityDays: parseInt(e.target.value) || 30,
                }))
              }
            />
            <Select
              label="Varsayılan Para Birimi"
              value={settings.defaultCurrency}
              onChange={(e) => setSettings((prev) => ({ ...prev, defaultCurrency: e.target.value }))}
              options={[
                { value: 'EUR', label: 'Euro (EUR)' },
                { value: 'USD', label: 'Dolar (USD)' },
                { value: 'GBP', label: 'Sterlin (GBP)' },
                { value: 'TRY', label: 'Türk Lirası (TRY)' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Footer Section */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Alt Bilgi Metni
          </h2>
          <textarea
            value={settings.footerText}
            onChange={(e) => setSettings((prev) => ({ ...prev, footerText: e.target.value }))}
            className="input min-h-24"
            placeholder="PDF belgesinin alt bilgisinde görünecek metin..."
            maxLength={1000}
          />
          <p className="text-xs text-primary-500 mt-1">
            Bu metin, PDF belgelerinin altında görüntülenecektir.
          </p>
        </div>
      </Card>
    </div>
  );
}
