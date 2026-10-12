import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

/**
 * Bulk delete / deactivate for the product list (client 10.2026).
 *
 * action 'delete': deletes the selected products that were never used.
 *   "Used" = referenced by a quote item OR by price history. PriceHistory
 *   has ON DELETE RESTRICT, so deleting such a product would fail anyway —
 *   and a product can have history with zero quote items (sent quote later
 *   cancelled/deleted). Used products are skipped and returned as `blocked`
 *   so the UI can offer to make them passive instead.
 * action 'deactivate': sets isActive=false on the given products.
 */
const schema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(['delete', 'deactivate']),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 });
    }
    const { productIds, action } = parsed.data;

    if (action === 'deactivate') {
      // Making a product passive is less destructive than deleting it, so
      // a user who may delete products may also deactivate them.
      if (!user.role.canEditProducts && !user.role.canDeleteProducts) {
        return NextResponse.json({ error: 'Bu işlem için yetkiniz bulunmuyor' }, { status: 403 });
      }
      const result = await db.product.updateMany({
        where: { id: { in: productIds } },
        data: { isActive: false },
      });
      return NextResponse.json({ deactivated: result.count });
    }

    if (!user.role.canDeleteProducts) {
      return NextResponse.json({ error: 'Ürün silme yetkiniz bulunmuyor' }, { status: 403 });
    }

    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        code: true,
        name: true,
        _count: { select: { quoteItems: true, priceHistory: true } },
      },
    });

    const blocked = products
      .filter((p) => p._count.quoteItems > 0 || p._count.priceHistory > 0)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        quoteItemCount: p._count.quoteItems,
      }));
    const deletableIds = products
      .filter((p) => p._count.quoteItems === 0 && p._count.priceHistory === 0)
      .map((p) => p.id);

    // Re-check usage inside the delete itself so a quote created between
    // the read above and this write can't lose its product.
    const result = deletableIds.length
      ? await db.product.deleteMany({
          where: {
            id: { in: deletableIds },
            quoteItems: { none: {} },
            priceHistory: { none: {} },
          },
        })
      : { count: 0 };

    // A product that became used between the read and the delete was
    // skipped by the re-check — report it as blocked too.
    if (result.count < deletableIds.length) {
      const stillThere = await db.product.findMany({
        where: { id: { in: deletableIds } },
        select: { id: true, code: true, name: true, _count: { select: { quoteItems: true } } },
      });
      for (const p of stillThere) {
        blocked.push({ id: p.id, code: p.code, name: p.name, quoteItemCount: p._count.quoteItems });
      }
    }

    return NextResponse.json({ deleted: result.count, blocked });
  } catch (error) {
    console.error('Products bulk-delete error:', error);
    return NextResponse.json({ error: 'Ürünler silinirken bir hata oluştu' }, { status: 500 });
  }
}
