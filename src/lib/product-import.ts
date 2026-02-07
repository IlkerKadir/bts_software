import ExcelJS from 'exceljs';

export interface ImportedProduct {
  code: string;
  shortCode: string;
  brandName: string;
  model: string;
  nameTr: string;
  nameEn: string;
  listPrice: number;
  currency: string;
}

export interface ImportPreview {
  totalProducts: number;
  newProducts: number;
  priceChanges: number;
  unchanged: number;
  products: ImportedProduct[];
}

interface ColumnIndices {
  marka: number;
  model: number;
  kisaKod: number;
  urunKodu: number;
  urunAdi: number;
  listeFiyati: number;
  paraBirimi: number;
  dil: number; // language column (TR / ING / EN)
}

/**
 * Normalize a header string for matching: uppercase, trim, remove accented chars
 */
function normalizeHeader(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ə/g, 'A');
}

/**
 * Detect header row and column indices by scanning the first 10 rows
 * for the keyword "URUN KODU" (or "ÜRÜN KODU").
 */
function detectHeaderRow(worksheet: ExcelJS.Worksheet): { headerRow: number; columns: ColumnIndices } | null {
  const maxScanRows = Math.min(10, worksheet.rowCount);

  for (let rowNum = 1; rowNum <= maxScanRows; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const cellValues: string[] = [];

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cellValues[colNumber] = normalizeHeader(cell.value);
    });

    // Check if this row contains the "URUN KODU" header
    const hasUrunKodu = cellValues.some(
      (v) => v && (v.includes('URUN KODU') || v.includes('URUN_KODU') || v === 'URUNKODU')
    );

    if (!hasUrunKodu) continue;

    // Found the header row - map columns
    const columns: Partial<ColumnIndices> = {};

    for (let col = 1; col < cellValues.length; col++) {
      const val = cellValues[col];
      if (!val) continue;

      if (val.includes('MARKA') && !val.includes('SISTEM')) {
        columns.marka = col;
      } else if (val === 'MODEL' || val.includes('MODEL')) {
        columns.model = col;
      } else if (val.includes('KISA KOD') || val.includes('KISA_KOD') || val === 'KISAKOD' || val === 'KKOD') {
        columns.kisaKod = col;
      } else if (val.includes('URUN KODU') || val.includes('URUN_KODU') || val === 'URUNKODU') {
        columns.urunKodu = col;
      } else if (val.includes('URUN ADI') || val.includes('URUN_ADI') || val === 'URUNADI' || val === 'ACIKLAMA') {
        columns.urunAdi = col;
      } else if (
        val.includes('LISTE FIYATI') ||
        val.includes('LISTE_FIYATI') ||
        val === 'LISTEFIYATI' ||
        val.includes('FIYAT')
      ) {
        // Only match FIYAT if we haven't already found a LISTE FIYATI column
        if (!columns.listeFiyati || val.includes('LISTE')) {
          columns.listeFiyati = col;
        }
      } else if (
        val.includes('PARA BIRIMI') ||
        val.includes('PARA_BIRIMI') ||
        val === 'PARABIRIMI' ||
        val === 'DOVIZ' ||
        val.includes('CURRENCY')
      ) {
        columns.paraBirimi = col;
      } else if (val === 'DIL' || val === 'LANGUAGE' || val === 'LANG' || val === 'LNG') {
        columns.dil = col;
      }
    }

    // Validate required columns
    if (!columns.urunKodu) continue;

    // Return with defaults for missing optional columns
    return {
      headerRow: rowNum,
      columns: {
        marka: columns.marka || 0,
        model: columns.model || 0,
        kisaKod: columns.kisaKod || 0,
        urunKodu: columns.urunKodu,
        urunAdi: columns.urunAdi || 0,
        listeFiyati: columns.listeFiyati || 0,
        paraBirimi: columns.paraBirimi || 0,
        dil: columns.dil || 0,
      },
    };
  }

  return null;
}

/**
 * Get string value from a cell, handling different ExcelJS cell types
 */
function getCellString(row: ExcelJS.Row, colIndex: number): string {
  if (colIndex <= 0) return '';
  const cell = row.getCell(colIndex);
  if (cell.value == null) return '';
  if (typeof cell.value === 'object' && 'richText' in cell.value) {
    // Handle rich text
    return (cell.value as ExcelJS.CellRichTextValue).richText
      .map((rt) => rt.text)
      .join('')
      .trim();
  }
  return String(cell.value).trim();
}

/**
 * Get numeric value from a cell
 */
function getCellNumber(row: ExcelJS.Row, colIndex: number): number {
  if (colIndex <= 0) return 0;
  const cell = row.getCell(colIndex);
  if (cell.value == null) return 0;
  const num = Number(cell.value);
  return isNaN(num) ? 0 : num;
}

/**
 * Determine the language of a row: 'TR', 'EN', or null (unknown)
 */
function detectRowLanguage(row: ExcelJS.Row, dilColIndex: number): 'TR' | 'EN' | null {
  if (dilColIndex <= 0) return null;
  const langValue = normalizeHeader(getCellString(row, dilColIndex));
  if (langValue === 'TR' || langValue === 'TURKCE' || langValue === 'TURCE') {
    return 'TR';
  }
  if (langValue === 'EN' || langValue === 'ING' || langValue === 'INGILIZCE' || langValue === 'ENGLISH') {
    return 'EN';
  }
  return null;
}

/**
 * Normalize currency string to standard format
 */
function normalizeCurrency(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (upper === 'EUR' || upper === 'EURO' || upper === '€') return 'EUR';
  if (upper === 'USD' || upper === 'DOLAR' || upper === '$') return 'USD';
  if (upper === 'GBP' || upper === 'STERLIN' || upper === '£') return 'GBP';
  if (upper === 'TRY' || upper === 'TL' || upper === 'TURK LIRASI' || upper === '₺') return 'TRY';
  return upper || 'EUR';
}

/**
 * Parse a Master Price List Excel file and return an array of ImportedProduct.
 *
 * The Excel is expected to have columns:
 *   MARKA, MODEL, KISA KOD, URUN KODU, URUN ADI, LISTE FIYATI, PARA BIRIMI
 *
 * TR and ING rows are identified by a language column. Products with the same
 * URUN KODU but different language have their names merged into nameTr / nameEn.
 */
export async function parseProductExcel(buffer: Buffer): Promise<ImportedProduct[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Excel dosyasında çalışma sayfası bulunamadı');
  }

  const detection = detectHeaderRow(worksheet);
  if (!detection) {
    throw new Error(
      'Excel dosyasında başlık satırı bulunamadı. "ÜRÜN KODU" sütunu içeren bir satır gereklidir.'
    );
  }

  const { headerRow, columns } = detection;
  const products = new Map<string, ImportedProduct>();

  // Iterate all data rows after the header
  const totalRows = worksheet.rowCount;
  for (let rowNum = headerRow + 1; rowNum <= totalRows; rowNum++) {
    const row = worksheet.getRow(rowNum);

    // Get product code - skip rows without one
    const code = getCellString(row, columns.urunKodu);
    if (!code) continue;

    const brandName = getCellString(row, columns.marka);
    const model = getCellString(row, columns.model);
    const shortCode = getCellString(row, columns.kisaKod);
    const name = getCellString(row, columns.urunAdi);
    const listPrice = getCellNumber(row, columns.listeFiyati);
    const currencyRaw = getCellString(row, columns.paraBirimi);
    const currency = normalizeCurrency(currencyRaw);
    const language = detectRowLanguage(row, columns.dil);

    const existing = products.get(code);

    if (existing) {
      // Merge: overwrite the corresponding language field when detected
      if (language === 'TR' && name) {
        existing.nameTr = name;
      } else if (language === 'EN' && name) {
        existing.nameEn = name;
      } else if (!language && name) {
        // No language column or unknown language - set BOTH fields
        existing.nameTr = name;
        existing.nameEn = name;
      }

      // Update other fields if they were empty before
      if (!existing.brandName && brandName) existing.brandName = brandName;
      if (!existing.model && model) existing.model = model;
      if (!existing.shortCode && shortCode) existing.shortCode = shortCode;
      // Use the latest non-zero price
      if (listPrice > 0 && existing.listPrice === 0) {
        existing.listPrice = listPrice;
        existing.currency = currency;
      }
    } else {
      // New product entry
      let nameTr = '';
      let nameEn = '';
      if (language === 'TR') {
        nameTr = name;
      } else if (language === 'EN') {
        nameEn = name;
      } else {
        // No language detection - set both fields
        nameTr = name;
        nameEn = name;
      }

      const product: ImportedProduct = {
        code,
        shortCode,
        brandName,
        model,
        nameTr,
        nameEn,
        listPrice,
        currency,
      };

      products.set(code, product);
    }
  }

  // Filter out entries with no meaningful data (must have a code and at least a name or price)
  return Array.from(products.values()).filter(
    (p) => p.code && (p.nameTr || p.nameEn || p.listPrice > 0)
  );
}

/**
 * Generate a preview comparing imported products against existing database products.
 * Categorizes each product as new, price-changed, or unchanged.
 */
export async function generateImportPreview(
  products: ImportedProduct[],
  existingProducts: Array<{ code: string; listPrice: number; currency: string }>
): Promise<ImportPreview> {
  const existingMap = new Map(existingProducts.map((p) => [p.code, p]));

  let newProducts = 0;
  let priceChanges = 0;
  let unchanged = 0;

  for (const product of products) {
    const existing = existingMap.get(product.code);
    if (!existing) {
      newProducts++;
    } else if (existing.listPrice !== product.listPrice || existing.currency !== product.currency) {
      priceChanges++;
    } else {
      unchanged++;
    }
  }

  return {
    totalProducts: products.length,
    newProducts,
    priceChanges,
    unchanged,
    products,
  };
}
