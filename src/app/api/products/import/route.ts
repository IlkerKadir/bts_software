import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { parseProductExcel, generateImportPreview } from '@/lib/product-import';
import { validateImportFilename } from './validate';

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canEditProducts) {
      return NextResponse.json(
        { error: 'Ürün düzenleme yetkiniz yok' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const action = formData.get('action') as string; // 'preview' or 'confirm'

    if (!file) {
      return NextResponse.json(
        { error: 'Dosya yüklenmedi' },
        { status: 400 }
      );
    }

    // Validate file extension strictly (always check, regardless of MIME type)
    if (!validateImportFilename(file.name)) {
      return NextResponse.json(
        { error: 'Geçersiz dosya formatı. Lütfen Excel (.xlsx) dosyası yükleyin.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const importedProducts = await parseProductExcel(buffer);

    if (importedProducts.length === 0) {
      return NextResponse.json(
        { error: 'Excel dosyasında içe aktarılabilecek ürün bulunamadı' },
        { status: 400 }
      );
    }

    if (action === 'preview') {
      // Get existing products for comparison
      const existingProducts = await db.product.findMany({
        select: { code: true, listPrice: true, currency: true },
      });

      const preview = await generateImportPreview(
        importedProducts,
        existingProducts.map((p) => ({
          code: p.code,
          listPrice: Number(p.listPrice),
          currency: p.currency,
        }))
      );

      return NextResponse.json({ preview });
    }

    if (action === 'confirm') {
      let created = 0;
      let updated = 0;

      await db.$transaction(async (tx) => {
        for (const product of importedProducts) {
          // Find or create brand
          let brand = null;
          if (product.brandName) {
            brand = await tx.productBrand.findUnique({
              where: { name: product.brandName },
            });
            if (!brand) {
              brand = await tx.productBrand.create({
                data: { name: product.brandName },
              });
            }
          }

          // Find or create category
          let category = null;
          if (product.categoryName) {
            category = await tx.productCategory.findUnique({
              where: { name: product.categoryName },
            });
            if (!category) {
              category = await tx.productCategory.create({
                data: { name: product.categoryName },
              });
            }
          }

          const existing = await tx.product.findUnique({
            where: { code: product.code },
          });

          const productName = product.nameEn || product.nameTr || product.code;

          if (existing) {
            await tx.product.update({
              where: { code: product.code },
              data: {
                shortCode: product.shortCode || existing.shortCode,
                brandId: brand?.id ?? existing.brandId,
                categoryId: category?.id ?? existing.categoryId,
                model: product.model || existing.model,
                name: productName,
                nameTr: product.nameTr || existing.nameTr,
                nameEn: product.nameEn || existing.nameEn,
                unit: product.unit || existing.unit,
                listPrice: product.listPrice,
                costPrice: product.costPrice > 0 ? product.costPrice : existing.costPrice,
                currency: product.currency,
                supplier: product.supplier || existing.supplier,
              },
            });
            updated++;
          } else {
            await tx.product.create({
              data: {
                code: product.code,
                shortCode: product.shortCode || null,
                brandId: brand?.id ?? null,
                categoryId: category?.id ?? null,
                model: product.model || null,
                name: productName,
                nameTr: product.nameTr || null,
                nameEn: product.nameEn || null,
                unit: product.unit || 'Adet',
                listPrice: product.listPrice,
                costPrice: product.costPrice > 0 ? product.costPrice : null,
                currency: product.currency,
                supplier: product.supplier || null,
              },
            });
            created++;
          }
        }
      }, { timeout: 120000 }); // 2 minutes for large imports (2500+ products)

      return NextResponse.json({
        message: `İçe aktarma tamamlandı: ${created} yeni, ${updated} güncellendi`,
        created,
        updated,
        total: importedProducts.length,
      });
    }

    return NextResponse.json(
      { error: 'Geçersiz işlem. "preview" veya "confirm" kullanın.' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Product import error:', error);

    // Return more specific error messages for known parsing errors
    if (error instanceof Error) {
      if (
        error.message.includes('başlık satırı bulunamadı') ||
        error.message.includes('çalışma sayfası bulunamadı')
      ) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Ürün içe aktarma sırasında bir hata oluştu' },
      { status: 500 }
    );
  }
}
