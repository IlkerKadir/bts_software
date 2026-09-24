import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productSchema } from '@/lib/validations/product';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const product = await db.product.findUnique({
      where: { id },
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 });
    }

    // Hide cost price if user doesn't have permission
    const productFiltered = {
      ...product,
      costPrice: user.role.canViewCosts ? product.costPrice : null,
    };

    return NextResponse.json({ product: productFiltered });
  } catch (error) {
    console.error('Product GET error:', error);
    return NextResponse.json(
      { error: 'Ürün alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!user.role.canEditProducts) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = productSchema.parse(body);

    const existingProduct = await db.product.findUnique({ where: { id } });
    if (!existingProduct) {
      return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 });
    }

    // Check if code is being changed and if it's already in use
    if (validatedData.code !== existingProduct.code) {
      const codeExists = await db.product.findUnique({
        where: { code: validatedData.code },
      });
      if (codeExists) {
        return NextResponse.json(
          { error: 'Bu ürün kodu zaten kullanımda' },
          { status: 400 }
        );
      }
    }

    // Keep `nameTr` in step with `name` while it was never customized
    // (null or identical to the old name) and the caller didn't change it
    // themselves — quotes read `nameTr` first, so a renamed Ürün Adı must
    // reach them (client 02.09). Same rule as the form's live mirroring.
    // Blank ('' / whitespace) counts as empty — older form saves stored ''.
    const blank = (v: string | null | undefined) => v == null || !v.trim();
    const nameChanged = validatedData.name !== existingProduct.name;
    const trWasSynced =
      blank(existingProduct.nameTr) || existingProduct.nameTr === existingProduct.name;
    const callerLeftTrAlone =
      blank(validatedData.nameTr) || validatedData.nameTr === existingProduct.nameTr;
    const data =
      nameChanged && trWasSynced && callerLeftTrAlone
        ? { ...validatedData, nameTr: validatedData.name }
        : // Never persist '' — normalize a blank Türkçe Adı to null so the
          // quote seeding fallback (`nameTr || name`) and this rule stay clean.
          { ...validatedData, nameTr: blank(validatedData.nameTr) ? null : validatedData.nameTr };

    const product = await db.product.update({
      where: { id },
      data,
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error },
        { status: 400 }
      );
    }
    console.error('Product PUT error:', error);
    return NextResponse.json(
      { error: 'Ürün güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Product-catalog deletes use a dedicated permission. The general
    // `canDelete` flag covers quotes/companies/projects/etc. but NOT
    // products — product rows are master-catalog data that survives
    // beyond any one quote, so removal is gated separately.
    if (!user.role.canDeleteProducts) {
      return NextResponse.json(
        { error: 'Ürün silme yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existingProduct = await db.product.findUnique({
      where: { id },
      include: {
        _count: { select: { quoteItems: true } },
      },
    });

    if (!existingProduct) {
      return NextResponse.json({ error: 'Ürün bulunamadı' }, { status: 404 });
    }

    // Check if product is used in quotes
    if (existingProduct._count.quoteItems > 0) {
      return NextResponse.json(
        { error: 'Bu ürün tekliflerde kullanıldığı için silinemez. Ürünü pasif yapabilirsiniz.' },
        { status: 400 }
      );
    }

    await db.product.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Product DELETE error:', error);
    return NextResponse.json(
      { error: 'Ürün silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
