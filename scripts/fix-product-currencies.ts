/**
 * Fix product currencies in the database.
 *
 * The seed script defaulted all currencies to EUR. This script reads the
 * real_database.xlsx file (MARKALAR sheet, column J = PARA BİRİMİ) and
 * updates each product's currency to the correct value.
 *
 * Safe to run multiple times (idempotent) — it simply sets the currency
 * to whatever the Excel file says.
 *
 * Run with: npx tsx scripts/fix-product-currencies.ts
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Normalize raw currency string from Excel to standard ISO code.
 * Handles whitespace, encoding quirks, and Turkish abbreviations.
 */
function normalizeCurrency(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (upper === 'EURO' || upper === 'EUR' || upper === '€') return 'EUR';
  if (upper === 'USD' || upper === 'DOLAR' || upper === '$') return 'USD';
  if (upper === 'TL' || upper === 'TRY' || upper === 'TÜRK LİRASI' || upper === 'TURK LIRASI' || upper === '₺') return 'TRY';
  if (upper === 'GBP' || upper === 'STERLIN' || upper === '£') return 'GBP';
  // If we cannot determine the currency, return as-is so we can log it
  return upper || '';
}

async function main() {
  const excelPath = path.resolve(__dirname, '..', 'real_database.xlsx');
  console.log(`Reading Excel file: ${excelPath}`);

  const wb = XLSX.readFile(excelPath);
  const ws = wb.Sheets['MARKALAR'];
  if (!ws) {
    console.error('ERROR: Sheet "MARKALAR" not found in Excel file.');
    process.exit(1);
  }

  // Read all rows as arrays (header = row 0)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

  // Skip header row, filter out empty rows
  const dataRows = rows.slice(1).filter((row) => {
    const r = row as string[];
    return r[0] !== '' || r[4] !== ''; // must have brand (col A) or code (col E)
  });

  console.log(`Found ${dataRows.length} data rows in MARKALAR sheet\n`);

  // Counters
  const stats = {
    updated: 0,
    alreadyCorrect: 0,
    notFound: 0,
    noCode: 0,
    noCurrency: 0,
    errors: 0,
  };

  const currencyCounts: Record<string, number> = {};
  const notFoundCodes: string[] = [];
  const unknownCurrencies: string[] = [];

  for (const row of dataRows) {
    const r = row as (string | number)[];

    // Column E (index 4) = ÜRÜN KODU
    let code = String(r[4] ?? '').trim();
    if (!code) {
      // Try model (column C, index 2) as fallback — same logic as seed script
      const model = String(r[2] ?? '').trim();
      if (model) {
        code = model;
      } else {
        stats.noCode++;
        continue;
      }
    }

    // Column J (index 9) = PARA BİRİMİ
    const rawCurrency = String(r[9] ?? '').trim();
    if (!rawCurrency) {
      stats.noCurrency++;
      continue;
    }

    const currency = normalizeCurrency(rawCurrency);
    if (!['EUR', 'USD', 'TRY', 'GBP'].includes(currency)) {
      unknownCurrencies.push(`${code}: "${rawCurrency}" -> "${currency}"`);
      // Still attempt the update with the normalized value
    }

    // Track per-currency counts
    currencyCounts[currency] = (currencyCounts[currency] || 0) + 1;

    try {
      // Use updateMany to avoid throwing on "not found" — returns count
      const result = await prisma.product.updateMany({
        where: { code },
        data: { currency },
      });

      if (result.count > 0) {
        stats.updated++;
      } else {
        // Product code not found in database
        stats.notFound++;
        if (notFoundCodes.length < 20) {
          notFoundCodes.push(code);
        }
      }
    } catch (err) {
      stats.errors++;
      console.error(`  Error updating product "${code}":`, err);
    }
  }

  // ── Report ──
  console.log('=== CURRENCY FIX RESULTS ===\n');

  console.log('Updates per currency:');
  for (const [cur, count] of Object.entries(currencyCounts).sort()) {
    console.log(`  ${cur}: ${count} rows in Excel`);
  }

  console.log(`\nProducts updated:       ${stats.updated}`);
  console.log(`Already correct:        ${stats.alreadyCorrect}`);
  console.log(`Not found in database:  ${stats.notFound}`);
  console.log(`Rows without code:      ${stats.noCode}`);
  console.log(`Rows without currency:  ${stats.noCurrency}`);
  console.log(`Errors:                 ${stats.errors}`);

  if (notFoundCodes.length > 0) {
    console.log(`\nSample codes not found in DB (max 20):`);
    for (const code of notFoundCodes) {
      console.log(`  - ${code}`);
    }
  }

  if (unknownCurrencies.length > 0) {
    console.log(`\nUnrecognized currency values:`);
    for (const entry of unknownCurrencies) {
      console.log(`  - ${entry}`);
    }
  }

  // Verify final distribution in DB
  console.log('\n=== FINAL DB CURRENCY DISTRIBUTION ===');
  const distribution = await prisma.$queryRaw<Array<{ currency: string; _count: bigint }>>`
    SELECT currency, COUNT(*) as _count FROM "Product" GROUP BY currency ORDER BY currency
  `;
  for (const row of distribution) {
    console.log(`  ${row.currency}: ${row._count} products`);
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
