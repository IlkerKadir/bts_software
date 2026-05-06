/**
 * "Fatura Kodlama" option lists for the RefNoBuilderModal.
 *
 * The four categories (A=Bölüm, B=Konu, C=Kişi, D=Üretici) used to be
 * hardcoded in the modal. Per client request they're now admin-editable
 * via Settings → Fatura Kodlama. The DB stores the override under a
 * single `SystemSetting` row keyed `refno_options`; if it isn't set,
 * we fall back to the defaults below (the original hardcoded list,
 * which keeps existing installs working without a migration step).
 *
 * This file is **client-safe** — pure constants, types, and a sync
 * validator. The DB-loading helper lives in `refno-options-server.ts`
 * (marked `server-only`) so the client bundle for the modal doesn't
 * pull Prisma in transitively.
 *
 * Keep the defaults in sync with the schema TLM.23 EK.1 Rev8.
 */

export interface RefNoOption {
  value: string;
  label: string;
}

export interface RefNoOptionGroups {
  a: RefNoOption[];
  b: RefNoOption[];
  c: RefNoOption[];
  d: RefNoOption[];
}

export const SETTING_KEY = 'refno_options';

export const DEFAULT_REFNO_OPTIONS: RefNoOptionGroups = {
  a: [
    { value: '1', label: '1 - Yönetim' },
    { value: '2', label: '2 - Satış' },
    { value: '3', label: '3 - Teknik Satış' },
    { value: '4', label: '4 - Hizmet' },
  ],
  b: [
    { value: '1', label: '1 - Yangın Algılama' },
    { value: '2', label: '2 - Yangın Söndürme' },
    { value: '3', label: '3 - Yalıtım' },
    { value: '4', label: '4 - Seslendirme' },
    { value: '5', label: '5 - CCTV' },
    { value: '6', label: '6 - Kartlı Geçiş / Turnike' },
    { value: '7', label: '7 - Çevre Güvenliği' },
    { value: '8', label: '8 - Gaz Algılama' },
  ],
  c: [
    { value: '1', label: '1 - Levent' },
    { value: '2', label: '2 - Şelale' },
    { value: '5', label: '5 - Serhat' },
    { value: '6', label: '6 - Hakan (Teknik Servis)' },
    { value: '7', label: '7 - Hakan (Hizmet İşleri)' },
    { value: '8', label: '8 - (Boş)' },
    { value: '9', label: '9 - Cansu' },
  ],
  d: [
    { value: 'A', label: 'A - ZETA' },
    { value: 'B', label: 'B - JCI / TYCO / ZETTLER' },
    { value: 'C', label: 'C - BANDWEAVER' },
    { value: 'D', label: 'D - XTRALIS' },
    { value: 'E', label: 'E - TYCO Söndürme' },
    { value: 'F', label: 'F - Diğer Söndürme' },
    { value: 'G', label: 'G - Korsis STAT-X' },
    { value: 'H', label: 'H - TYCO Ambient (NEO)' },
    { value: 'I', label: 'I - ELEKTROPANC' },
    { value: 'J', label: 'J - SENSITRON' },
    { value: 'K', label: 'K - HAIKON' },
    { value: 'L', label: 'L - PANASONIC' },
    { value: 'M', label: 'M - WOLMAN (SIKA) / KBS' },
    { value: 'N', label: 'N - NEUTRON / FIREBREAK' },
    { value: 'O', label: 'O - EVENOS' },
    { value: 'P', label: 'P - MIKAFON' },
    { value: 'T', label: 'T - TELEDATA' },
    { value: 'U', label: 'U - Taşeron Hizmeti' },
    { value: 'V', label: 'V - İç Piyasa (Güç Kaynağı, Akü, vs.)' },
    { value: 'W', label: 'W - Devreye Alma' },
    { value: 'Y', label: 'Y - Montaj Malzemeleri (Kablo, Boru, vs.)' },
    { value: 'Z', label: 'Z - Bakım Servis' },
  ],
};

/** Validates an option group payload from the admin UI. */
export function validateRefNoOptions(payload: unknown): payload is RefNoOptionGroups {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  for (const key of ['a', 'b', 'c', 'd']) {
    const arr = p[key];
    if (!Array.isArray(arr)) return false;
    for (const item of arr) {
      if (!item || typeof item !== 'object') return false;
      const o = item as Record<string, unknown>;
      if (typeof o.value !== 'string' || typeof o.label !== 'string') return false;
      if (!o.value || !o.label) return false;
    }
  }
  return true;
}
