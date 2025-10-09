'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ChatHeaderProps {
  className?: string;
}

export function ChatHeader({ className }: ChatHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Sharon</h1>
        <p className="mt-1 text-sm text-[#9aa3af]">
          Chat with your documents and get instant, document-aware insights.
        </p>
      </div>
    </header>
  );
}
