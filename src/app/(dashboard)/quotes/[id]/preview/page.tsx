'use client';

import { use } from 'react';
import { QuotePdfEditor } from '@/components/quotes/QuotePdfEditor';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function QuotePreviewPage({ params }: PageProps) {
  const { id } = use(params);
  return <QuotePdfEditor quoteId={id} />;
}
