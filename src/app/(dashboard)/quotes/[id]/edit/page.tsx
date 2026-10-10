'use client';

import { use } from 'react';
import { QuoteEditor } from './QuoteEditor';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function QuoteEditPage({ params }: PageProps) {
  const { id } = use(params);

  // key: never carry one quote's editor state (incl. undo history) into another
  return <QuoteEditor key={id} quoteId={id} />;
}
