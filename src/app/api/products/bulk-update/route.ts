import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';

const bulkUpdateSchema = z.object({
  productIds: z.array(z.string()).min(1),
  operation: z.enum(['increase', 'decrease', 'set']),
  value: z.number().min(0),
  field: z.enum(['listPrice']),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permission
    if (!user.role.canEditProducts) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = bulkUpdateSchema.parse(body);

    const products = await db.product.findMany({
      where: { id: { in: data.productIds } },
      select: { id: true, listPrice: true, name: true },
    });

    if (products.length === 0) {
      return NextResponse.json(
        { error: 'Güncellenecek ürün bulunamadı' },
        { status: 404 }
      );
    }

    // Calculate new prices
    const updates = products.map((product) => {
      const currentPrice = Number(product.listPrice);
      let newPrice: number;

      if (data.operation === 'increase') {
        newPrice = currentPrice * (1 + data.value / 100);
      } else if (data.operation === 'decrease') {
        newPrice = currentPrice * (1 - data.value / 100);
      } else {
        newPrice = data.value;
      }

      return {
        id: product.id,
        name: product.name,
        oldPrice: currentPrice,
        newPrice: Math.round(newPrice * 100) / 100,
      };
    });

    // Update products
    for (const update of updates) {
      await db.product.update({
        where: { id: update.id },
        data: { listPrice: update.newPrice },
      });
    }

    return NextResponse.json({
      message: `${updates.length} ürün güncellendi`,
      updates,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Bulk update error:', error);
    return NextResponse.json(
      { error: 'Toplu güncelleme sırasında bir hata oluştu' },
      { status: 500 }
    );
  }
}

// GET - Preview updates without applying
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canEditProducts) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = bulkUpdateSchema.parse(body);

    const products = await db.product.findMany({
      where: { id: { in: data.productIds } },
      select: { id: true, listPrice: true, name: true, code: true },
    });

    // Calculate preview
    const preview = products.map((product) => {
      const currentPrice = Number(product.listPrice);
      let newPrice: number;

      if (data.operation === 'increase') {
        newPrice = currentPrice * (1 + data.value / 100);
      } else if (data.operation === 'decrease') {
        newPrice = currentPrice * (1 - data.value / 100);
      } else {
        newPrice = data.value;
      }

      return {
        id: product.id,
        code: product.code,
        name: product.name,
        oldPrice: currentPrice,
        newPrice: Math.round(newPrice * 100) / 100,
        change: Math.round((newPrice - currentPrice) * 100) / 100,
        changePercent: currentPrice > 0
          ? Math.round(((newPrice - currentPrice) / currentPrice) * 10000) / 100
          : 0,
      };
    });

    return NextResponse.json({ preview });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Önizleme sırasında bir hata oluştu' },
      { status: 500 }
    );
  }
}
