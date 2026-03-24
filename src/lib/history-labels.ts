export const FIELD_LABELS: Record<string, string> = {
  refNo: 'Referans No',
  currency: 'Para Birimi',
  subject: 'Konu',
  description: 'Sistem Başlık',
  language: 'Dil',
  projectId: 'Proje',
  discountPct: 'İskonto %',
  exchangeRate: 'Döviz Kuru',
  validityDays: 'Geçerlilik Süresi (Gün)',
  protectionPct: 'Koruma %',
  protectionMap: 'Koruma Haritası',
  notes: 'Notlar',
  status: 'Durum',
};

// Fields to skip in display (internal/noise)
export const HIDDEN_FIELDS = ['protectionMap', 'notes'];
