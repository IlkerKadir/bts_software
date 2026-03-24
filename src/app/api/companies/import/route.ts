import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import ExcelJS from 'exceljs';

/**
 * Normalize a type string from the Excel file to a valid CompanyType.
 * Accepts Turkish labels (MUSTERI, IS ORTAGI, MÜŞTERI, İŞ ORTAĞI)
 * as well as enum values (CLIENT, PARTNER).
 */
function normalizeCompanyType(raw: string): 'CLIENT' | 'PARTNER' | null {
  const value = raw.trim().toUpperCase();

  if (
    value === 'CLIENT' ||
    value === 'MUSTERI' ||
    value === 'MÜŞTERİ' ||
    value === 'MÜSTERI'
  ) {
    return 'CLIENT';
  }

  if (
    value === 'PARTNER' ||
    value === 'IS ORTAGI' ||
    value === 'İŞ ORTAĞI' ||
    value === 'İŞ ORTAGI' ||
    value === 'IS ORTAĞI'
  ) {
    return 'PARTNER';
  }

  return null;
}

function cellToString(cell: ExcelJS.CellValue): string {
  if (cell === null || cell === undefined) return '';
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
      type: 'CLIENT' | 'PARTNER';
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
        errors.push(`Satir ${rowNumber}: Gecersiz firma tipi "${typeRaw}". CLIENT veya PARTNER olmali.`);
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
