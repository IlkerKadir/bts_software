'use client';

import { use } from 'react';
import { QuoteEditor } from './QuoteEditor';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function QuoteEditPage({ params }: PageProps) {
  const { id } = use(params);

  return <QuoteEditor quoteId={id} />;
}
