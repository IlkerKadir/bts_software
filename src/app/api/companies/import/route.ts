import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { COMPANY_TYPES, COMPANY_TYPE_LABELS, type CompanyTypeValue } from '@/lib/company-types';
import ExcelJS from 'exceljs';

/**
 * Normalize a type string from the Excel file to a valid CompanyType.
 * Accepts the enum value (CLIENT, MUTEAHHIT, ...), the Turkish label
 * (Müşteri, Müteahhit, ...), and legacy ASCII aliases for the original two.
 */
function normalizeCompanyType(raw: string): CompanyTypeValue | null {
  const upper = raw.trim().toLocaleUpperCase('tr-TR');

  // Direct enum value (e.g. "CLIENT", "MUTEAHHIT").
  const asEnum = COMPANY_TYPES.find((t) => t === upper);
  if (asEnum) return asEnum;

  // Turkish label (e.g. "MÜTEAHHİT" from "Müteahhit").
  const byLabel = COMPANY_TYPES.find(
    (t) => COMPANY_TYPE_LABELS[t].toLocaleUpperCase('tr-TR') === upper
  );
  if (byLabel) return byLabel;

  // Legacy ASCII aliases for the original two types.
  if (['MUSTERI', 'MÜŞTERİ', 'MÜSTERI'].includes(upper)) return 'CLIENT';
  if (['IS ORTAGI', 'İŞ ORTAĞI', 'İŞ ORTAGI', 'IS ORTAĞI'].includes(upper)) return 'PARTNER';

  return null;
}

/**
 * Convert an ExcelJS cell value to a plain string. The tricky cases
 * are hyperlink cells (`{ text, hyperlink }`, common for emails and
 * URLs), rich-text cells (`{ richText: [{ text }, ...] }`), and
 * formula cells (`{ formula, result }`). A naive `String(cell)` on
 * any of these produces `"[object Object]"`.
 */
function cellToString(cell: ExcelJS.CellValue): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string') return cell.trim();
  if (typeof cell === 'number' || typeof cell === 'boolean') {
    return String(cell).trim();
  }
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === 'object') {
    const obj = cell as unknown as Record<string, unknown>;
    // Hyperlink: { text, hyperlink }
    if (typeof obj.text === 'string') return obj.text.trim();
    // Rich text: { richText: [{ text, ... }, ...] }
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text?: string }[])
        .map((r) => r.text ?? '')
        .join('')
        .trim();
    }
    // Formula: { formula, result } — recurse on the computed result
    if ('result' in obj) {
      return cellToString(obj.result as ExcelJS.CellValue);
    }
    // Error cell: { error } — treat as empty
    if ('error' in obj) return '';
  }
  return String(cell).trim();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu islem icin yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'Dosya yuklenmedi' },
        { status: 400 }
      );
    }

    // Validate file extension
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json(
        { error: 'Gecersiz dosya formati. Lutfen Excel (.xlsx) dosyasi yukleyin.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json(
        { error: 'Excel dosyasinda sayfa bulunamadi' },
        { status: 400 }
      );
    }

    // Read header row to detect column mapping
    const headerRow = sheet.getRow(1);
    const headerMap: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const header = cellToString(cell.value).toLowerCase();
      headerMap[header] = colNumber;
    });

    // Map expected columns (support both Turkish and ASCII versions)
    const colName =
      headerMap['firma adi'] ??
      headerMap['firma adı'] ??
      headerMap['name'] ??
      null;
    const colType =
      headerMap['tip'] ??
      headerMap['type'] ??
      null;
    const colAddress =
      headerMap['adres'] ??
      headerMap['address'] ??
      null;
    const colTaxNumber =
      headerMap['vergi no'] ??
      headerMap['taxnumber'] ??
      null;
    const colPhone =
      headerMap['telefon'] ??
      headerMap['phone'] ??
      null;
    const colEmail =
      headerMap['e-posta'] ??
      headerMap['email'] ??
      null;

    if (colName === null) {
      return NextResponse.json(
        { error: 'Excel dosyasinda "Firma Adi" sutunu bulunamadi' },
        { status: 400 }
      );
    }

    // Parse rows
    const errors: string[] = [];
    const rowsToProcess: Array<{
      name: string;
      type: CompanyTypeValue;
      address: string | null;
      taxNumber: string | null;
      phone: string | null;
      email: string | null;
    }> = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const name = cellToString(row.getCell(colName).value);
      if (!name) {
        // Skip empty rows silently
        return;
      }

      const typeRaw = colType ? cellToString(row.getCell(colType).value) : '';
      const type = typeRaw ? normalizeCompanyType(typeRaw) : 'CLIENT';

      if (type === null) {
        errors.push(`Satir ${rowNumber}: Gecersiz firma tipi "${typeRaw}".`);
        return;
      }

      rowsToProcess.push({
        name,
        type,
        address: colAddress ? cellToString(row.getCell(colAddress).value) || null : null,
        taxNumber: colTaxNumber ? cellToString(row.getCell(colTaxNumber).value) || null : null,
        phone: colPhone ? cellToString(row.getCell(colPhone).value) || null : null,
        email: colEmail ? cellToString(row.getCell(colEmail).value) || null : null,
      });
    });

    if (errors.length > 0) {
      return NextResponse.json(
        { error: errors.join('\n') },
        { status: 400 }
      );
    }

    if (rowsToProcess.length === 0) {
      return NextResponse.json(
        { error: 'Excel dosyasinda iceri aktarilabilecek firma bulunamadi' },
        { status: 400 }
      );
    }

    // Fetch existing companies by name for upsert matching
    const existingCompanies = await db.company.findMany({
      select: { id: true, name: true },
    });
    const existingByName = new Map(
      existingCompanies.map((c) => [c.name.toLowerCase(), c.id])
    );

    let created = 0;
    let updated = 0;

    // Process in a transaction
    await db.$transaction(async (tx) => {
      for (const row of rowsToProcess) {
        const existingId = existingByName.get(row.name.toLowerCase());

        if (existingId) {
          await tx.company.update({
            where: { id: existingId },
            data: {
              type: row.type,
              address: row.address,
              taxNumber: row.taxNumber,
              phone: row.phone,
              email: row.email,
            },
          });
          updated++;
        } else {
          await tx.company.create({
            data: {
              name: row.name,
              type: row.type,
              address: row.address,
              taxNumber: row.taxNumber,
              phone: row.phone,
              email: row.email,
            },
          });
          created++;
        }
      }
    });

    return NextResponse.json({
      message: `${rowsToProcess.length} firma basariyla iceri aktarildi (${created} yeni, ${updated} guncellendi)`,
      created,
      updated,
      total: rowsToProcess.length,
    });
  } catch (error) {
    console.error('Companies import error:', error);
    return NextResponse.json(
      { error: 'Firmalar iceri aktarilirken bir hata olustu' },
      { status: 500 }
    );
  }
}
