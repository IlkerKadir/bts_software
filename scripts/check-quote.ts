import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const q = await db.quote.findFirst({
    where: { quoteNumber: 'LC0002-YAS.1' },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!q) { console.log('not found'); return; }
  console.log('QUOTE:', q.id, q.quoteNumber);
  console.log('persisted subtotal=', q.subtotal.toString(), 'discountTotal=', q.discountTotal.toString(), 'grandTotal=', q.grandTotal.toString());
  console.log('discountPct=', q.discountPct.toString());
  console.log('updatedAt=', q.updatedAt);
  console.log();
  console.log('ITEMS (top-level only):');
  let sumProduct = 0;
  let sumLabeledProduct = 0;
  console.log('raw item count =', q.items.length, 'top-level =', q.items.filter(i => !i.parentItemId).length);
  const dts = q.items.filter(i => i.description?.startsWith('DTS-FL3-AD8'));
  console.log('DTS-FL3-AD8 rows:', dts.length);
  for (const d of dts) {
    console.log('  id=', d.id, 'sortOrder=', d.sortOrder, 'totalPrice=', d.totalPrice.toString(), 'updatedAt=', d.updatedAt, 'createdAt=', d.createdAt);
  }
  console.log();
  for (const it of q.items.filter(i => !i.parentItemId)) {
    const t = Number(it.totalPrice);
    const up = Number(it.unitPrice);
    const qty = Number(it.quantity);
    const computed = qty * up * (1 - Number(it.discountPct) / 100);
    const mismatch = Math.abs(t - computed) > 0.005 ? '  ** MISMATCH' : '';
    console.log(`  ${it.sortOrder} [${it.itemType}] up=${up} qty=${qty} stored=${t} computed=${computed.toFixed(2)}${mismatch} desc="${it.description.slice(0,40)}"`);
    if ((it.itemType === 'PRODUCT' || it.itemType === 'CUSTOM' || it.itemType === 'SET')) {
      if (it.priceLabel) sumLabeledProduct += t;
      else sumProduct += t;
    }
  }
  console.log();
  console.log('  priced-product sum (excluding priceLabel rows) =', sumProduct.toFixed(2));
  console.log('  priceLabel-product sum (excluded from total)    =', sumLabeledProduct.toFixed(2));
  console.log('  priced + labeled                                 =', (sumProduct + sumLabeledProduct).toFixed(2));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
