'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface DocumentTagProps {
  name: string | null;
  category?: string | null;
}

export function DocumentTag({ name, category }: DocumentTagProps) {
  const display = name
    ? name.replace(/[^A-Za-z0-9]+/g, '_')
    : category
    ? `Category: ${category}`
    : null;

  if (!display) return null;
  return (
    <div
      className={cn(
        'w-full max-w-3xl truncate rounded-md border border-blue-800 bg-blue-900/40 px-3 py-2 text-sm font-medium text-blue-200 shadow-sm'
      )}
      aria-live="polite"
    >
      {display}
    </div>
  );
}
